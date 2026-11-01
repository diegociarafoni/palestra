import { env } from "cloudflare:workers";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Session } from "../../src/domain/types";
import { ParseError } from "../../src/errors";
import {
  knownSessionIds,
  listSessionSummaries,
  listSessionsByMonth,
  listUnmatchedSessionSummaries,
  upsertSession,
} from "../../src/store/sessions";

// Seduta sintetica (valori dell'esempio di scheda/SCHEMA.md § 2).
function session(id: string, startedAt: string, moves = 400): Session {
  return {
    session_id: id,
    source: "mywellness-api",
    started_at: startedAt,
    ended_at: null,
    name: "Seduta libera",
    program: null,
    moves,
    calories_kcal: 300,
    duration_s: 2400,
    exercises: [
      {
        order: 1,
        name: "Leg Press",
        equipment: "Selection Leg Press",
        kind: "strength",
        sets: [
          {
            n: 1,
            reps_target: 12,
            reps_done: 12,
            load_target_kg: 60,
            load_done_kg: 60,
          },
        ],
      },
    ],
  };
}

describe("store sessions", () => {
  it("store: upsert session is idempotent", async () => {
    const first = session("sess-001", "2026-11-04T10:00:00+01:00", 400);
    // Orario corretto oltre la mezzanotte di Roma: date e started_at vanno aggiornati.
    const second = session("sess-001", "2026-11-04T23:30:00Z", 500);
    await upsertSession(env.DB, first, { 1: [{ t: 0, hr: 90 }] });
    await upsertSession(env.DB, second, { 1: [{ t: 0, hr: 95 }] });

    const sessions = await env.DB.prepare(
      "SELECT session_id, date, started_at, json FROM sessions",
    ).all();
    expect(sessions.results).toEqual([
      {
        session_id: "sess-001",
        date: "2026-11-05",
        started_at: "2026-11-04T23:30:00Z",
        json: JSON.stringify(second),
      },
    ]);
    const series = await env.DB.prepare(
      "SELECT session_id, ord, json FROM timeseries",
    ).all();
    expect(series.results).toEqual([
      { session_id: "sess-001", ord: 1, json: '[{"t":0,"hr":95}]' },
    ]);
  });

  it("store: known ids within lookback", async () => {
    await upsertSession(
      env.DB,
      session("sess-001", "2026-10-01T10:00:00+02:00"),
      {},
    );
    await upsertSession(
      env.DB,
      session("sess-002", "2026-10-29T18:00:00+01:00"),
      {},
    );
    expect(await knownSessionIds(env.DB, "2026-10-16")).toEqual(
      new Set(["sess-002"]),
    );
    // Estremo incluso.
    expect(await knownSessionIds(env.DB, "2026-10-29")).toEqual(
      new Set(["sess-002"]),
    );
  });

  it("store: sessions by month use rome date", async () => {
    // 23:30Z del 31 ottobre è già il 1° novembre a Roma.
    const november = session("sess-003", "2026-10-31T23:30:00Z");
    // Le 08:00Z precedono le 09:00Z anche se il testo ISO viene dopo.
    const octoberEarly = session("sess-004", "2026-10-15T10:00:00+02:00");
    const octoberLate = session("sess-005", "2026-10-15T09:00:00Z");
    for (const s of [octoberLate, november, octoberEarly]) {
      await upsertSession(env.DB, s, {});
    }
    expect(await listSessionsByMonth(env.DB, "2026-10")).toEqual([
      octoberEarly,
      octoberLate,
    ]);
    expect(await listSessionsByMonth(env.DB, "2026-11")).toEqual([november]);
    expect(await listSessionsByMonth(env.DB, "2026-12")).toEqual([]);
  });

  it("store: session summaries between dates", async () => {
    // Estremi inclusi, sulla data di Roma: 23:30Z di lunedì 2/11 è già martedì 3/11.
    for (const s of [
      { ...session("sess-006", "2026-11-05T19:00:00+01:00", 300), name: "B" },
      session("sess-007", "2026-11-02T23:30:00Z"),
      session("sess-008", "2026-11-01T10:00:00+01:00"),
      session("sess-009", "2026-11-07T10:00:00+01:00"),
      { ...session("sess-010", "2026-11-04T18:00:00+01:00"), moves: null },
    ]) {
      await upsertSession(env.DB, s, {});
    }
    expect(
      await listSessionSummaries(env.DB, "2026-11-03", "2026-11-05"),
    ).toEqual([
      { date: "2026-11-03", name: "Seduta libera", moves: 400 },
      { date: "2026-11-04", name: "Seduta libera", moves: null },
      { date: "2026-11-05", name: "B", moves: 300 },
    ]);
    expect(
      await listSessionSummaries(env.DB, "2026-11-09", "2026-11-15"),
    ).toEqual([]);
  });

  it("store: unmatched session summaries of the month", async () => {
    // Si guardano tutti gli slot: domenica 1/11 recupera lo slot della settimana prima,
    // la cui finestra (29/10) è di ottobre.
    const insert = env.DB.prepare(
      `INSERT INTO planned_sessions (id, week, slot, window_days, scheda_day, status, session_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    );
    await env.DB.batch([
      insert.bind(
        "2026-W44-2",
        "2026-W44",
        2,
        '["2026-10-29"]',
        "B",
        "spostata",
        "sess-011",
      ),
      insert.bind(
        "2026-W45-1",
        "2026-W45",
        1,
        '["2026-11-03","2026-11-04"]',
        "A",
        "fatta",
        "sess-012",
      ),
      insert.bind(
        "2026-W45-2",
        "2026-W45",
        2,
        '["2026-11-05"]',
        "B",
        "programmata",
        null,
      ),
    ]);
    for (const s of [
      session("sess-016", "2026-11-26T19:00:00+01:00", 450),
      session("sess-011", "2026-11-01T10:00:00+01:00"),
      session("sess-012", "2026-11-03T18:00:00+01:00"),
      session("sess-013", "2026-11-04T18:00:00+01:00"),
      session("sess-014", "2026-10-28T18:00:00+01:00"),
      session("sess-015", "2026-12-01T18:00:00+01:00"),
    ]) {
      await upsertSession(env.DB, s, {});
    }
    expect(await listUnmatchedSessionSummaries(env.DB, "2026-11")).toEqual([
      { date: "2026-11-04", name: "Seduta libera", moves: 400 },
      { date: "2026-11-26", name: "Seduta libera", moves: 450 },
    ]);
  });

  it.each([
    // Il SyntaxError di V8 cita il testo ("secret-content" is not valid JSON): niente cause.
    { label: "broken JSON", json: "secret-content", cause: undefined },
    {
      label: "schema mismatch",
      json: '{"session_id":"secret-content"}',
      cause: expect.any(ZodError),
    },
  ])(
    "store: invalid session json raises ParseError ($label)",
    async ({ json, cause }) => {
      await env.DB.prepare(
        "INSERT INTO sessions (session_id, date, started_at, json) VALUES (?1, ?2, ?3, ?4)",
      )
        .bind("sess-bad", "2026-11-02", "2026-11-02T10:00:00+01:00", json)
        .run();
      const error = await listSessionsByMonth(env.DB, "2026-11").catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).cause).toEqual(cause);
      expect(inspect(error)).not.toContain("secret-content");
      // Tabelle svuotate in beforeEach: la riga inserita ha rowid 1.
      expect((error as Error).message).toContain("sessions (rowid 1)");
      // Mai id o data della seduta nel messaggio: può finire nei log pubblici.
      for (const leaked of ["sess-bad", "2026-11-02", "secret-content"]) {
        expect((error as Error).message).not.toContain(leaked);
      }
    },
  );
  it("store: invalid session json in summaries raises ParseError", async () => {
    await env.DB.prepare(
      "INSERT INTO sessions (session_id, date, started_at, json) VALUES (?1, ?2, ?3, ?4)",
    )
      .bind(
        "sess-bad",
        "2026-11-03",
        "2026-11-03T10:00:00+01:00",
        '{"session_id":"secret-content"}',
      )
      .run();
    for (const read of [
      () => listSessionSummaries(env.DB, "2026-11-02", "2026-11-08"),
      () => listUnmatchedSessionSummaries(env.DB, "2026-11"),
    ]) {
      const error = await read().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain("sessions (rowid 1)");
      // Mai id o data della seduta nel messaggio: può finire nei log pubblici.
      for (const leaked of ["sess-bad", "2026-11-03", "secret-content"]) {
        expect((error as Error).message).not.toContain(leaked);
      }
    }
  });
});
