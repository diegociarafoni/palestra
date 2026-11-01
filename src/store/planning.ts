import { z } from "zod";
import type { Db } from "../db/types";
import { isoWeek, lastDayOfMonth } from "../domain/dates";
import {
  type PlannedSlot,
  PlannedSlotSchema,
  type WeekTemplate,
  weekSlots,
} from "../domain/planning";
import { parseJsonColumn, parseStored } from "./json";

// Slot programmati: letture (Task 6) e scritture della sync (Task 4, ensureWeekSlots e updateSlot).

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

/** Crea gli slot mancanti della settimana `week` secondo il modello; gli slot già presenti restano. */
export async function ensureWeekSlots(
  db: Db,
  week: string,
  tpl: WeekTemplate,
): Promise<void> {
  const inserts = weekSlots(week, tpl).map((s) =>
    db
      .prepare(
        `INSERT INTO planned_sessions
           (id, week, slot, window_days, date, scheda_day, status, reason, session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT DO NOTHING`,
      )
      .bind(
        s.id,
        s.week,
        s.slot,
        JSON.stringify(s.window),
        s.date,
        s.scheda_day,
        s.status,
        s.reason,
        s.session_id,
      ),
  );
  // Un batch vuoto è un errore di D1: modello senza slot, nulla da creare.
  if (inserts.length > 0) await db.batch(inserts);
}

/** Campi di uno slot che si aggiornano; `null` svuota il campo, un campo assente resta. */
export type SlotPatch = Partial<
  Pick<PlannedSlot, "status" | "session_id" | "reason">
>;

const PATCH_COLUMNS = ["status", "session_id", "reason"] as const;

/** Aggiorna lo slot `id` con i campi presenti in `patch`. */
export async function updateSlot(
  db: Db,
  id: string,
  patch: SlotPatch,
): Promise<void> {
  const columns = PATCH_COLUMNS.filter((c) => patch[c] !== undefined);
  if (columns.length === 0) return;
  const set = columns.map((c, i) => `${c} = ?${i + 2}`).join(", ");
  await db
    .prepare(`UPDATE planned_sessions SET ${set} WHERE id = ?1`)
    .bind(id, ...columns.map((c) => patch[c]))
    .run();
}
