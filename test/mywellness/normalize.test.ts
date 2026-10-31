import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { romeDate } from "../../src/domain/dates";
import { SessionSchema } from "../../src/domain/types";
import { ParseError } from "../../src/errors";
import {
  normalizeSession,
  parseStrengthDetail,
} from "../../src/mywellness/normalize";

// Fixture sintetiche (test/fixtures/mywellness/README.md): id e valori inventati.
const FIXTURES = join(import.meta.dirname, "..", "fixtures", "mywellness");
const text = (name: string): string =>
  readFileSync(join(FIXTURES, name), "utf8");
const json = (name: string): unknown => JSON.parse(text(name));

const RUN_ARTIS_ID = "00000000-0000-4000-a000-000000000102";
const LEG_PRESS_ID = "00000000-0000-4000-a000-000000000202";

function strengthSession(detail: string) {
  return normalizeSession(json("session_strength.json"), {
    sessionId: "910000002",
    strengthDetails: { [LEG_PRESS_ID]: text(detail) },
    timeseries: {},
  });
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("nessuna eccezione");
}

describe("normalize", () => {
  it("normalize: cardio only", () => {
    const session = normalizeSession(json("session_cardio_only.json"), {
      sessionId: "910000001",
      strengthDetails: {},
      timeseries: { [RUN_ARTIS_ID]: json("cardio_timeseries.json") },
    });
    expect(session).toEqual({
      session_id: "910000001",
      source: "mywellness-api",
      started_at: "2026-11-04T10:00:00+01:00",
      ended_at: null,
      name: "Seduta libera",
      program: null,
      moves: 870,
      calories_kcal: 436,
      duration_s: 4612,
      exercises: [
        {
          order: 1,
          name: "Esercizio con obiettivo calorie",
          equipment: "Skillbike",
          kind: "cardio",
          duration_s: 882,
          calories_kcal: 126,
          distance_m: 6000,
          moves: 260,
          compliance_pct: 100,
          sets: [],
        },
        {
          order: 2,
          name: "Camminata in salita",
          equipment: "Run Artis",
          kind: "cardio",
          duration_s: 3730,
          calories_kcal: 310,
          distance_m: 6230,
          moves: 600,
          compliance_pct: null,
          sets: [],
        },
      ],
    });
  });

  it("normalize: strength sets", () => {
    const session = strengthSession("strength_detail.html");
    expect(session).toMatchObject({
      ended_at: "2026-11-06T18:40:12+01:00",
      name: "Seduta libera",
      moves: 240,
    });
    expect(session.exercises[1]).toMatchObject({
      name: "Leg Press",
      kind: "strength",
      compliance_pct: 95,
    });
    expect(session.exercises[1]?.sets).toEqual([
      {
        n: 1,
        reps_target: 12,
        reps_done: 12,
        load_target_kg: 60,
        load_done_kg: 60,
      },
      {
        n: 2,
        reps_target: 12,
        reps_done: 11,
        load_target_kg: 60,
        load_done_kg: 57.5,
      },
      {
        n: 3,
        reps_target: 12,
        reps_done: null,
        load_target_kg: 60,
        load_done_kg: null,
      },
    ]);
    // Esercizio di forza senza pagina di dettaglio: nessuna serie.
    expect(session.exercises[2]).toMatchObject({
      kind: "strength",
      equipment: null,
      sets: [],
    });
  });

  it("normalize: broken html raises ParseError", () => {
    const html = text("strength_detail_broken.html");
    expect(() => parseStrengthDetail(html)).toThrow(ParseError);
    const error = thrown(() => strengthSession("strength_detail_broken.html"));
    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain(LEG_PRESS_ID);
    expect((error as Error).cause).toBeInstanceOf(ParseError);
  });

  it("normalize: rome date", () => {
    expect(romeDate("2026-10-29T23:30:00Z")).toBe("2026-10-30");
  });

  it("normalize: schema keys", () => {
    const session = strengthSession("strength_detail.html");
    expect(Object.keys(session)).toEqual([
      "session_id",
      "source",
      "started_at",
      "ended_at",
      "name",
      "program",
      "moves",
      "calories_kcal",
      "duration_s",
      "exercises",
    ]);
    expect(SessionSchema.parse(session)).toEqual(session);
  });

  it("normalize: unexpected json raises ParseError", () => {
    const ctx = { sessionId: "910000001", strengthDetails: {}, timeseries: {} };
    // startedOn senza offset: formato non documentato.
    const noOffset: unknown = JSON.parse(
      text("session_cardio_only.json").replace("10:00:00 +01:00", "10:00:00"),
    );
    expect(() => normalizeSession(noOffset, ctx)).toThrow(ParseError);
    // Serie temporale senza il riepilogo atteso.
    const brokenSeries = {
      ...ctx,
      timeseries: { [RUN_ARTIS_ID]: { data: 1 } },
    };
    expect(() =>
      normalizeSession(json("session_cardio_only.json"), brokenSeries),
    ).toThrow(ParseError);
  });
});
