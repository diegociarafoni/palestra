import { isoWeek, romeDate } from "../domain/dates";
import type {
  Adherence,
  FeedbackSummary,
  Ratios,
  Status,
  WeeklyVolume,
} from "../domain/metrics";
import type { PlannedSlot } from "../domain/planning";
import type { Exercise, Feedback, Scheda, Session } from "../domain/types";
import { registeredSets } from "./progression";
import { type Execution, strengthExercises } from "./strength";

// Calcoli puri del report: nessun accesso a D1, nessun arrotondamento (solo nella resa).

/**
 * Volume per settimana ISO, in ordine crescente, solo per le settimane con sedute: sedute di
 * ogni tipo, serie registrate di tutti gli esercizi di forza (riconosciuti o no), tonnellaggio.
 */
export function weeklyVolume(sessions: Session[]): WeeklyVolume {
  const weeks = new Map<
    string,
    { sessions: number; sets: number; tonnage_kg: number }
  >();
  for (const session of sessions) {
    const week = isoWeek(romeDate(session.started_at));
    const total = weeks.get(week) ?? { sessions: 0, sets: 0, tonnage_kg: 0 };
    total.sessions += 1;
    for (const ex of session.exercises) {
      for (const set of registeredSets(ex)) {
        total.sets += 1;
        total.tonnage_kg += (set.load_done_kg ?? 0) * (set.reps_done ?? 0);
      }
    }
    weeks.set(week, total);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, t]) => ({
      week,
      ...t,
      kg_per_set: t.sets > 0 ? t.tonnage_kg / t.sets : 0,
    }));
}

// Serie registrate del mese per un esercizio della scheda.
const monthSets = (executions: Execution[] | undefined): number =>
  (executions ?? []).reduce((n, e) => n + registeredSets(e).length, 0);

/**
 * Serie registrate nel mese per distretto: `muscle_groups` al 100 %, `indirect_muscles` al
 * 50 %; una chiave per ogni distretto degli esercizi di forza della scheda (anche a 0).
 */
export function volumeByMuscle(
  scheda: Scheda,
  bySlug: Record<string, Execution[]>,
): Record<string, number> {
  const muscles: Record<string, number> = {};
  for (const ex of strengthExercises(scheda)) {
    const sets = monthSets(bySlug[ex.slug]);
    for (const m of ex.muscle_groups) muscles[m] = (muscles[m] ?? 0) + sets;
    for (const m of ex.indirect_muscles) {
      muscles[m] = (muscles[m] ?? 0) + sets / 2;
    }
  }
  return muscles;
}

/** Serie registrate nel mese per schema di movimento degli esercizi di forza della scheda. */
export function volumeByPattern(
  scheda: Scheda,
  bySlug: Record<string, Execution[]>,
): Record<string, number> {
  const patterns: Record<string, number> = {};
  for (const ex of strengthExercises(scheda)) {
    patterns[ex.movement_pattern] =
      (patterns[ex.movement_pattern] ?? 0) + monthSets(bySlug[ex.slug]);
  }
  return patterns;
}

// Rapporto o null se il denominatore è 0: mai NaN o Infinity nelle metriche.
const ratio = (num: number, den: number): number | null =>
  den > 0 ? num / den : null;

/** Equilibrio (linee guida § 5): femorali/quadricipiti e spinta/tirata in serie del mese. */
export function ratios(
  byMuscle: Record<string, number>,
  byPattern: Record<string, number>,
): Ratios {
  const p = (key: string): number => byPattern[key] ?? 0;
  return {
    hamstring_quad: ratio(byMuscle.femorali ?? 0, byMuscle.quadricipiti ?? 0),
    push_pull: ratio(
      p("spinta-orizzontale") + p("spinta-verticale"),
      p("tirata-orizzontale") + p("tirata-verticale"),
    ),
    vertical_push_sets: p("spinta-verticale"),
  };
}

export type Indicator =
  | "adherence"
  | "e1rm_delta_pct"
  | "tonnage"
  | "hamstring_quad"
  | "push_pull"
  | "muscle_sets_week"
  | "sleep_h"
  | "steps_avg";

// Obiettivi predefiniti di docs/linee-guida-allenamento.md § 5 (l'aderenza è una frazione).
const DEFAULT_TARGETS: Partial<Record<Indicator, number>> = {
  adherence: 0.85,
  e1rm_delta_pct: 5,
  hamstring_quad: 0.6,
  push_pull: 1,
  sleep_h: 7,
  steps_avg: 8000,
};

/**
 * Stato di un indicatore (linee guida § 5): "ok" se raggiunge l'obiettivo, "watch" se ne
 * resta entro il 10 %, altrimenti "fix". Spinta/tirata è migliore se più bassa; le serie per
 * distretto a settimana hanno l'intervallo 6–10; il tonnellaggio richiede l'obiettivo (la
 * prima settimana del mese).
 */
export function status(
  indicator: Indicator,
  value: number,
  target: number | null,
): Status {
  if (indicator === "muscle_sets_week") {
    if (value >= 6 && value <= 10) return "ok";
    return value >= 5.4 && value <= 11 ? "watch" : "fix";
  }
  const t = target ?? DEFAULT_TARGETS[indicator];
  if (t === undefined) {
    throw new Error(`status: obiettivo mancante per ${indicator}`);
  }
  const margin = 0.1 * Math.abs(t);
  if (indicator === "push_pull") {
    if (value <= t) return "ok";
    return value <= t + margin ? "watch" : "fix";
  }
  if (value >= t) return "ok";
  return value >= t - margin ? "watch" : "fix";
}

/**
 * Aderenza sugli slot programmati del mese: svolti = `fatta` + `spostata`. Le sedute extra
 * non hanno uno slot e non contano.
 */
export function adherence(slots: PlannedSlot[]): Adherence {
  return {
    done: slots.filter((s) => s.status === "fatta" || s.status === "spostata")
      .length,
    planned: slots.length,
    skipped: slots
      .filter((s) => s.status === "saltata")
      .map((s) => ({ id: s.id, reason: s.reason })),
  };
}

/** Feedback del mese per classe (tutte e cinque) e giorni distinti con fastidi articolari. */
export function feedbackSummary(f: Feedback[]): FeedbackSummary {
  const summary = {
    ottima: 0,
    buona: 0,
    normale: 0,
    faticosa: 0,
    pessima: 0,
    joint_pain_days: 0,
  };
  for (const item of f) summary[item.class] += 1;
  summary.joint_pain_days = new Set(
    f.filter((item) => item.joint_pain).map((item) => item.date),
  ).size;
  return summary;
}

export type CardioRow = {
  equipment: string;
  executions: number;
  minutes: number | null;
  km: number | null;
  kcal: number | null;
  moves_avg: number | null;
};

const present = (values: (number | null | undefined)[]): number[] =>
  values.filter((v): v is number => v !== null && v !== undefined);

// Somma dei valori presenti; null se non ce n'è nessuno.
function sum(values: (number | null | undefined)[]): number | null {
  const xs = present(values);
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) : null;
}

/** Media dei valori presenti; null se non ce n'è nessuno. */
export function mean(values: (number | null | undefined)[]): number | null {
  const total = sum(values);
  return total === null ? null : total / present(values).length;
}

/** Esecuzioni di cardio per attrezzo (o nome, se manca), nell'ordine in cui compaiono. */
export function cardioSummary(sessions: Session[]): CardioRow[] {
  const groups = new Map<string, Exercise[]>();
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (ex.kind !== "cardio") continue;
      const key = ex.equipment ?? ex.name;
      groups.set(key, [...(groups.get(key) ?? []), ex]);
    }
  }
  return [...groups].map(([equipment, list]) => {
    const seconds = sum(list.map((e) => e.duration_s));
    const meters = sum(list.map((e) => e.distance_m));
    return {
      equipment,
      executions: list.length,
      minutes: seconds === null ? null : seconds / 60,
      km: meters === null ? null : meters / 1000,
      kcal: sum(list.map((e) => e.calories_kcal)),
      moves_avg: mean(list.map((e) => e.moves)),
    };
  });
}
