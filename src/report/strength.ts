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
import { nextPrescription, registeredSets } from "./progression";

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

type SessionBest = {
  session_id: string;
  date: string;
  load_kg: number;
  reps: number;
  e1rm_kg: number;
};

// Serie migliore di ogni seduta con almeno una serie completa, tra tutte le esecuzioni dello
// slug in quella seduta (a pari e1RM vince l'esecuzione precedente), in ordine di data.
function sessionBests(executions: Execution[]): SessionBest[] {
  const bests = new Map<string, SessionBest>();
  for (const e of executions) {
    const best = bestScored(e);
    if (best === null) continue;
    const current = bests.get(e.session_id);
    if (current === undefined || best.e1rm_kg > current.e1rm_kg) {
      const { load_kg, reps, e1rm_kg } = best;
      bests.set(e.session_id, {
        session_id: e.session_id,
        date: e.date,
        load_kg,
        reps,
        e1rm_kg,
      });
    }
  }
  return [...bests.values()];
}

// Esecuzioni dell'ultima seduta con almeno una serie registrata, unite in una sola.
function lastRegistered(executions: Execution[]): Execution | null {
  const last = executions.findLast((e) => registeredSets(e).length > 0);
  if (last === undefined) return null;
  const sets = executions
    .filter((e) => e.session_id === last.session_id)
    .flatMap(registeredSets);
  return { ...last, sets };
}

/**
 * Una riga per esercizio di forza, per seduta: serie migliore della prima e dell'ultima seduta
 * con una serie completa, variazione dell'e1RM (con almeno due sedute), affidabilità e proposta
 * dall'ultima seduta con serie registrate. "bloccato" non viene mai assegnato qui: lo decide
 * Claude nella revisione mensile.
 */
export function strengthTable(
  scheda: Scheda,
  bySlug: Record<string, Execution[]>,
): StrengthTable {
  return strengthExercises(scheda).map((ex) => {
    const executions = bySlug[ex.slug] ?? [];
    const bests = sessionBests(executions);
    const first = bests[0];
    const last = bests.at(-1);
    const sameSetup = new Set(executions.map((e) => e.equipment)).size === 1;
    const noDrop = bests.every(
      (p, i) => i === 0 || p.e1rm_kg >= (bests[i - 1]?.e1rm_kg ?? 0),
    );
    const ref = (s: SessionBest | undefined) =>
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
        first !== undefined && last !== undefined && bests.length >= 2
          ? ((last.e1rm_kg - first.e1rm_kg) / first.e1rm_kg) * 100
          : null,
      reliability:
        bests.length === 0
          ? null
          : bests.length >= 4 && sameSetup && noDrop
            ? "confermato"
            : "da_rivedere",
      next: nextPrescription(ex, lastRegistered(executions)),
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
    points: sessionBests(bySlug[ex.slug] ?? []).map(({ date, e1rm_kg }) => ({
      date,
      e1rm_kg,
    })),
  }));
}
