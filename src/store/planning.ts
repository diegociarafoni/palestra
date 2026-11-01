import { z } from "zod";
import type { Db } from "../db/types";
import { isoWeek, lastDayOfMonth } from "../domain/dates";
import { type PlannedSlot, PlannedSlotSchema } from "../domain/planning";
import { parseJsonColumn, parseStored } from "./json";

// Slot programmati in sola lettura; le scritture (ensureWeekSlots, updateSlot) arrivano col Task 4.

type SlotRow = {
  rowid: number;
  id: string;
  week: string;
  slot: number;
  window_days: string;
  date: string | null;
  scheda_day: string;
  status: string;
  reason: string | null;
  session_id: string | null;
};

const COLUMNS =
  "rowid, id, week, slot, window_days, date, scheda_day, status, reason, session_id";

// Nel messaggio d'errore il rowid, mai l'id dello slot: contiene la settimana.
function toSlot(r: SlotRow): PlannedSlot {
  const key = `rowid ${r.rowid}`;
  const { rowid: _rowid, window_days, ...rest } = r;
  const window = parseJsonColumn(
    z.unknown(),
    window_days,
    "planned_sessions",
    key,
  );
  return parseStored(
    PlannedSlotSchema,
    { ...rest, window },
    "planned_sessions",
    key,
  );
}

/** Slot della settimana ISO `week` (`YYYY-Www`), in ordine di numero. */
export async function listSlotsByWeek(
  db: Db,
  week: string,
): Promise<PlannedSlot[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM planned_sessions WHERE week = ?1 ORDER BY slot`,
    )
    .bind(week)
    .all<SlotRow>();
  return results.map(toSlot);
}

/**
 * Slot del mese `YYYY-MM`, in ordine di settimana e di numero. Uno slot appartiene al mese
 * del primo giorno della sua finestra: le settimane a cavallo di due mesi si dividono così.
 */
export async function listSlotsByMonth(
  db: Db,
  month: string,
): Promise<PlannedSlot[]> {
  // Il confronto tra stringhe `YYYY-Www` segue l'ordine delle settimane.
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM planned_sessions WHERE week BETWEEN ?1 AND ?2
       ORDER BY week, slot`,
    )
    .bind(isoWeek(`${month}-01`), isoWeek(lastDayOfMonth(month)))
    .all<SlotRow>();
  return results.map(toSlot).filter((s) => s.window[0]?.slice(0, 7) === month);
}
