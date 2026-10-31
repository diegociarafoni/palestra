import { describe, expect, it } from "vitest";
import type { PlannedSlot } from "../../src/domain/planning";
import type { Session } from "../../src/domain/types";
import {
  adherence,
  cardioSummary,
  feedbackSummary,
  ratios,
  status,
  volumeByMuscle,
  volumeByPattern,
  weeklyVolume,
} from "../../src/report/metrics";
import { type Execution, e1rm } from "../../src/report/strength";
import { feedback, scheda, sessions } from "./fixtures";

describe("metrics", () => {
  it("metrics: e1rm epley", () => {
    expect(e1rm(60, 10)).toBe(80);
    expect(e1rm(70, 10)).toBeCloseTo(93.33, 2);
  });

  it("metrics: weekly tonnage", () => {
    const legPress: Session = {
      session_id: "sess-t01",
      source: "mywellness-api",
      started_at: "2026-11-03T18:00:00+01:00",
      ended_at: null,
      name: "Seduta libera",
      program: null,
      moves: null,
      calories_kcal: null,
      duration_s: null,
      exercises: [
        {
          order: 1,
          name: "Leg Press",
          equipment: "Selection Leg Press",
          kind: "strength",
          sets: [12, 12, 10].map((reps, i) => ({
            n: i + 1,
            reps_target: 12,
            reps_done: reps,
            load_target_kg: 60,
            load_done_kg: 60,
          })),
        },
      ],
    };
    expect(weeklyVolume([legPress])).toEqual([
      {
        week: "2026-W45",
        sessions: 1,
        sets: 3,
        tonnage_kg: 2040,
        kg_per_set: 680,
      },
    ]);

    // Fixture: W45 con la seduta extra di solo cardio (conta tra le sedute, non nelle serie).
    // W45 = 2040 + 990 + 1160 (sess-r01, 9 serie) + 2880 + 1440 (sess-r03, 8 serie) = 8510 kg;
    // W46 = 2015 + 1050 + 1600 (sess-r04) = 4665 kg in 10 serie.
    expect(weeklyVolume(sessions)).toEqual([
      {
        week: "2026-W45",
        sessions: 3,
        sets: 17,
        tonnage_kg: 8510,
        kg_per_set: expect.closeTo(500.588, 2),
      },
      {
        week: "2026-W46",
        sessions: 1,
        sets: 10,
        tonnage_kg: 4665,
        kg_per_set: 466.5,
      },
    ]);
  });

  it("metrics: indirect muscles at half", () => {
    const squat = {
      slug: "leg-press",
      technogym_name: "Leg Press",
      equipment: "Selection Leg Press",
      tracking: "manual" as const,
      sets: 3,
      reps_min: 10,
      reps_max: 12,
      rest_s: 90,
      step_kg: 5,
      muscle_groups: ["quadricipiti"],
      indirect_muscles: ["femorali"],
      movement_pattern: "squat" as const,
      start_load_kg: null,
    };
    const oneExercise = {
      ...scheda,
      days: [
        {
          id: "A",
          name: "Giorno A",
          blocks: [{ type: "strength" as const, exercises: [squat] }],
        },
      ],
    };
    const execution: Execution = {
      order: 1,
      name: "Leg Press",
      equipment: "Selection Leg Press",
      kind: "strength",
      session_id: "sess-t01",
      date: "2026-11-03",
      sets: [12, 12, 10].map((reps, i) => ({
        n: i + 1,
        reps_target: 12,
        reps_done: reps,
        load_target_kg: 60,
        load_done_kg: 60,
      })),
    };
    const bySlug = { "leg-press": [execution] };

    expect(volumeByMuscle(oneExercise, bySlug)).toEqual({
      quadricipiti: 3,
      femorali: 1.5,
    });
    expect(volumeByPattern(oneExercise, bySlug)).toEqual({ squat: 3 });
  });

  it("metrics: hamstring quad ratio", () => {
    const r = ratios({ femorali: 22, quadricipiti: 38 }, {});
    expect(r.hamstring_quad).toBeCloseTo(0.58, 2);
    expect(status("hamstring_quad", 0.58, 0.6)).toBe("watch");
    // Spinta (9 + 3) su tirata (6 + 6); serie di spinta verticale del mese.
    expect(
      ratios(
        { quadricipiti: 0 },
        {
          "spinta-orizzontale": 9,
          "spinta-verticale": 3,
          "tirata-orizzontale": 6,
          "tirata-verticale": 6,
        },
      ),
    ).toEqual({ hamstring_quad: null, push_pull: 1, vertical_push_sets: 3 });
    // Senza denominatore il rapporto è null, mai NaN o Infinity.
    expect(ratios({}, {})).toEqual({
      hamstring_quad: null,
      push_pull: null,
      vertical_push_sets: 0,
    });
  });

  it("metrics: status thresholds", () => {
    // Aderenza (frazione), obiettivo predefinito 0,85; "watch" entro il 10 % (≥ 0,765).
    expect(status("adherence", 0.85, null)).toBe("ok");
    expect(status("adherence", 0.8, null)).toBe("watch");
    expect(status("adherence", 0.75, null)).toBe("fix");
    expect(status("e1rm_delta_pct", 5, null)).toBe("ok");
    expect(status("e1rm_delta_pct", 4.6, null)).toBe("watch");
    expect(status("e1rm_delta_pct", 2, null)).toBe("fix");
    expect(status("hamstring_quad", 0.5, null)).toBe("fix");
    // Spinta/tirata: più basso è meglio, obiettivo ≤ 1,0.
    expect(status("push_pull", 0.8, null)).toBe("ok");
    expect(status("push_pull", 1.05, null)).toBe("watch");
    expect(status("push_pull", 1.2, null)).toBe("fix");
    // Serie per distretto a settimana: intervallo 6–10, l'obiettivo passato è ignorato.
    expect(status("muscle_sets_week", 6, 99)).toBe("ok");
    expect(status("muscle_sets_week", 10, null)).toBe("ok");
    expect(status("muscle_sets_week", 5.5, null)).toBe("watch");
    expect(status("muscle_sets_week", 10.5, null)).toBe("watch");
    expect(status("muscle_sets_week", 5, null)).toBe("fix");
    expect(status("muscle_sets_week", 12, null)).toBe("fix");
    expect(status("sleep_h", 6.5, null)).toBe("watch");
    expect(status("sleep_h", 6, null)).toBe("fix");
    expect(status("steps_avg", 8000, null)).toBe("ok");
    expect(status("steps_avg", 7000, null)).toBe("fix");
    // Tonnellaggio: l'obiettivo è la prima settimana, non c'è un valore predefinito.
    expect(status("tonnage", 95, 100)).toBe("watch");
    expect(() => status("tonnage", 95, null)).toThrow(Error);
  });

  it("adherence: counts done and moved, ignores extra", () => {
    const slot = (
      id: string,
      status: PlannedSlot["status"],
      reason: string | null = null,
    ): PlannedSlot => ({
      id,
      week: id.slice(0, 8),
      slot: Number(id.slice(9)),
      window: ["2026-11-03"],
      date: null,
      scheda_day: "A",
      status,
      reason,
      session_id: null,
    });
    // La seduta extra (sess-t09, mercoledì) non ha uno slot: non entra nel conteggio.
    const slots = [
      slot("2026-W45-1", "fatta"),
      slot("2026-W45-2", "spostata"),
      slot("2026-W46-1", "saltata", "lavoro"),
    ];
    expect(adherence(slots)).toEqual({
      done: 2,
      planned: 3,
      skipped: [{ id: "2026-W46-1", reason: "lavoro" }],
    });
  });

  it("report: feedback summary", () => {
    // Fixture: buona, buona, faticosa con un fastidio al ginocchio.
    expect(feedbackSummary(feedback)).toEqual({
      ottima: 0,
      buona: 2,
      normale: 0,
      faticosa: 1,
      pessima: 0,
      joint_pain_days: 1,
    });
    // Due sedute con fastidio nello stesso giorno: un solo giorno.
    const sameDay = feedback.map((f) => ({
      ...f,
      date: "2026-11-10",
      joint_pain: true,
    }));
    expect(feedbackSummary(sameDay).joint_pain_days).toBe(1);
  });

  it("metrics: cardio summary", () => {
    // Attrezzo senza dati (né durata né distanza): somme e medie null, mai 0 inventati.
    const bare: Session = {
      session_id: "sess-t02",
      source: "mywellness-api",
      started_at: "2026-11-20T18:00:00+01:00",
      ended_at: null,
      name: "Seduta libera",
      program: null,
      moves: null,
      calories_kcal: null,
      duration_s: null,
      exercises: [
        {
          order: 1,
          name: "Tapis roulant",
          equipment: null,
          kind: "cardio",
          sets: [],
        },
      ],
    };
    // Fixture: Skillbike in sess-r01 e sess-r04 (MOVEs 90 e null), Run Artis in sess-r02 e sess-r03.
    expect(cardioSummary([...sessions, bare])).toEqual([
      {
        equipment: "Skillbike",
        executions: 2,
        minutes: 16,
        km: 6,
        kcal: 120,
        moves_avg: 90,
      },
      {
        equipment: "Run Artis",
        executions: 2,
        minutes: 32,
        km: 3.2,
        kcal: 240,
        moves_avg: 160,
      },
      {
        equipment: "Tapis roulant",
        executions: 1,
        minutes: null,
        km: null,
        kcal: null,
        moves_avg: null,
      },
    ]);
  });
});
