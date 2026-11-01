import type { Db } from "../db/types";
import type { DashboardSlot } from "../domain/dashboard";
import type { PlannedSlot } from "../domain/planning";
import { listSessionDays } from "../store/sessions";

/** Aggiunge a ogni slot giorno e numero nel giorno della seduta abbinata (`session`, o null). */
export async function withSessionDays(
  db: Db,
  slots: PlannedSlot[],
): Promise<DashboardSlot[]> {
  const ids = slots.flatMap((s) =>
    s.session_id === null ? [] : [s.session_id],
  );
  const days = new Map(
    (await listSessionDays(db, ids)).map((d) => [
      d.session_id,
      { date: d.date, seq: d.seq },
    ]),
  );
  return slots.map((s) => ({
    ...s,
    session:
      (s.session_id === null ? undefined : days.get(s.session_id)) ?? null,
  }));
}
