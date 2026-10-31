import { z } from "zod";

// Tipi di dominio e schemi zod; nomi dei campi come scheda/SCHEMA.md.

const nullableNumber = z.number().nullable();
const isoDateTime = z.iso.datetime({ offset: true });

// SCHEMA § 2: seduta normalizzata.
export const StrengthSetSchema = z.object({
  n: z.int(),
  reps_target: nullableNumber,
  reps_done: nullableNumber,
  load_target_kg: nullableNumber,
  load_done_kg: nullableNumber,
});
export type StrengthSet = z.infer<typeof StrengthSetSchema>;

// In D1 la serie temporale sta in timeseries(session_id, ord = order);
// `timeseries_ref` resta solo come campo facoltativo storico.
export const ExerciseSchema = z.object({
  order: z.int(),
  name: z.string(),
  equipment: z.string().nullable(),
  kind: z.enum(["cardio", "strength"]),
  sets: z.array(StrengthSetSchema),
  duration_s: nullableNumber.optional(),
  calories_kcal: nullableNumber.optional(),
  distance_m: nullableNumber.optional(),
  moves: nullableNumber.optional(),
  compliance_pct: nullableNumber.optional(),
  timeseries_ref: z.string().nullable().optional(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const SessionSchema = z.object({
  session_id: z.string(),
  source: z.enum(["mywellness-api", "export-zip", "manual"]),
  started_at: isoDateTime,
  ended_at: isoDateTime.nullable(),
  name: z.string(),
  program: z.string().nullable(),
  moves: nullableNumber,
  calories_kcal: nullableNumber,
  duration_s: nullableNumber,
  exercises: z.array(ExerciseSchema),
});
export type Session = z.infer<typeof SessionSchema>;

// Feedback di una seduta (dashboard, Task 12): una riga per data.
export const FeedbackClassSchema = z.enum([
  "ottima",
  "buona",
  "normale",
  "faticosa",
  "pessima",
]);

export const FeedbackInputSchema = z.object({
  date: z.iso.date(),
  class: FeedbackClassSchema,
  joint_pain: z.boolean(),
  joint_where: z.string().nullish(),
  notes: z.string().nullish(),
  planned_id: z.string().nullish(),
  session_id: z.string().nullish(),
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export const FeedbackSchema = z.object({
  id: z.int(),
  planned_id: z.string().nullable(),
  session_id: z.string().nullable(),
  date: z.iso.date(),
  class: FeedbackClassSchema,
  joint_pain: z.boolean(),
  joint_where: z.string().nullable(),
  notes: z.string().nullable(),
  updated_at: z.string(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

// SCHEMA § 4: misura corporea (tabella measures, colonna json).
export const MeasureSchema = z.object({
  date: z.iso.date(),
  time: z.string().nullable(),
  weight_kg: nullableNumber,
  waist_cm: nullableNumber,
  skeletal_muscle_kg: nullableNumber,
  fat_mass_kg: nullableNumber,
  body_fat_pct: nullableNumber,
  condition: z.string(),
  in_protocol: z.boolean(),
  source: z.enum(["inbody", "bilancia", "manuale"]),
  note: z.string(),
});
export type Measure = z.infer<typeof MeasureSchema>;

// SCHEMA § 4b: recupero settimanale (tabella recovery, colonna json).
export const RecoverySchema = z.object({
  week: z.string().regex(/^\d{4}-W\d{2}$/),
  sleep_h: nullableNumber,
  steps_avg: nullableNumber,
  hrv_ms: nullableNumber,
  rhr_bpm: nullableNumber,
  source: z.enum(["garmin", "health-connect", "manuale"]),
});
export type Recovery = z.infer<typeof RecoverySchema>;

// SCHEMA § 1: scheda (tabella scheda, colonna json).
const TrackingSchema = z.enum(["auto", "auto-if-900", "manual"]);

export const StrengthExerciseSchema = z.object({
  slug: z.string(),
  technogym_name: z.string(),
  equipment: z.string(),
  tracking: TrackingSchema,
  sets: z.int(),
  reps_min: z.int(),
  reps_max: z.int(),
  rest_s: z.number(),
  step_kg: z.number(),
  muscle_groups: z.array(z.string()),
  start_load_kg: z.number().nullable(),
  // Obbligatori (SCHEMA § 1): il report ne ricava volume indiretto e schemi di movimento.
  indirect_muscles: z.array(z.string()),
  movement_pattern: z.enum([
    "spinta-orizzontale",
    "spinta-verticale",
    "tirata-orizzontale",
    "tirata-verticale",
    "squat",
    "hinge",
    "flessione-ginocchio",
    "core",
    "altro",
  ]),
  notes: z.string().optional(),
});
export type StrengthExercise = z.infer<typeof StrengthExerciseSchema>;

export const CardioExerciseSchema = z.object({
  slug: z.string(),
  technogym_name: z.string(),
  equipment: z.string(),
  tracking: TrackingSchema,
  duration_min: z.number().optional(),
  target: z.string().optional(),
  notes: z.string().optional(),
});
export type CardioExercise = z.infer<typeof CardioExerciseSchema>;

export type SchedaExercise = StrengthExercise | CardioExercise;

const BlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("strength"),
    exercises: z.array(StrengthExerciseSchema),
  }),
  z.object({
    type: z.literal("warmup"),
    exercises: z.array(CardioExerciseSchema),
  }),
  z.object({
    type: z.literal("cardio"),
    exercises: z.array(CardioExerciseSchema),
  }),
]);

export const SchedaSchema = z.object({
  version: z.string(),
  valid_from: z.iso.date(),
  valid_to: z.iso.date(),
  goal: z.string(),
  sessions_per_week: z.int(),
  days: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      blocks: z.array(BlockSchema),
    }),
  ),
  cycle: z
    .object({
      number: z.int(),
      block: z.int(),
      weeks: z.int(),
      phase: z.enum(["avvio", "accumulo", "intensificazione", "scarico"]),
    })
    .optional(),
  goals: z
    .array(
      z.object({
        slug: z.string(),
        today: z.union([z.string(), z.number()]),
        target: z.union([z.string(), z.number()]),
        criterion: z.string(),
        priority: z.int(),
      }),
    )
    .optional(),
});
export type Scheda = z.infer<typeof SchedaSchema>;
