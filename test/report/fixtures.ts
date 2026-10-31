import { z } from "zod";
import { PlannedSlotSchema } from "../../src/domain/planning";
import {
  FeedbackSchema,
  MeasureSchema,
  RecoverySchema,
  SchedaSchema,
  SessionSchema,
} from "../../src/domain/types";
import feedbackJson from "../fixtures/report/feedback.json";
import measuresJson from "../fixtures/report/measures.json";
import recoveryJson from "../fixtures/report/recovery.json";
import schedaJson from "../fixtures/report/scheda.json";
import sessionsJson from "../fixtures/report/sessions.json";
import slotsJson from "../fixtures/report/slots.json";

// Mese sintetico 2026-11: le fixture devono rispettare gli schemi di dominio.
export const scheda = SchedaSchema.parse(schedaJson);
export const sessions = z.array(SessionSchema).parse(sessionsJson);
export const slots = z.array(PlannedSlotSchema).parse(slotsJson);
export const measures = z.array(MeasureSchema).parse(measuresJson);
export const recovery = z.array(RecoverySchema).parse(recoveryJson);
export const feedback = z.array(FeedbackSchema).parse(feedbackJson);
