import type { Exercise, StrengthExercise, StrengthSet } from "../domain/types";
import type { Execution } from "./strength";

/** Serie registrate (volume e progressione): ripetizioni > 0 in un esercizio di forza. */
export function registeredSets(e: Exercise | null): StrengthSet[] {
  if (e === null || e.kind !== "strength") return [];
  return e.sets.filter((s) => s.reps_done !== null && s.reps_done > 0);
}

export type Prescription = {
  load_kg: number | null;
  reps_target: number;
  action: "increase" | "decrease" | "hold" | "calibrate";
};

/**
 * Proposta per la prossima seduta con la doppia progressione
 * (docs/linee-guida-allenamento.md § 3), dalle serie di lavoro dell'ultima seduta con serie
 * registrate (le sue esecuzioni unite in una, vedi strengthTable).
 */
export function nextPrescription(
  ex: StrengthExercise,
  last: Execution | null,
): Prescription {
  const registered = registeredSets(last);
  const loads = registered.flatMap((s) =>
    s.load_done_kg === null ? [] : [s.load_done_kg],
  );
  const load = loads.length > 0 ? Math.max(...loads) : null;
  // Serie di lavoro: quelle al carico più alto; le serie di avvicinamento o di taratura a
  // carichi minori non contano. Senza carichi noti contano tutte le serie registrate.
  const working =
    load === null
      ? registered
      : registered.filter((s) => s.load_done_kg === load);
  const reps = working.map((s) => s.reps_done ?? 0);
  if (reps.length === 0) {
    // Nessuno storico: carico da tarare, oppure quello iniziale della scheda.
    return ex.start_load_kg === null
      ? { load_kg: null, reps_target: ex.reps_max, action: "calibrate" }
      : { load_kg: ex.start_load_kg, reps_target: ex.reps_min, action: "hold" };
  }
  if (reps.length >= ex.sets && reps.every((r) => r >= ex.reps_max)) {
    return {
      load_kg: load === null ? null : load + ex.step_kg,
      reps_target: ex.reps_min,
      action: "increase",
    };
  }
  // "Almeno 2 serie su 3" sotto il minimo, generalizzato a 2/3 delle serie di lavoro.
  const below = reps.filter((r) => r < ex.reps_min).length;
  if (below >= Math.ceil((2 * reps.length) / 3)) {
    return {
      load_kg: load === null ? null : Math.max(0, load - ex.step_kg),
      reps_target: ex.reps_min,
      action: "decrease",
    };
  }
  return {
    load_kg: load,
    reps_target: Math.min(Math.min(...reps) + 1, ex.reps_max),
    action: "hold",
  };
}
