import { romeDate } from "../domain/dates";
import type { E1rmSeries, StrengthTable } from "../domain/metrics";
import type {
  Exercise,
  Scheda,
  SchedaExercise,
  Session,
  StrengthExercise,
  StrengthSet,
} from "../domain/types";
import { nextPrescription } from "./progression";

/** Esercizio eseguito in una seduta, con la seduta e la sua data (Europe/Rome). */
export type Execution = Exercise & { session_id: string; date: string };

/** Massimale stimato con la formula di Epley; mai arrotondato qui (solo nella resa). */
export function e1rm(loadKg: number, reps: number): number {
  return loadKg * (1 + reps / 30);
}

/** Voci della scheda nell'ordine giorni → blocchi → esercizi; uno slug ripetuto compare più volte. */
function schedaEntries(scheda: Scheda | null): SchedaExercise[] {
  return (
    scheda?.days.flatMap((d) =>
      d.blocks.flatMap((b): SchedaExercise[] => b.exercises),
    ) ?? []
  );
}

const normalise = (s: string): string =>
  s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Collega gli esercizi eseguiti alle voci della scheda (scheda/SCHEMA.md § 5): prima per
 * `technogym_name`, poi per `equipment`. `bySlug` ha una chiave per ogni slug della scheda;
 * senza scheda ogni esecuzione è non riconosciuta.
 */
export function matchExercises(
  scheda: Scheda | null,
  sessions: Session[],
): { bySlug: Record<string, Execution[]>; unmatched: Execution[] } {
  const entries = schedaEntries(scheda);
  const bySlug: Record<string, Execution[]> = {};
  for (const entry of entries) bySlug[entry.slug] = [];
  const unmatched: Execution[] = [];
  for (const session of sessions) {
    const date = romeDate(session.started_at);
    for (const ex of session.exercises.toSorted((a, b) => a.order - b.order)) {
      const execution = { ...ex, session_id: session.session_id, date };
      const name = normalise(ex.name);
      const equipment = ex.equipment === null ? null : normalise(ex.equipment);
      const entry =
        entries.find((e) => normalise(e.technogym_name) === name) ??
        entries.find((e) => normalise(e.equipment) === equipment);
      if (entry === undefined) unmatched.push(execution);
      else bySlug[entry.slug]?.push(execution); // chiave creata sopra
    }
  }
  return { bySlug, unmatched };
}

type Scored = {
  set: StrengthSet;
  load_kg: number;
  reps: number;
  e1rm_kg: number;
};

// Serie completa (carico e ripetizioni > 0) con l'e1RM più alto; a parità la prima.
function bestScored(e: Execution): Scored | null {
  let best: Scored | null = null;
  for (const set of e.sets) {
    const { load_done_kg: load_kg, reps_done: reps } = set;
    if (load_kg === null || load_kg <= 0 || reps === null || reps <= 0) {
      continue;
    }
    const e1rm_kg = e1rm(load_kg, reps);
    if (
      best === null ||
      e1rm_kg > best.e1rm_kg ||
      (e1rm_kg === best.e1rm_kg && set.n < best.set.n)
    ) {
      best = { set, load_kg, reps, e1rm_kg };
    }
  }
  return best;
}

/** Serie migliore per e1RM tra quelle con carico e ripetizioni; null se non ce ne sono. */
export function bestSet(e: Execution): StrengthSet | null {
  return bestScored(e)?.set ?? null;
}

/** Esercizi di forza della scheda, uno per slug, nell'ordine della scheda. */
export function strengthExercises(scheda: Scheda): StrengthExercise[] {
  const bySlug = new Map<string, StrengthExercise>();
  for (const day of scheda.days) {
    for (const block of day.blocks) {
      if (block.type !== "strength") continue;
      for (const ex of block.exercises) {
        if (!bySlug.has(ex.slug)) bySlug.set(ex.slug, ex);
      }
    }
  }
  return [...bySlug.values()];
}

// e1RM migliore di ogni seduta con almeno una serie completa, in ordine di data.
function sessionBests(
  executions: Execution[],
): { date: string; e1rm_kg: number }[] {
  const points = new Map<string, { date: string; e1rm_kg: number }>();
  for (const e of executions) {
    const best = bestScored(e);
    if (best === null) continue;
    const point = points.get(e.session_id);
    if (point === undefined) {
      points.set(e.session_id, { date: e.date, e1rm_kg: best.e1rm_kg });
    } else {
      point.e1rm_kg = Math.max(point.e1rm_kg, best.e1rm_kg);
    }
  }
  return [...points.values()];
}

/**
 * Una riga per esercizio di forza: serie migliore della prima e dell'ultima esecuzione con
 * una serie completa, variazione dell'e1RM, affidabilità e proposta per la prossima seduta.
 * "bloccato" non viene mai assegnato qui: lo decide Claude nella revisione mensile.
 */
export function strengthTable(
  scheda: Scheda,
  bySlug: Record<string, Execution[]>,
): StrengthTable {
  return strengthExercises(scheda).map((ex) => {
    const executions = bySlug[ex.slug] ?? [];
    const scored = executions.flatMap((e) => {
      const best = bestScored(e);
      return best === null ? [] : [{ date: e.date, ...best }];
    });
    const first = scored[0];
    const last = scored.at(-1);
    const bests = sessionBests(executions);
    const sameSetup = new Set(executions.map((e) => e.equipment)).size === 1;
    const noDrop = bests.every(
      (p, i) => i === 0 || p.e1rm_kg >= (bests[i - 1]?.e1rm_kg ?? 0),
    );
    const ref = (s: typeof first) =>
      s === undefined
        ? null
        : { date: s.date, load_kg: s.load_kg, reps: s.reps };
    return {
      slug: ex.slug,
      name: ex.technogym_name,
      sessions: new Set(executions.map((e) => e.session_id)).size,
      first: ref(first),
      last: ref(last),
      e1rm_start_kg: first?.e1rm_kg ?? null,
      e1rm_end_kg: last?.e1rm_kg ?? null,
      e1rm_delta_pct:
        first !== undefined && last !== undefined && scored.length >= 2
          ? ((last.e1rm_kg - first.e1rm_kg) / first.e1rm_kg) * 100
          : null,
      reliability:
        scored.length === 0
          ? null
          : bests.length >= 4 && sameSetup && noDrop
            ? "confermato"
            : "da_rivedere",
      next: nextPrescription(ex, executions.at(-1) ?? null),
    };
  });
}

/** e1RM migliore di ogni seduta per esercizio di forza; le sedute senza serie completa mancano. */
export function e1rmSeries(
  scheda: Scheda,
  bySlug: Record<string, Execution[]>,
): E1rmSeries {
  return strengthExercises(scheda).map((ex) => ({
    slug: ex.slug,
    name: ex.technogym_name,
    points: sessionBests(bySlug[ex.slug] ?? []),
  }));
}
