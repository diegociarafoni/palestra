import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Session } from "../../src/domain/types";
import { ParseError } from "../../src/errors";
import {
  knownSessionIds,
  listSessionsByMonth,
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
    const second = session("sess-001", "2026-11-04T10:00:00+01:00", 500);
    await upsertSession(env.DB, first, { 1: [{ t: 0, hr: 90 }] });
    await upsertSession(env.DB, second, { 1: [{ t: 0, hr: 95 }] });

    const sessions = await env.DB.prepare(
      "SELECT session_id, date, started_at, json FROM sessions",
    ).all();
    expect(sessions.results).toEqual([
      {
        session_id: "sess-001",
        date: "2026-11-04",
        started_at: "2026-11-04T10:00:00+01:00",
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

  it.each([
    { label: "broken JSON", json: "{secret-content", cause: SyntaxError },
    {
      label: "schema mismatch",
      json: '{"session_id":"secret-content"}',
      cause: ZodError,
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
      expect((error as Error).cause).toBeInstanceOf(cause);
      expect((error as Error).message).toContain("sessions");
      // Mai id o data della seduta nel messaggio: può finire nei log pubblici.
      for (const leaked of ["sess-bad", "2026-11-02", "secret-content"]) {
        expect((error as Error).message).not.toContain(leaked);
      }
    },
  );
});
