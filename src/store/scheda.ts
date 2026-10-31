import type { Db } from "../db/types";
import { type Scheda, SchedaSchema } from "../domain/types";
import { parseJsonColumn } from "./json";

/** Scheda valida in `date` (`YYYY-MM-DD`); a parità vince l'inizio più recente. */
export async function getActiveScheda(
  db: Db,
  date: string,
): Promise<Scheda | null> {
  const row = await db
    .prepare(
      `SELECT version, json FROM scheda
       WHERE valid_from <= ?1 AND (valid_to IS NULL OR valid_to >= ?1)
       ORDER BY valid_from DESC LIMIT 1`,
    )
    .bind(date)
    .first<{ version: string; json: string }>();
  return row === null
    ? null
    : parseJsonColumn(SchedaSchema, row.json, "scheda", row.version);
}
