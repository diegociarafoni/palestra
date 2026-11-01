import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/api/app";
import type { Db } from "../../src/db/types";
import type { PlannedSlot } from "../../src/domain/planning";
import { updateSlot } from "../../src/store/planning";
import { createTestSigner, OTHER_EMAIL, TEST_ENV } from "./jwt";
import { seedSlots } from "./seed";

const signer = await createTestSigner();
const app = createApp({ jwks: signer.jwks, today: () => "2026-11-10" });
const bindings = { ...TEST_ENV, DB: env.DB };

// Modello di esempio del Task 4b (fittizio): slot 1 martedì o mercoledì (giorno A), slot 2
// giovedì (giorno B); lunedì e venerdì non disponibili.
const TEMPLATE = {
  slots: [
    { slot: 1, days: ["tue", "wed"], scheda_day: "A" },
    { slot: 2, days: ["thu"], scheda_day: "B" },
  ],
  unavailable: ["mon", "fri"],
};

// Settimana 2026-W45 (da lunedì 2/11 a domenica 8/11): slot 1 programmato, slot 2 scaduto.
const OPEN: PlannedSlot = {
  id: "2026-W45-1",
  week: "2026-W45",
  slot: 1,
  window: ["2026-11-03", "2026-11-04"],
  date: null,
  scheda_day: "A",
  status: "programmata",
  reason: null,
  session_id: null,
};
const OVERDUE: PlannedSlot = {
  id: "2026-W45-2",
  week: "2026-W45",
  slot: 2,
  window: ["2026-11-05"],
  date: null,
  scheda_day: "B",
  status: "da_confermare",
  reason: null,
  session_id: null,
};

async function seedTemplate(): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO profile (key, json) VALUES ('settimana_tipo', ?1)",
  )
    .bind(JSON.stringify(TEMPLATE))
    .run();
}

/** PATCH /api/slots/:id con il corpo in JSON e un token firmato all'ora corrente. */
async function patch(id: string, body: unknown) {
  return app.request(
    `/api/slots/${id}`,
    {
      method: "PATCH",
      headers: {
        "Cf-Access-Jwt-Assertion": await signer.sign(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    bindings,
  );
}

async function rows(sql: string): Promise<unknown[]> {
  return (await env.DB.prepare(sql).all()).results;
}

describe("slots", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("slots: mark skipped with reason", async () => {
    await seedTemplate();
    await seedSlots(env.DB, [OPEN, OVERDUE]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T19:00:00Z"));
    const res = await patch("2026-W45-2", {
      status: "saltata",
      reason: "lavoro",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      ...OVERDUE,
      status: "saltata",
      reason: "lavoro",
    });

    expect(
      await rows("SELECT id, status, reason FROM planned_sessions ORDER BY id"),
    ).toEqual([
      { id: "2026-W45-1", status: "programmata", reason: null },
      { id: "2026-W45-2", status: "saltata", reason: "lavoro" },
    ]);
    expect(
      await rows(
        "SELECT at, actor, table_name, row_key, action FROM audit ORDER BY id",
      ),
    ).toEqual([
      {
        at: "2026-11-06T19:00:00.000Z",
        actor: "utente@example.com",
        table_name: "planned_sessions",
        row_key: "2026-W45-2",
        action: "update",
      },
    ]);
  });

  it("slots: mark skipped without reason", async () => {
    await seedSlots(env.DB, [OVERDUE]);
    // Il motivo è facoltativo; una nuova conferma sostituisce il motivo di prima.
    const first = await patch("2026-W45-2", {
      status: "saltata",
      reason: "fastidio",
    });
    expect(first.status).toBe(200);
    const second = await patch("2026-W45-2", { status: "saltata" });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      ...OVERDUE,
      status: "saltata",
      reason: null,
    });
    expect(await rows("SELECT row_key, action FROM audit ORDER BY id")).toEqual(
      [
        { row_key: "2026-W45-2", action: "update" },
        { row_key: "2026-W45-2", action: "update" },
      ],
    );
  });

  it("slots: rejects invalid body", async () => {
    await seedTemplate();
    await seedSlots(env.DB, [OVERDUE]);
    for (const body of [
      {},
      { status: "fatta" },
      { status: "saltata", reason: "pioggia" },
      { status: "saltata", reason: "lavoro", date: "2026-11-07" },
      { date: "2026-11-07", session_id: "sess-d05" },
      { date: "7/11/2026" },
      { date: null },
    ]) {
      const res = await patch("2026-W45-2", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.text()).toBe('{"error":"bad_request"}');
    }
    // Corpo valido ma non dichiarato JSON.
    const plain = await app.request(
      "/api/slots/2026-W45-2",
      {
        method: "PATCH",
        headers: {
          "Cf-Access-Jwt-Assertion": await signer.sign(),
          "Content-Type": "text/plain",
        },
        body: JSON.stringify({ status: "saltata" }),
      },
      bindings,
    );
    expect(plain.status).toBe(400);
    expect(await rows("SELECT status, date FROM planned_sessions")).toEqual([
      { status: "da_confermare", date: null },
    ]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);
  });

  it("slots: requires access", async () => {
    await seedSlots(env.DB, [OVERDUE]);
    const init = {
      method: "PATCH",
      body: JSON.stringify({ status: "saltata" }),
    };
    const json = { "Content-Type": "application/json" };
    const anonymous = await app.request(
      "/api/slots/2026-W45-2",
      { ...init, headers: json },
      bindings,
    );
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).toBe('{"error":"unauthorized"}');
    const foreign = await app.request(
      "/api/slots/2026-W45-2",
      {
        ...init,
        headers: {
          ...json,
          "Cf-Access-Jwt-Assertion": await signer.sign({ email: OTHER_EMAIL }),
        },
      },
      bindings,
    );
    expect(foreign.status).toBe(403);
    expect(await rows("SELECT status FROM planned_sessions")).toEqual([
      { status: "da_confermare" },
    ]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);
  });

  it("slots: rejects date on monday", async () => {
    await seedTemplate();
    await seedSlots(env.DB, [OPEN]);
    // Mercoledì 4/11 è nella finestra dello slot 1: si può scegliere.
    const wednesday = await patch("2026-W45-1", { date: "2026-11-04" });
    expect(wednesday.status).toBe(200);
    expect(await wednesday.json()).toEqual({ ...OPEN, date: "2026-11-04" });

    // Lunedì 2/11: fuori dalla finestra e non disponibile nel modello.
    const monday = await patch("2026-W45-1", { date: "2026-11-02" });
    expect(monday.status).toBe(400);
    expect(await monday.text()).toBe('{"error":"bad_request"}');
    expect(monday.headers.get("Cache-Control")).toBe("no-store");
    expect(await rows("SELECT id, date, status FROM planned_sessions")).toEqual(
      [{ id: "2026-W45-1", date: "2026-11-04", status: "programmata" }],
    );
    expect(await rows("SELECT row_key, action FROM audit")).toEqual([
      { row_key: "2026-W45-1", action: "update" },
    ]);
  });

  it("slots: chooses a weekend day of the same week unless unavailable", async () => {
    await seedTemplate();
    await seedSlots(env.DB, [OPEN, OVERDUE]);
    // Sabato 7/11 e domenica 8/11 chiudono la settimana 2026-W45: ammessi, anche per uno slot
    // da confermare.
    for (const [id, date] of [
      ["2026-W45-1", "2026-11-07"],
      ["2026-W45-2", "2026-11-08"],
    ] as const) {
      const res = await patch(id, { date });
      expect(res.status, `${id} ${date}`).toBe(200);
    }
    // Venerdì 6/11 (non disponibile) e sabato 14/11 (settimana dopo): no.
    for (const date of ["2026-11-06", "2026-11-14", "2026-11-01"]) {
      const res = await patch("2026-W45-1", { date });
      expect(res.status, date).toBe(400);
    }
    expect(
      await rows("SELECT id, date, status FROM planned_sessions ORDER BY id"),
    ).toEqual([
      { id: "2026-W45-1", date: "2026-11-07", status: "programmata" },
      { id: "2026-W45-2", date: "2026-11-08", status: "da_confermare" },
    ]);

    // Variante sintetica: domenica non disponibile, solo per provare l'esclusione.
    await env.DB.prepare(
      "UPDATE profile SET json = ?1 WHERE key = 'settimana_tipo'",
    )
      .bind(JSON.stringify({ ...TEMPLATE, unavailable: ["mon", "fri", "sun"] }))
      .run();
    const sunday = await patch("2026-W45-1", { date: "2026-11-08" });
    expect(sunday.status).toBe(400);
    const tuesday = await patch("2026-W45-1", { date: "2026-11-03" });
    expect(tuesday.status).toBe(200);
    expect(await rows("SELECT row_key FROM audit ORDER BY id")).toEqual([
      { row_key: "2026-W45-1" },
      { row_key: "2026-W45-2" },
      { row_key: "2026-W45-1" },
    ]);
  });

  it("slots: rejects missing slots and slots with a seduta", async () => {
    await seedTemplate();
    // Stati della sync: fatta e spostata hanno la seduta. Lo slot 3 (fittizio) ha la seduta pur
    // essendo programmata: conta la seduta, che la sync non riabbina.
    const withSession: PlannedSlot[] = [
      { ...OPEN, status: "fatta", session_id: "sess-d02" },
      { ...OVERDUE, status: "spostata", session_id: "sess-d05" },
      { ...OPEN, id: "2026-W45-3", slot: 3, session_id: "sess-d06" },
    ];
    await seedSlots(env.DB, withSession);
    for (const body of [
      { status: "saltata", reason: "lavoro" },
      { date: "2026-11-07" },
    ]) {
      for (const { id } of withSession) {
        const res = await patch(id, body);
        expect(res.status, `${id} ${JSON.stringify(body)}`).toBe(409);
        expect(await res.text()).toBe('{"error":"conflict"}');
        expect(res.headers.get("Cache-Control")).toBe("no-store");
      }
      const missing = await patch("2026-W45-9", body);
      expect(missing.status, JSON.stringify(body)).toBe(404);
      expect(await missing.text()).toBe('{"error":"not_found"}');
    }
    expect(
      await rows(
        "SELECT id, date, status, reason FROM planned_sessions ORDER BY id",
      ),
    ).toEqual([
      { id: "2026-W45-1", date: null, status: "fatta", reason: null },
      { id: "2026-W45-2", date: null, status: "spostata", reason: null },
      { id: "2026-W45-3", date: null, status: "programmata", reason: null },
    ]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);
  });

  it("slots: slot matched meanwhile by the sync is not written", async () => {
    await seedTemplate();
    await seedSlots(env.DB, [OVERDUE]);
    // La sync abbina una seduta allo slot dopo la lettura della rotta e prima della sua
    // scrittura: il D1 locale con una scrittura della sync (la sua funzione) prima del batch.
    const racing: Db = {
      prepare: (sql) => env.DB.prepare(sql),
      batch: async (statements) => {
        await updateSlot(env.DB, "2026-W45-2", {
          status: "fatta",
          session_id: "sess-d05",
          reason: null,
        });
        return env.DB.batch(statements);
      },
    };
    for (const body of [
      { status: "saltata", reason: "stanchezza" },
      { date: "2026-11-07" },
    ]) {
      const res = await app.request(
        "/api/slots/2026-W45-2",
        {
          method: "PATCH",
          headers: {
            "Cf-Access-Jwt-Assertion": await signer.sign(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        { ...bindings, DB: racing },
      );
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(await res.text()).toBe('{"error":"conflict"}');
      // Di nuovo aperto per la prossima forma: la sync lo riabbinerà nel batch.
      await updateSlot(env.DB, "2026-W45-2", {
        status: "da_confermare",
        session_id: null,
      });
    }
    expect(await rows("SELECT id FROM audit")).toEqual([]);
    expect(
      await rows("SELECT date, status, reason FROM planned_sessions"),
    ).toEqual([{ date: null, status: "da_confermare", reason: null }]);
  });
});
