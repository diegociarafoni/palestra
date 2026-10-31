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
