import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/db/types";
import { type Session, SessionSchema } from "../../src/domain/types";
import { ParseError, TransientError } from "../../src/errors";
import { listSlotsByWeek } from "../../src/store/planning";
import { upsertSession } from "../../src/store/sessions";
import { type SyncClient, sync } from "../../src/sync/sync";
// Fixture sintetiche (test/fixtures/mywellness/README.md).
import cardioSeries from "../fixtures/mywellness/cardio_timeseries.json";
import strengthSession from "../fixtures/mywellness/session_strength.json";

afterEach(() => {
  vi.restoreAllMocks();
});

// Modello di esempio del Task 4b (fittizio): slot 1 martedì o mercoledì, slot 2 giovedì.
const TEMPLATE = {
  slots: [
    { slot: 1, days: ["tue", "wed"], scheda_day: "A" },
    { slot: 2, days: ["thu"], scheda_day: "B" },
  ],
  unavailable: ["mon", "fri"],
};

async function saveTemplate(template: unknown = TEMPLATE): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO profile (key, json) VALUES ('settimana_tipo', ?1)",
  )
    .bind(JSON.stringify(template))
    .run();
}

// Seduta grezza minima nel formato di Mywellness, senza esercizi.
function raw(startedOn: string): unknown {
  return {
    data: { startedOn, name: "Seduta libera", physicalActivities: [] },
  };
}

// Tabella delle serie nel formato della pagina di dettaglio forza: una serie.
const SETS_TABLE = `<table>
<tr><th>Serie</th><th>Ripetizioni previste</th><th>Ripetizioni eseguite</th>
<th>Kg previsti</th><th>Kg eseguiti</th><th>Compliance prevista</th><th>Compliance eseguita</th></tr>
<tr><td>1</td><td>10</td><td>9</td><td>45</td><td>45</td><td>100 %</td><td>90 %</td></tr>
</table>`;

// Client finto: sedute nell'ordine dato (id → seduta grezza), pagine di dettaglio facoltative
// e registro delle chiamate.
function fakeClient(
  sessions: [string, unknown][],
  pages: { strength?: string; series?: unknown } = {},
) {
  const calls = {
    list: [] as { since?: string; until?: string }[],
    getSession: [] as string[],
    strength: [] as [string, string][],
    series: [] as [string, string][],
  };
  const byId = new Map(sessions);
  const client: SyncClient = {
    listSessionIds: async (opts = {}) => {
      calls.list.push(opts);
      return [...byId.keys()];
    },
    getSession: async (id) => {
      calls.getSession.push(id);
      return byId.get(id);
    },
    getStrengthDetailHtml: async (activityId, day) => {
      calls.strength.push([activityId, day]);
      if (pages.strength === undefined) {
        throw new Error("dettaglio forza non previsto");
      }
      return pages.strength;
    },
    getCardioTimeseries: async (analyticsId, facilityId) => {
      calls.series.push([analyticsId, facilityId]);
      if (pages.series === undefined) {
        throw new Error("serie temporale non prevista");
      }
      return pages.series;
    },
  };
  return { client, calls };
}

// Seduta già in D1, nel formato normalizzato (scheda/SCHEMA.md § 2).
function stored(id: string, startedAt: string): Session {
  return {
    session_id: id,
    source: "mywellness-api",
    started_at: startedAt,
    ended_at: null,
    name: "Seduta libera",
    program: null,
    moves: null,
    calories_kcal: null,
    duration_s: null,
    exercises: [],
  };
}

describe("sync", () => {
  it("sync: skips known sessions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await upsertSession(
      env.DB,
      stored("abc123", "2026-11-03T18:00:00+01:00"),
      {},
    );
    const { client, calls } = fakeClient([
      ["abc123", raw("2026-11-03 18:00:00 +01:00")],
      ["def456", raw("2026-11-04 18:00:00 +01:00")],
    ]);

    const result = await sync(client, env.DB, { today: "2026-11-05" });

    expect(result.newSessions).toBe(1);
    expect(calls.getSession).toEqual(["def456"]);
    // lookbackDays predefinito: 14 giorni (giovedì 22/10), dal lunedì della settimana.
    expect(calls.list).toEqual([{ since: "2026-10-19", until: "2026-11-05" }]);
    const { results } = await env.DB.prepare(
      "SELECT session_id, date FROM sessions ORDER BY session_id",
    ).all();
    expect(results).toEqual([
      { session_id: "abc123", date: "2026-11-03" },
      { session_id: "def456", date: "2026-11-04" },
    ]);
  });

  it("sync: matches session to slot", async () => {
    await saveTemplate();
    const { client } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
    ]);

    // Da lunedì 2/11 a martedì 3/11: solo la settimana 2026-W45.
    const result = await sync(client, env.DB, {
      today: "2026-11-03",
      lookbackDays: 1,
    });

    expect(result).toEqual({ newSessions: 1, slotsUpdated: 1 });
    expect(await listSlotsByWeek(env.DB, "2026-W45")).toEqual([
      {
        id: "2026-W45-1",
        week: "2026-W45",
        slot: 1,
        window: ["2026-11-03", "2026-11-04"],
        date: null,
        scheda_day: "A",
        status: "fatta",
        reason: null,
        session_id: "s-tue",
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
      },
    ]);
  });

  it("sync: marks overdue slots", async () => {
    await saveTemplate();
    const { client } = fakeClient([]);

    // Giovedì 5/11: la finestra dello slot 1 (3–4/11) è finita, quella dello slot 2 no.
    const result = await sync(client, env.DB, {
      today: "2026-11-05",
      lookbackDays: 2,
    });

    expect(result).toEqual({ newSessions: 0, slotsUpdated: 1 });
    const slots = await listSlotsByWeek(env.DB, "2026-W45");
    expect(slots.map((s) => [s.id, s.status, s.session_id])).toEqual([
      ["2026-W45-1", "da_confermare", null],
      ["2026-W45-2", "programmata", null],
    ]);
  });

  it("sync: weekend sessions in date order", async () => {
    await saveTemplate();
    // Il client restituisce prima la seduta più recente (domenica).
    const { client } = fakeClient([
      ["s-sun", raw("2026-11-08 10:00:00 +01:00")],
      ["s-sat", raw("2026-11-07 10:00:00 +01:00")],
    ]);

    const result = await sync(client, env.DB, {
      today: "2026-11-08",
      lookbackDays: 6,
    });

    expect(result).toEqual({ newSessions: 2, slotsUpdated: 2 });
    const slots = await listSlotsByWeek(env.DB, "2026-W45");
    expect(slots.map((s) => [s.id, s.status, s.session_id])).toEqual([
      ["2026-W45-1", "spostata", "s-sat"],
      ["2026-W45-2", "spostata", "s-sun"],
    ]);
  });

  it("sync: idempotent", async () => {
    await saveTemplate();
    const { client, calls } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
    ]);
    const opts = { today: "2026-11-06", lookbackDays: 4 };

    // Prima esecuzione: slot 1 fatto, slot 2 (giovedì 5/11) scaduto.
    expect(await sync(client, env.DB, opts)).toEqual({
      newSessions: 1,
      slotsUpdated: 2,
    });
    const before = await listSlotsByWeek(env.DB, "2026-W45");

    expect(await sync(client, env.DB, opts)).toEqual({
      newSessions: 0,
      slotsUpdated: 0,
    });
    expect(calls.getSession).toEqual(["s-tue"]);
    expect(await listSlotsByWeek(env.DB, "2026-W45")).toEqual(before);
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sessions",
    ).all();
    expect(results).toEqual([{ n: 1 }]);
  });

  it("sync: fetches strength details and cardio series", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = fakeClient([["910000002", strengthSession]], {
      strength: SETS_TABLE,
      series: cardioSeries,
    });

    const result = await sync(client, env.DB, {
      today: "2026-11-06",
      lookbackDays: 1,
    });

    expect(result).toEqual({ newSessions: 1, slotsUpdated: 0 });
    // Pagina di dettaglio solo per la Leg Press, con dati registrati dall'attrezzo; la Chest
    // Press, senza dati (registrata a mano), non ne ha.
    expect(calls.strength).toEqual([
      ["00000000-0000-4000-a000-000000000202", "2026-11-06"],
    ]);
    expect(calls.series).toEqual([
      [
        "00000000-0000-4000-a000-00000000a201",
        "00000000-0000-4000-a000-0000000000f1",
      ],
    ]);
    // La serie temporale del cardio (esercizio 1) si salva per ordine dell'esercizio.
    const series = await env.DB.prepare(
      "SELECT session_id, ord, json FROM timeseries",
    ).all();
    expect(series.results).toEqual([
      { session_id: "910000002", ord: 1, json: JSON.stringify(cardioSeries) },
    ]);
    const json = await env.DB.prepare(
      "SELECT json FROM sessions",
    ).first<string>("json");
    const session = SessionSchema.parse(JSON.parse(json ?? "null"));
    expect(session.exercises.map((e) => [e.order, e.sets])).toEqual([
      [1, []],
      [
        2,
        [
          {
            n: 1,
            reps_target: 10,
            reps_done: 9,
            load_target_kg: 45,
            load_done_kg: 45,
          },
        ],
      ],
      [3, []],
    ]);
  });

  it("sync: missing template stores sessions and skips slots", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
    ]);

    const result = await sync(client, env.DB, {
      today: "2026-11-05",
      lookbackDays: 3,
    });

    expect(result).toEqual({ newSessions: 1, slotsUpdated: 0 });
    const sessions = await env.DB.prepare(
      "SELECT session_id FROM sessions",
    ).all();
    expect(sessions.results).toEqual([{ session_id: "s-tue" }]);
    const slots = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM planned_sessions",
    ).all();
    expect(slots.results).toEqual([{ n: 0 }]);
    // Una nota senza dati: solo la chiave di profilo mancante.
    expect(stderr.mock.calls).toEqual([
      [
        "Modello settimanale assente (profile, settimana_tipo): slot non aggiornati",
      ],
    ]);
  });

  it("sync: fills a skipped slot and clears its reason", async () => {
    await saveTemplate();
    // Slot 1 già confermato come saltato dall'utente; lo slot 2 non esiste ancora.
    await env.DB.prepare(
      `INSERT INTO planned_sessions
         (id, week, slot, window_days, date, scheda_day, status, reason, session_id)
       VALUES ('2026-W45-1', '2026-W45', 1, '["2026-11-03","2026-11-04"]', NULL, 'A',
               'saltata', 'lavoro', NULL)`,
    ).run();
    const { client } = fakeClient([
      ["s-sat", raw("2026-11-07 10:00:00 +01:00")],
    ]);

    const result = await sync(client, env.DB, {
      today: "2026-11-07",
      lookbackDays: 5,
    });

    // Sabato recupera lo slot 1 (la seduta reale prevale sulla conferma); slot 2 scaduto.
    expect(result).toEqual({ newSessions: 1, slotsUpdated: 2 });
    const slots = await listSlotsByWeek(env.DB, "2026-W45");
    expect(slots.map((s) => [s.id, s.status, s.reason, s.session_id])).toEqual([
      ["2026-W45-1", "spostata", null, "s-sat"],
      ["2026-W45-2", "da_confermare", null, null],
    ]);
  });

  it("sync: invalid template writes nothing", async () => {
    const { client, calls } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
    ]);
    const slot = (n: number, days: string[]) => ({
      slot: n,
      days,
      scheda_day: "A",
    });
    for (const slots of [
      // Il fine settimana non si propone mai.
      [slot(1, ["tue", "sat"])],
      [slot(1, ["sun"])],
      // Finestra vuota.
      [slot(1, [])],
      // Numero di slot ripetuto.
      [slot(1, ["tue"]), slot(1, ["thu"])],
    ]) {
      await env.DB.prepare("DELETE FROM profile").run();
      await saveTemplate({ ...TEMPLATE, slots });

      const error = await sync(client, env.DB, {
        today: "2026-11-05",
        lookbackDays: 3,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toBe(
        "D1: dato non conforme in profile (settimana_tipo)",
      );
    }
    // Il modello si legge prima di Mywellness e di ogni scrittura.
    expect(calls.list).toEqual([]);
    const { results } = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM sessions) AS sessions,
              (SELECT COUNT(*) FROM planned_sessions) AS slots`,
    ).all();
    expect(results).toEqual([{ sessions: 0, slots: 0 }]);
  });

  it("sync: unexpected payload writes nothing", async () => {
    await saveTemplate();
    const { client } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
      ["s-wed", { data: { startedOn: "2026-11-04 18:00:00 +01:00" } }],
    ]);

    const error = await sync(client, env.DB, {
      today: "2026-11-05",
      lookbackDays: 3,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toBe(
      "Mywellness: dettaglio seduta non conforme",
    );
    // Nessuna seduta a metà: la prossima sync le riprova tutte e due.
    const { results } = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM sessions) AS sessions,
              (SELECT COUNT(*) FROM planned_sessions) AS slots`,
    ).all();
    expect(results).toEqual([{ sessions: 0, slots: 0 }]);
  });

  it("sync: matches stored sessions after a failed slot step", async () => {
    await saveTemplate();
    const { client } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
    ]);
    const opts = { today: "2026-11-06", lookbackDays: 4 };
    // D1 che fallisce alla prima scrittura su planned_sessions, dopo le sedute.
    let failed = false;
    const flaky: Db = {
      prepare: (sql: string) => {
        if (!failed && /^\s*(INSERT INTO|UPDATE) planned_sessions/.test(sql)) {
          failed = true;
          throw new TransientError("D1: errore simulato");
        }
        return env.DB.prepare(sql);
      },
      batch: env.DB.batch.bind(env.DB),
    };

    await expect(sync(client, flaky, opts)).rejects.toBeInstanceOf(
      TransientError,
    );

    // La seduta è salvata ma nota: la run successiva la abbina comunque.
    expect(await sync(client, env.DB, opts)).toEqual({
      newSessions: 0,
      slotsUpdated: 2,
    });
    const slots = await listSlotsByWeek(env.DB, "2026-W45");
    expect(slots.map((s) => [s.id, s.status, s.session_id])).toEqual([
      ["2026-W45-1", "fatta", "s-tue"],
      ["2026-W45-2", "da_confermare", null],
    ]);
    expect(await sync(client, env.DB, opts)).toEqual({
      newSessions: 0,
      slotsUpdated: 0,
    });
  });

  it("sync: matches stored sessions once the template exists", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
    ]);
    const opts = { today: "2026-11-06", lookbackDays: 4 };
    expect(await sync(client, env.DB, opts)).toEqual({
      newSessions: 1,
      slotsUpdated: 0,
    });

    await saveTemplate();

    expect(await sync(client, env.DB, opts)).toEqual({
      newSessions: 0,
      slotsUpdated: 2,
    });
    const slots = await listSlotsByWeek(env.DB, "2026-W45");
    expect(slots.map((s) => [s.id, s.status, s.session_id])).toEqual([
      ["2026-W45-1", "fatta", "s-tue"],
      ["2026-W45-2", "da_confermare", null],
    ]);
  });

  it("sync: window starts on the monday of its week", async () => {
    await saveTemplate();
    const { client, calls } = fakeClient([
      ["s-tue", raw("2026-11-03 18:00:00 +01:00")],
    ]);

    // Martedì 10/11 meno 6 giorni = mercoledì 4/11 (2026-W45): si parte da lunedì 2/11.
    const result = await sync(client, env.DB, {
      today: "2026-11-10",
      lookbackDays: 6,
    });

    expect(calls.list).toEqual([{ since: "2026-11-02", until: "2026-11-10" }]);
    // La seduta di martedì 3/11 riempie lo slot 1 invece di lasciarlo da confermare.
    expect(result).toEqual({ newSessions: 1, slotsUpdated: 2 });
    const slots = await listSlotsByWeek(env.DB, "2026-W45");
    expect(slots.map((s) => [s.id, s.status, s.session_id])).toEqual([
      ["2026-W45-1", "fatta", "s-tue"],
      ["2026-W45-2", "da_confermare", null],
    ]);
  });
});
