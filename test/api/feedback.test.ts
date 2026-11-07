import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/api/app";
import { createTestSigner, OTHER_EMAIL, TEST_ENV } from "./jwt";

const signer = await createTestSigner();
const app = createApp({ jwks: signer.jwks, today: () => "2026-11-10" });
const bindings = { ...TEST_ENV, DB: env.DB };

/**
 * PUT /api/feedback con il corpo in JSON e un token valido, firmato all'ora corrente: i test
 * spostano l'orologio, e un token firmato prima risulterebbe scaduto.
 */
async function put(body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    "/api/feedback",
    {
      method: "PUT",
      headers: {
        "Cf-Access-Jwt-Assertion": await signer.sign(),
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    },
    bindings,
  );
}

async function rows(sql: string): Promise<unknown[]> {
  return (await env.DB.prepare(sql).all()).results;
}

describe("feedback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("feedback: saves and updates the same seduta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));
    const first = await put({
      date: "2026-11-03",
      class: "buona",
      joint_pain: true,
      joint_where: "ginocchio",
      notes: "Ultima serie pesante",
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(await first.json()).toEqual({
      id: 1,
      planned_id: null,
      session_id: null,
      date: "2026-11-03",
      seq: 1,
      class: "buona",
      joint_pain: true,
      joint_where: "ginocchio",
      notes: "Ultima serie pesante",
      updated_at: "2026-11-03T20:00:00.000Z",
    });

    // Stessa seduta (data e `seq` 1), modificata il giorno dopo: niente fastidio, niente note.
    vi.setSystemTime(new Date("2026-11-04T08:00:00Z"));
    const second = await put({
      date: "2026-11-03",
      seq: 1,
      class: "faticosa",
      joint_pain: false,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      id: 1,
      planned_id: null,
      session_id: null,
      date: "2026-11-03",
      seq: 1,
      class: "faticosa",
      joint_pain: false,
      joint_where: null,
      notes: null,
      updated_at: "2026-11-04T08:00:00.000Z",
    });

    expect(
      await rows("SELECT id, date, seq, class FROM feedback ORDER BY id"),
    ).toEqual([{ id: 1, date: "2026-11-03", seq: 1, class: "faticosa" }]);
    // L'autore dell'audit è l'e-mail del token di Access.
    expect(
      await rows(
        "SELECT at, actor, table_name, row_key, action FROM audit ORDER BY id",
      ),
    ).toEqual([
      {
        at: "2026-11-03T20:00:00.000Z",
        actor: "utente@example.com",
        table_name: "feedback",
        row_key: "2026-11-03/1",
        action: "insert",
      },
      {
        at: "2026-11-04T08:00:00.000Z",
        actor: "utente@example.com",
        table_name: "feedback",
        row_key: "2026-11-03/1",
        action: "update",
      },
    ]);
  });

  it("feedback: second seduta of the same day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));
    const first = await put({
      date: "2026-11-03",
      class: "ottima",
      joint_pain: false,
    });
    expect(first.status).toBe(200);
    const second = await put({
      date: "2026-11-03",
      seq: 2,
      class: "pessima",
      joint_pain: false,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      id: 2,
      date: "2026-11-03",
      seq: 2,
      class: "pessima",
    });

    expect(
      await rows("SELECT id, date, seq, class FROM feedback ORDER BY id"),
    ).toEqual([
      { id: 1, date: "2026-11-03", seq: 1, class: "ottima" },
      { id: 2, date: "2026-11-03", seq: 2, class: "pessima" },
    ]);
    expect(await rows("SELECT row_key, action FROM audit ORDER BY id")).toEqual(
      [
        { row_key: "2026-11-03/1", action: "insert" },
        { row_key: "2026-11-03/2", action: "insert" },
      ],
    );
  });

  it("feedback: rejects invalid class", async () => {
    for (const cls of ["stanco", "Buona", null]) {
      const res = await put({
        date: "2026-11-03",
        class: cls,
        joint_pain: false,
      });
      expect(res.status, String(cls)).toBe(400);
      expect(await res.text()).toBe('{"error":"bad_request"}');
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(await rows("SELECT id FROM feedback")).toEqual([]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);
  });

  it("feedback: rejects future date", async () => {
    // Oggi (Europe/Rome) è il 10/11: l'11/11 è nel futuro, il 10/11 si accetta.
    const future = await put({
      date: "2026-11-11",
      class: "buona",
      joint_pain: false,
    });
    expect(future.status).toBe(400);
    expect(await future.text()).toBe('{"error":"bad_request"}');
    expect(await rows("SELECT id FROM feedback")).toEqual([]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);

    const today = await put({
      date: "2026-11-10",
      class: "buona",
      joint_pain: false,
    });
    expect(today.status).toBe(200);
    expect(await rows("SELECT date FROM feedback")).toEqual([
      { date: "2026-11-10" },
    ]);
  });

  it("feedback: requires access", async () => {
    const body = JSON.stringify({
      date: "2026-11-03",
      class: "buona",
      joint_pain: false,
    });
    const json = { "Content-Type": "application/json" };
    const anonymous = await app.request(
      "/api/feedback",
      { method: "PUT", headers: json, body },
      bindings,
    );
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).toBe('{"error":"unauthorized"}');

    const foreign = await app.request(
      "/api/feedback",
      {
        method: "PUT",
        headers: {
          ...json,
          "Cf-Access-Jwt-Assertion": await signer.sign({ email: OTHER_EMAIL }),
        },
        body,
      },
      bindings,
    );
    expect(foreign.status).toBe(403);
    expect(await foreign.text()).toBe('{"error":"forbidden"}');
    expect(await rows("SELECT id FROM feedback")).toEqual([]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);
  });

  it("feedback: rejects unknown keys and long texts", async () => {
    const valid = { date: "2026-11-03", class: "buona", joint_pain: true };
    for (const body of [
      // Gli id di slot e seduta non vengono dal client.
      { ...valid, planned_id: "2026-W45-1" },
      { ...valid, session_id: "sess-d02" },
      { ...valid, joint_where: "x".repeat(81) },
      { ...valid, notes: "x".repeat(1001) },
      { ...valid, seq: 0 },
      { ...valid, seq: 1.5 },
      { ...valid, seq: "2" },
      { ...valid, date: "03/11/2026" },
      { ...valid, joint_pain: "sì" },
    ]) {
      const res = await put(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.text()).toBe('{"error":"bad_request"}');
    }
    expect(await rows("SELECT id FROM feedback")).toEqual([]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);

    // Ai limiti: 80 caratteri per "dove", 1000 per le note.
    const longest = await put({
      ...valid,
      joint_where: "x".repeat(80),
      notes: "x".repeat(1000),
    });
    expect(longest.status).toBe(200);
  });

  it("feedback: blank texts and where without pain are saved as null", async () => {
    const blank = await put({
      date: "2026-11-03",
      class: "normale",
      joint_pain: true,
      joint_where: "   ",
      notes: "",
    });
    expect(blank.status).toBe(200);
    expect(await blank.json()).toMatchObject({
      joint_pain: true,
      joint_where: null,
      notes: null,
    });

    // Spazi ai bordi tolti; "dove" senza fastidio articolare non si salva.
    const trimmed = await put({
      date: "2026-11-03",
      class: "normale",
      joint_pain: false,
      joint_where: "spalla",
      notes: "  Seduta breve  ",
    });
    expect(trimmed.status).toBe(200);
    expect(await trimmed.json()).toMatchObject({
      joint_pain: false,
      joint_where: null,
      notes: "Seduta breve",
    });
    expect(
      await rows("SELECT joint_pain, joint_where, notes FROM feedback"),
    ).toEqual([{ joint_pain: 0, joint_where: null, notes: "Seduta breve" }]);
  });

  it("feedback: requires a json body", async () => {
    // Un corpo valido ma non dichiarato JSON (come un form di un altro sito) e un JSON rotto.
    const valid = { date: "2026-11-03", class: "buona", joint_pain: false };
    const plain = await put(valid, { "Content-Type": "text/plain" });
    expect(plain.status).toBe(400);
    expect(await plain.text()).toBe('{"error":"bad_request"}');
    const broken = await app.request(
      "/api/feedback",
      {
        method: "PUT",
        headers: {
          "Cf-Access-Jwt-Assertion": await signer.sign(),
          "Content-Type": "application/json",
        },
        body: '{"date": "2026-11-03",',
      },
      bindings,
    );
    expect(broken.status).toBe(400);
    expect(await broken.text()).toBe('{"error":"bad_request"}');
    expect(broken.headers.get("Cache-Control")).toBe("no-store");
    expect(await rows("SELECT id FROM feedback")).toEqual([]);
    expect(await rows("SELECT id FROM audit")).toEqual([]);

    // Nessuna intestazione CORS: un altro sito non ottiene il permesso di scrivere.
    const ok = await put(valid);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
