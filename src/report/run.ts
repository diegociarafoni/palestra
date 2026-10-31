import type { Db } from "../db/types";
import { isoWeek, lastDayOfMonth, romeDate } from "../domain/dates";
import { listFeedback, listMeasures, listRecovery } from "../store/manual";
import { listSlotsByMonth } from "../store/planning";
import { saveMetrics, saveReport } from "../store/reports";
import { getActiveScheda } from "../store/scheda";
import { listSessionsByMonth } from "../store/sessions";
import { renderReport, reportMetrics } from "./render";

/**
 * Legge da D1 i dati del mese `YYYY-MM`, salva il report (`reports`, tipo `report`) e le 9
 * metriche della dashboard (`metrics`). Non scrive su disco né sulla console.
 */
export async function runReport(db: Db, month: string): Promise<void> {
  const first = `${month}-01`;
  const last = lastDayOfMonth(month);
  const input = {
    month,
    generated_on: romeDate(new Date().toISOString()),
    scheda: await getActiveScheda(db, last),
    sessions: await listSessionsByMonth(db, month),
    slots: await listSlotsByMonth(db, month),
    measures: await listMeasures(db, first, last),
    recovery: await listRecovery(db, isoWeek(first), isoWeek(last)),
    feedback: await listFeedback(db, month),
  };
  await saveReport(db, month, "report", renderReport(input));
  await saveMetrics(db, month, reportMetrics(input));
}
