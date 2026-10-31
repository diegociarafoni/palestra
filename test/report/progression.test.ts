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

// Esecuzione con carichi diversi per serie: coppie [carico, ripetizioni].
function ramp(pairs: [number, number][]): Execution {
  return {
    ...execution([], 0),
    sets: pairs.map(([load, reps], i) => ({
      n: i + 1,
      reps_target: 12,
      reps_done: reps,
      load_target_kg: load,
      load_done_kg: load,
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

  it("progression: working sets at the top load", () => {
    // Taratura in salita: una sola serie a 60 kg, non "3 serie a max".
    expect(
      nextPrescription(
        legPress,
        ramp([
          [40, 12],
          [50, 12],
          [60, 12],
        ]),
      ),
    ).toEqual({ load_kg: 60, reps_target: 12, action: "hold" });
    // Riscaldamento registrato: 2 serie di lavoro su 3 sotto il minimo.
    expect(
      nextPrescription(
        legPress,
        ramp([
          [30, 15],
          [60, 9],
          [60, 9],
          [60, 10],
        ]),
      ),
    ).toEqual({ load_kg: 55, reps_target: 10, action: "decrease" });
    // Serie di avvicinamento (~50 % × 8, ~75 % × 5) e 3 × 12 a 60 kg.
    expect(
      nextPrescription(
        legPress,
        ramp([
          [30, 8],
          [45, 5],
          [60, 12],
          [60, 12],
          [60, 12],
        ]),
      ),
    ).toEqual({ load_kg: 65, reps_target: 10, action: "increase" });
    // Il carico di riferimento è il più alto, anche se l'ultima serie è più leggera.
    expect(
      nextPrescription(
        legPress,
        ramp([
          [60, 12],
          [60, 12],
          [55, 12],
        ]),
      ),
    ).toEqual({ load_kg: 60, reps_target: 12, action: "hold" });
  });

  it("progression: rules beyond three sets", () => {
    // Solo 2 serie su 3 previste: niente aumento, obiettivo fermo a max.
    expect(nextPrescription(legPress, execution([12, 12], 60))).toEqual({
      load_kg: 60,
      reps_target: 12,
      action: "hold",
    });
    // Una serie a 0 ripetizioni non è registrata.
    expect(nextPrescription(legPress, execution([12, 12, 12, 0], 60))).toEqual({
      load_kg: 65,
      reps_target: 10,
      action: "increase",
    });
    // 2/3 di 4 serie = 3 serie sotto il minimo per ridurre.
    expect(nextPrescription(legPress, execution([12, 12, 9, 9], 60))).toEqual({
      load_kg: 60,
      reps_target: 10,
      action: "hold",
    });
    expect(nextPrescription(legPress, execution([9, 9, 9, 12], 60))).toEqual({
      load_kg: 55,
      reps_target: 10,
      action: "decrease",
    });
    // Il carico ridotto non scende sotto 0.
    expect(nextPrescription(legPress, execution([8, 8, 8], 2.5))).toEqual({
      load_kg: 0,
      reps_target: 10,
      action: "decrease",
    });
  });
});
