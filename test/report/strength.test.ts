import { describe, expect, it } from "vitest";
import type { Exercise, Session } from "../../src/domain/types";
import {
  bestSet,
  type Execution,
  e1rmSeries,
  matchExercises,
  strengthTable,
} from "../../src/report/strength";
import { scheda } from "./fixtures";

const SLUGS = [
  "skillbike-warmup",
  "leg-press",
  "chest-press",
  "lat-machine",
  "leg-curl",
  "run-artis-incline-walk",
];

function session(
  session_id: string,
  started_at: string,
  exercises: Exercise[],
): Session {
  return {
    session_id,
    source: "mywellness-api",
    started_at,
    ended_at: null,
    name: "Seduta libera",
    program: null,
    moves: null,
    calories_kcal: null,
    duration_s: null,
    exercises,
  };
}

function strength(
  order: number,
  name: string,
  equipment: string | null,
): Exercise {
  return {
    order,
    name,
    equipment,
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
  };
}

// Esecuzione di forza con un carico per tutte le serie (null = carico non registrato).
function execution(
  session_id: string,
  date: string,
  reps: number[],
  loadKg: number | null,
  equipment = "Selection Leg Press",
): Execution {
  return {
    order: 1,
    name: "Leg Press",
    equipment,
    kind: "strength",
    session_id,
    date,
    sets: reps.map((r, i) => ({
      n: i + 1,
      reps_target: 12,
      reps_done: r,
      load_target_kg: loadKg,
      load_done_kg: loadKg,
    })),
  };
}

// Leg press in 4 sedute con e1RM migliore 84 → 84 → 88,83 → 91 (mai in calo).
const rising = [
  execution("sess-t01", "2026-11-03", [12, 12, 10], 60),
  execution("sess-t02", "2026-11-05", [12, 12, 12], 60),
  execution("sess-t03", "2026-11-10", [11, 10, 10], 65),
  execution("sess-t04", "2026-11-12", [12, 12, 11], 65),
];

describe("strength", () => {
  it("strength: match by name then equipment", () => {
    const byName = strength(2, "  leg   PRESS ", null);
    const byEquipment = strength(
      3,
      "Pressa per il petto",
      " selection  CHEST press",
    );
    const unknown = strength(4, "Lat Pulldown", "Pure Lat Pulldown");
    const warmup: Exercise = {
      order: 1,
      name: "Riscaldamento",
      equipment: "Skillbike",
      kind: "cardio",
      duration_s: 480,
      sets: [],
    };
    // 23:30 UTC del 3 novembre è il 4 novembre a Roma.
    const s = session("sess-t01", "2026-11-03T23:30:00Z", [
      byEquipment,
      unknown,
      warmup,
      byName,
    ]);
    // Uno slug ripetuto in due giorni della scheda resta una sola chiave.
    const twoDays = {
      ...scheda,
      days: [...scheda.days, ...scheda.days.map((d) => ({ ...d, id: "B" }))],
    };

    const { bySlug, unmatched } = matchExercises(twoDays, [s]);

    const at = { session_id: "sess-t01", date: "2026-11-04" };
    expect(Object.keys(bySlug)).toEqual(SLUGS);
    expect(bySlug).toEqual({
      "skillbike-warmup": [{ ...warmup, ...at }],
      "leg-press": [{ ...byName, ...at }],
      "chest-press": [{ ...byEquipment, ...at }],
      "lat-machine": [],
      "leg-curl": [],
      "run-artis-incline-walk": [],
    });
    expect(unmatched).toEqual([{ ...unknown, ...at }]);
  });

  it("strength: table rows", () => {
    const bySlug = {
      "leg-press": rising,
      "chest-press": [
        execution(
          "sess-t01",
          "2026-11-03",
          [12, 11, 10],
          30,
          "Selection Chest Press",
        ),
        execution(
          "sess-t02",
          "2026-11-05",
          [10, 10, 10],
          35,
          "Selection Chest Press",
        ),
      ],
      "lat-machine": [],
      // Ripetizioni senza carico: nessuna serie completa per l'e1RM.
      "leg-curl": [execution("sess-t02", "2026-11-05", [12, 12, 12], null)],
    };

    expect(strengthTable(scheda, bySlug)).toEqual([
      {
        slug: "leg-press",
        name: "Leg Press",
        sessions: 4,
        first: { date: "2026-11-03", load_kg: 60, reps: 12 },
        last: { date: "2026-11-12", load_kg: 65, reps: 12 },
        e1rm_start_kg: 84,
        e1rm_end_kg: 91,
        e1rm_delta_pct: expect.closeTo(8.3333, 3),
        reliability: "confermato",
        next: { load_kg: 65, reps_target: 12, action: "hold" },
      },
      {
        slug: "chest-press",
        name: "Chest Press",
        sessions: 2,
        first: { date: "2026-11-03", load_kg: 30, reps: 12 },
        last: { date: "2026-11-05", load_kg: 35, reps: 10 },
        e1rm_start_kg: 42,
        e1rm_end_kg: expect.closeTo(46.6667, 3),
        e1rm_delta_pct: expect.closeTo(11.1111, 3),
        reliability: "da_rivedere",
        next: { load_kg: 35, reps_target: 11, action: "hold" },
      },
      {
        slug: "lat-machine",
        name: "Lat Machine",
        sessions: 0,
        first: null,
        last: null,
        e1rm_start_kg: null,
        e1rm_end_kg: null,
        e1rm_delta_pct: null,
        reliability: null,
        next: { load_kg: null, reps_target: 12, action: "calibrate" },
      },
      {
        slug: "leg-curl",
        name: "Leg Curl",
        sessions: 1,
        first: null,
        last: null,
        e1rm_start_kg: null,
        e1rm_end_kg: null,
        e1rm_delta_pct: null,
        reliability: null,
        next: { load_kg: null, reps_target: 10, action: "increase" },
      },
    ]);
  });

  it("strength: reliability needs same setup and no drop", () => {
    const reliability = (executions: Execution[]) =>
      strengthTable(scheda, { "leg-press": executions })[0]?.reliability;
    expect(reliability(rising)).toBe("confermato");
    // Attrezzo cambiato nell'ultima seduta.
    const moved = rising.map((e, i) =>
      i === 3 ? { ...e, equipment: "Pure Leg Press" } : e,
    );
    expect(reliability(moved)).toBe("da_rivedere");
    // Ultima seduta con e1RM in calo (65 × 10 = 86,67 < 88,83).
    const drop = [
      ...rising.slice(0, 3),
      execution("sess-t04", "2026-11-12", [10, 10, 10], 65),
    ];
    expect(reliability(drop)).toBe("da_rivedere");
  });

  it("strength: e1rm series per session", () => {
    // Due esecuzioni nella stessa seduta: conta la serie migliore delle due.
    const twice = [
      execution("sess-t01", "2026-11-03", [12, 12, 10], 60),
      execution("sess-t01", "2026-11-03", [10], 70),
      execution("sess-t02", "2026-11-05", [12], null),
      execution("sess-t03", "2026-11-10", [11, 10, 10], 65),
    ];
    const series = e1rmSeries(scheda, {
      "leg-press": twice,
      "chest-press": [],
    });
    expect(series).toEqual([
      {
        slug: "leg-press",
        name: "Leg Press",
        points: [
          { date: "2026-11-03", e1rm_kg: expect.closeTo(93.3333, 3) },
          { date: "2026-11-10", e1rm_kg: expect.closeTo(88.8333, 3) },
        ],
      },
      { slug: "chest-press", name: "Chest Press", points: [] },
      { slug: "lat-machine", name: "Lat Machine", points: [] },
      { slug: "leg-curl", name: "Leg Curl", points: [] },
    ]);
  });

  it("strength: best set", () => {
    const tie = execution("sess-t01", "2026-11-03", [12, 12, 10], 60);
    expect(bestSet(tie)).toEqual({
      n: 1,
      reps_target: 12,
      reps_done: 12,
      load_target_kg: 60,
      load_done_kg: 60,
    });
    expect(bestSet(execution("sess-t01", "2026-11-03", [12], null))).toBeNull();
    expect(bestSet(execution("sess-t01", "2026-11-03", [0], 60))).toBeNull();
  });
});
