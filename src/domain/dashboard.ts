import { z } from "zod";
import { MeasureSchema, SchedaSchema } from "./types";

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
