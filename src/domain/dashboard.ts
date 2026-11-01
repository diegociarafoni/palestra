import { z } from "zod";
import { E1rmSeriesSchema, StrengthTableSchema } from "./metrics";
import { PlannedSlotSchema } from "./planning";
import { FeedbackSchema, MeasureSchema, SchedaSchema } from "./types";

// Schemi delle risposte dell'API della dashboard: l'API li rispetta, il frontend li usa per
// validare. Questo file importa solo zod e moduli di `src/domain/`.

/** Mese di calendario `AAAA-MM`. */
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** `GET /api/measures`: tutte le misure, in ordine di data (anche quelle fuori protocollo). */
export const MeasuresResponseSchema = z.object({
  measures: z.array(MeasureSchema),
});
export type MeasuresResponse = z.infer<typeof MeasuresResponseSchema>;

/** `GET /api/scheda`: la scheda attiva oggi, con il Markdown della stessa riga. */
export const SchedaResponseSchema = z.object({
  version: z.string(),
  valid_from: z.iso.date(),
  valid_to: z.iso.date(),
  md: z.string(),
  json: SchedaSchema,
});
export type SchedaResponse = z.infer<typeof SchedaResponseSchema>;

/** `GET /api/reports/:month`: report e revisione del mese (null se assenti, non entrambi). */
export const ReportsResponseSchema = z.object({
  month: MonthSchema,
  report: z.string().nullable(),
  revisione: z.string().nullable(),
});
export type ReportsResponse = z.infer<typeof ReportsResponseSchema>;

// `@__PURE__` (come in types.ts): finché il frontend non usa questi schemi, restano fuori dal
// bundle in site/ con i nomi dei loro campi.

/** Riassunto di una seduta: data di calendario (Europe/Rome), nome e MOVEs. */
export const SessionSummarySchema = /* @__PURE__ */ z.object({
  date: z.iso.date(),
  name: z.string(),
  moves: z.number().nullable(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** `GET /api/week?date=`: slot della settimana ISO di `date`, sedute da lunedì a domenica. */
export const WeekResponseSchema = /* @__PURE__ */ z.object({
  slots: z.array(PlannedSlotSchema),
  sessions: z.array(SessionSummarySchema),
  // Somma dei MOVEs delle sedute che li hanno.
  moves_total: z.number(),
});
export type WeekResponse = z.infer<typeof WeekResponseSchema>;

/** `GET /api/calendar?month=`: slot del mese, sedute che nessuno slot cita, feedback del mese. */
export const CalendarResponseSchema = /* @__PURE__ */ z.object({
  slots: z.array(PlannedSlotSchema),
  extra: z.array(SessionSummarySchema),
  feedback: z.array(FeedbackSchema),
});
export type CalendarResponse = z.infer<typeof CalendarResponseSchema>;

/** `GET /api/exercises?month=`: due chiavi di `metrics` del mese, vuote se il report manca. */
export const ExercisesResponseSchema = /* @__PURE__ */ z.object({
  strength_table: StrengthTableSchema,
  e1rm_series: E1rmSeriesSchema,
});
export type ExercisesResponse = z.infer<typeof ExercisesResponseSchema>;
