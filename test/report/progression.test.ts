import { describe, expect, it } from "vitest";
import type { StrengthExercise } from "../../src/domain/types";
import { nextPrescription } from "../../src/report/progression";
import type { Execution } from "../../src/report/strength";

// Leg Press fittizia: 3 serie da 10–12, step 5 kg, carico iniziale da tarare.
const legPress: StrengthExercise = {
  slug: "leg-press",
  technogym_name: "Leg Press",
  equipment: "Selection Leg Press",
  tracking: "auto-if-900",
  sets: 3,
  reps_min: 10,
  reps_max: 12,
  rest_s: 90,
  step_kg: 5,
  muscle_groups: ["quadricipiti"],
  start_load_kg: null,
  indirect_muscles: ["femorali"],
  movement_pattern: "squat",
};

function execution(reps: number[], loadKg: number): Execution {
  return {
    order: 1,
    name: "Leg Press",
    equipment: "Selection Leg Press",
    kind: "strength",
    session_id: "sess-t01",
    date: "2026-11-03",
    sets: reps.map((r, i) => ({
      n: i + 1,
      reps_target: 12,
      reps_done: r,
      load_target_kg: loadKg,
      load_done_kg: loadKg,
    })),
  };
}

describe("progression", () => {
  it("progression: increase", () => {
    expect(nextPrescription(legPress, execution([12, 12, 12], 60))).toEqual({
      load_kg: 65,
      reps_target: 10,
      action: "increase",
    });
  });

  it("progression: decrease", () => {
    expect(nextPrescription(legPress, execution([8, 9, 10], 60))).toEqual({
      load_kg: 55,
      reps_target: 10,
      action: "decrease",
    });
  });

  it("progression: hold", () => {
    expect(nextPrescription(legPress, execution([11, 11, 10], 60))).toEqual({
      load_kg: 60,
      reps_target: 11,
      action: "hold",
    });
  });

  it("progression: calibrate without history", () => {
    expect(nextPrescription(legPress, null)).toEqual({
      load_kg: null,
      reps_target: 12,
      action: "calibrate",
    });
    // Esecuzione senza serie registrate (ripetizioni mancanti): come senza storico.
    const empty = execution([], 60);
    empty.sets = [
      {
        n: 1,
        reps_target: 12,
        reps_done: null,
        load_target_kg: 60,
        load_done_kg: null,
      },
    ];
    expect(nextPrescription(legPress, empty).action).toBe("calibrate");
    // Carico iniziale già tarato in scheda: si parte da lì con il minimo di ripetizioni.
    expect(nextPrescription({ ...legPress, start_load_kg: 40 }, null)).toEqual({
      load_kg: 40,
      reps_target: 10,
      action: "hold",
    });
  });
});
