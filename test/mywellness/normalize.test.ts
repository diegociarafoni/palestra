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
    expect(session).toEqual({
      session_id: "910000002",
      source: "mywellness-api",
      started_at: "2026-11-06T18:05:30+01:00",
      ended_at: "2026-11-06T18:40:12+01:00",
      name: "Seduta libera",
      program: null,
      moves: 240,
      calories_kcal: 107,
      // ended_at − started_at, non la somma degli esercizi (870).
      duration_s: 2082,
      exercises: [
        {
          order: 1,
          name: "Esercizio libero",
          equipment: "Skillbike",
          kind: "cardio",
          duration_s: 480,
          calories_kcal: 62,
          // rawValue 3.214, più preciso di "3,21 km".
          distance_m: 3214,
          moves: 110,
          compliance_pct: null,
          sets: [],
        },
        {
          order: 2,
          name: "Leg Press",
          equipment: "Selection Leg Press",
          kind: "strength",
          duration_s: 390,
          calories_kcal: 45,
          moves: 130,
          compliance_pct: 95,
          sets: [
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
          ],
        },
        {
          // Esercizio di forza senza pagina di dettaglio: nessuna serie.
          order: 3,
          name: "Chest Press",
          equipment: null,
          kind: "strength",
          duration_s: null,
          calories_kcal: null,
          moves: null,
          compliance_pct: null,
          sets: [],
        },
      ],
    });
  });

  it("normalize: broken html raises ParseError", () => {
    const html = text("strength_detail_broken.html");
    expect(() => parseStrengthDetail(html)).toThrow(ParseError);
    const error = thrown(() => strengthSession("strength_detail_broken.html"));
    expect(error).toBeInstanceOf(ParseError);
    // L'esercizio si indica con l'ordine: nessun id Mywellness nei messaggi (log pubblici).
    expect((error as Error).message).toContain("esercizio 2");
    expect((error as Error).message).not.toContain(LEG_PRESS_ID);
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

  it("normalize: unexpected sets table raises ParseError", () => {
    const table = (head: string[], rows: string[][]): string =>
      `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("")}</table>`;
    const head = [
      "Serie",
      "Ripetizioni previste",
      "Ripetizioni eseguite",
      "Kg previsti",
      "Kg eseguiti",
      "Compliance prevista",
      "Compliance eseguita",
    ];
    const row = ["1", "12", "12", "60", "60", "100 %", "100 %"];
    expect(parseStrengthDetail(table(head, [row]))).toEqual([
      {
        n: 1,
        reps_target: 12,
        reps_done: 12,
        load_target_kg: 60,
        load_done_kg: 60,
      },
    ]);
    // Cinque colonne.
    expect(() =>
      parseStrengthDetail(table(head.slice(0, 5), [row.slice(0, 5)])),
    ).toThrow(ParseError);
    // Riga di dati con un numero di celle diverso.
    expect(() => parseStrengthDetail(table(head, [row.slice(0, 6)]))).toThrow(
      ParseError,
    );
    // Colonne in un altro ordine.
    const swapped = [
      "Serie",
      "Ripetizioni eseguite",
      "Ripetizioni previste",
      "Kg previsti",
      "Kg eseguiti",
      "Compliance prevista",
      "Compliance eseguita",
    ];
    expect(() => parseStrengthDetail(table(swapped, [row]))).toThrow(
      ParseError,
    );
    // Tabella senza righe di dati.
    expect(() => parseStrengthDetail(table(head, []))).toThrow(ParseError);
  });
});
