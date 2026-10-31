import { z } from "zod";

// Valori della tabella `metrics` (una riga per chiave e mese), scritti dal report e letti dalla
// dashboard. StrengthTableSchema ed E1rmSeriesSchema sono concordati con la dashboard (Task 10).

const SetRefSchema = z.object({
  date: z.iso.date(),
  load_kg: z.number(),
  reps: z.number(),
});
export const StrengthTableSchema = z.array(
  z.object({
    slug: z.string(),
    name: z.string(), // name = technogym_name della scheda
    sessions: z.int(), // sedute del mese con l'esercizio
    // serie migliore della prima e dell'ultima seduta
    first: SetRefSchema.nullable(),
    last: SetRefSchema.nullable(),
    e1rm_start_kg: z.number().nullable(),
    e1rm_end_kg: z.number().nullable(),
    e1rm_delta_pct: z.number().nullable(),
    reliability: z.enum(["confermato", "da_rivedere", "bloccato"]).nullable(),
    next: z.object({
      load_kg: z.number().nullable(),
      reps_target: z.int(),
      action: z.enum(["increase", "decrease", "hold", "calibrate"]),
    }),
  }),
);
export const E1rmSeriesSchema = z.array(
  z.object({
    slug: z.string(),
    name: z.string(),
    // una per seduta, in ordine di data
    points: z.array(z.object({ date: z.iso.date(), e1rm_kg: z.number() })),
  }),
);

export type StrengthTable = z.infer<typeof StrengthTableSchema>;
export type E1rmSeries = z.infer<typeof E1rmSeriesSchema>;

export const WeeklyVolumeSchema = z.array(
  z.object({
    week: z.string().regex(/^\d{4}-W\d{2}$/),
    sessions: z.int(),
    sets: z.int(),
    tonnage_kg: z.number(),
    kg_per_set: z.number(),
  }),
);
export type WeeklyVolume = z.infer<typeof WeeklyVolumeSchema>;

export const RatiosSchema = z.object({
  hamstring_quad: z.number().nullable(),
  push_pull: z.number().nullable(),
  vertical_push_sets: z.number(),
});
export type Ratios = z.infer<typeof RatiosSchema>;

export const StatusSchema = z.enum(["ok", "watch", "fix"]);
export type Status = z.infer<typeof StatusSchema>;

export const AdherenceSchema = z.object({
  done: z.int(),
  planned: z.int(),
  skipped: z.array(z.object({ id: z.string(), reason: z.string().nullable() })),
});
export type Adherence = z.infer<typeof AdherenceSchema>;

export const FeedbackSummarySchema = z.object({
  ottima: z.int(),
  buona: z.int(),
  normale: z.int(),
  faticosa: z.int(),
  pessima: z.int(),
  joint_pain_days: z.int(),
});
export type FeedbackSummary = z.infer<typeof FeedbackSummarySchema>;

export const VolumeByMuscleSchema = z.object({
  // settimane del mese = giorni / 7; serie a settimana = totale / weeks
  weeks: z.number(),
  // totali del mese, lavoro indiretto al 50 %
  muscles: z.record(z.string(), z.number()),
  patterns: z.record(z.string(), z.number()),
});
export type VolumeByMuscle = z.infer<typeof VolumeByMuscleSchema>;

// Solo misure in protocollo, in ordine di data.
export const MeasuresTrendSchema = z.array(
  z.object({
    date: z.iso.date(),
    weight_kg: z.number().nullable(),
    waist_cm: z.number().nullable(),
    skeletal_muscle_kg: z.number().nullable(),
    fat_mass_kg: z.number().nullable(),
    body_fat_pct: z.number().nullable(),
  }),
);
export type MeasuresTrend = z.infer<typeof MeasuresTrendSchema>;

const nullableNumber = z.number().nullable();
const nullableStatus = StatusSchema.nullable();

// Indicatori della sintesi del mese (reports/TEMPLATE.md § 1).
export const KpiSchema = z.object({
  sessions: z.int(),
  adherence_pct: nullableNumber,
  adherence_status: nullableStatus,
  // Prima e ultima settimana con serie registrate (una settimana di solo cardio non conta).
  tonnage_first_week_kg: nullableNumber,
  tonnage_last_week_kg: nullableNumber,
  // Su kg per serie di quelle due settimane, non sul tonnellaggio grezzo: linee guida § 5
  // "crescente a parità di serie". Null con meno di due settimane con serie o se la prima ha
  // 0 kg per serie.
  tonnage_status: nullableStatus,
  e1rm_mean_delta_pct: nullableNumber,
  e1rm_exercises: z.int(),
  e1rm_status: nullableStatus,
  sets: z.int(),
  sets_per_week: z.number(),
  weight_first_kg: nullableNumber,
  weight_last_kg: nullableNumber,
  waist_first_cm: nullableNumber,
  waist_last_cm: nullableNumber,
  skeletal_muscle_last_kg: nullableNumber,
  fat_mass_last_kg: nullableNumber,
  moves_avg: nullableNumber,
  sleep_h_avg: nullableNumber,
  steps_avg: nullableNumber,
  hrv_ms_avg: nullableNumber,
  rhr_bpm_avg: nullableNumber,
  recovery_status: nullableStatus,
  hamstring_quad: nullableNumber,
  hamstring_quad_status: nullableStatus,
  push_pull: nullableNumber,
  push_pull_status: nullableStatus,
});
export type Kpi = z.infer<typeof KpiSchema>;

/** Le 9 chiavi della tabella `metrics` per un mese: la dashboard (Task 10) le importa da qui. */
export const MetricsSchema = z.object({
  kpi: KpiSchema,
  weekly_volume: WeeklyVolumeSchema,
  strength_table: StrengthTableSchema,
  e1rm_series: E1rmSeriesSchema,
  volume_by_muscle: VolumeByMuscleSchema,
  ratios: RatiosSchema,
  measures_trend: MeasuresTrendSchema,
  feedback_summary: FeedbackSummarySchema,
  adherence: AdherenceSchema,
});
export type Metrics = z.infer<typeof MetricsSchema>;
