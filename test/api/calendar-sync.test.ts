import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/api/app";
import { CalendarResponseSchema } from "../../src/domain/dashboard";
import { upsertFeedback } from "../../src/store/manual";
import { type SyncClient, sync } from "../../src/sync/sync";
import { createTestSigner, TEST_ENV } from "./jwt";

// Guardia contro la deriva delle fixture: il calendario si legge da ciò che scrive la sync vera,
// non da slot scritti a mano. Il primo giro di correzioni nacque da fixture con `date` sugli slot
// fatti, che la sync non scrive mai.

const signer = await createTestSigner();
const token = await signer.sign();
const app = createApp({ jwks: signer.jwks, today: () => "2026-11-05" });
const bindings = { ...TEST_ENV, DB: env.DB };

// Modello di esempio del Task 4b (fittizio): slot 1 martedì o mercoledì, slot 2 giovedì.
const TEMPLATE = {
  slots: [
    { slot: 1, days: ["tue", "wed"], scheda_day: "A" },
    { slot: 2, days: ["thu"], scheda_day: "B" },
  ],
  unavailable: ["mon", "fri"],
};

// Sedute grezze minime nel formato di Mywellness, senza esercizi: domenica 1/11 (recupero di
// uno slot della 2026-W44, settimana di ottobre) e due sedute martedì 3/11.
const RAW: Record<string, unknown> = {
  "s-sun": raw("2026-11-01 10:00:00 +01:00"),
  "s-tue-am": raw("2026-11-03 09:00:00 +01:00"),
  "s-tue-pm": raw("2026-11-03 18:00:00 +01:00"),
};

function raw(startedOn: string): unknown {
  return {
    data: { startedOn, name: "Seduta libera", physicalActivities: [] },
  };
}

// Client finto: tutte le sedute dentro la finestra chiesta (qui la coprono tutte).
const client: SyncClient = {
  listSessionIds: async () => Object.keys(RAW),
  getSession: async (id) => RAW[id],
  getStrengthDetailHtml: async () => {
    throw new Error("dettaglio forza non previsto");
  },
  getCardioTimeseries: async () => {
    throw new Error("serie temporale non prevista");
  },
};

async function getCalendar(month: string) {
  const res = await app.request(
    `/api/calendar?month=${month}`,
    { headers: { "Cf-Access-Jwt-Assertion": token } },
    bindings,
  );
  expect(res.status, month).toBe(200);
  return CalendarResponseSchema.parse(await res.json());
}

describe("api", () => {
  it("api: calendar after the real sync", async () => {
    await env.DB.prepare(
      "INSERT INTO profile (key, json) VALUES ('settimana_tipo', ?1)",
    )
      .bind(JSON.stringify(TEMPLATE))
      .run();
    // Giovedì 5/11, dieci giorni indietro: dal lunedì 26/10 (2026-W44) a oggi (2026-W45).
    expect(
      await sync(client, env.DB, { today: "2026-11-05", lookbackDays: 10 }),
    ).toEqual({ newSessions: 3, slotsUpdated: 3 });
    // Feedback delle tre sedute: 1/11 (unica del giorno) e 3/11, prima e seconda del giorno.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T20:00:00Z"));
    for (const [date, seq, cls] of [
      ["2026-11-01", 1, "buona"],
      ["2026-11-03", 1, "ottima"],
      ["2026-11-03", 2, "pessima"],
    ] as const) {
      await upsertFeedback(
        env.DB,
        { date, seq, class: cls, joint_pain: false },
        "test",
      );
    }
    vi.useRealTimers();

    // Ottobre: gli slot della 2026-W44. La domenica 1/11 recupera il primo slot non fatto
    // (spostata); il secondo è scaduto. Il feedback del 1/11 arriva con ottobre (R30).
    const october = await getCalendar("2026-10");
    expect(october.slots).toEqual([
      {
        id: "2026-W44-1",
        week: "2026-W44",
        slot: 1,
        window: ["2026-10-27", "2026-10-28"],
        date: null,
        scheda_day: "A",
        status: "spostata",
        reason: null,
        session_id: "s-sun",
        session: { date: "2026-11-01", seq: 1 },
      },
      {
        id: "2026-W44-2",
        week: "2026-W44",
        slot: 2,
        window: ["2026-10-29"],
        date: null,
        scheda_day: "B",
        status: "da_confermare",
        reason: null,
        session_id: null,
        session: null,
      },
    ]);
    expect(october.extra).toEqual([]);
    expect(october.feedback.map((f) => [f.date, f.seq, f.class])).toEqual([
      ["2026-11-01", 1, "buona"],
    ]);

    // Novembre: la seduta delle 9:00 è dello slot 1 (prima del giorno), quella delle 18:00 è
    // una extra (seconda del giorno); lo slot 2 di giovedì è ancora da fare.
    const november = await getCalendar("2026-11");
    expect(november.slots).toEqual([
      {
        id: "2026-W45-1",
        week: "2026-W45",
        slot: 1,
        window: ["2026-11-03", "2026-11-04"],
        date: null,
        scheda_day: "A",
        status: "fatta",
        reason: null,
        session_id: "s-tue-am",
        session: { date: "2026-11-03", seq: 1 },
      },
      {
        id: "2026-W45-2",
        week: "2026-W45",
        slot: 2,
        window: ["2026-11-05"],
        date: null,
        scheda_day: "B",
        status: "programmata",
        reason: null,
        session_id: null,
        session: null,
      },
    ]);
    expect(november.extra).toEqual([
      { date: "2026-11-03", name: "Seduta libera", moves: null, seq: 2 },
    ]);
    expect(november.feedback.map((f) => [f.date, f.seq, f.class])).toEqual([
      ["2026-11-01", 1, "buona"],
      ["2026-11-03", 1, "ottima"],
      ["2026-11-03", 2, "pessima"],
    ]);
  });
});
