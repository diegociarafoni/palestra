import type { Db } from "../db/types";
import { type Scheda, SchedaSchema } from "../domain/types";
import { ParseError } from "../errors";
import { parseJsonColumn } from "./json";

/** Scheda valida in `date` (`YYYY-MM-DD`); a parità vince l'inizio più recente. */
export async function getActiveScheda(
  db: Db,
  date: string,
): Promise<Scheda | null> {
  return (await getActiveSchedaWithMd(db, date))?.scheda ?? null;
}

/**
 * Scheda valida in `date` con il Markdown (`md`) della stessa riga: lo usa la dashboard, che
 * mostra la scheda leggibile accanto ai dati strutturati. A parità vince l'inizio più recente.
 */
export async function getActiveSchedaWithMd(
  db: Db,
  date: string,
): Promise<{ scheda: Scheda; md: string } | null> {
  const row = await db
    .prepare(
      `SELECT version, valid_from, valid_to, json, md FROM scheda
       WHERE valid_from <= ?1 AND valid_to >= ?1
       ORDER BY valid_from DESC LIMIT 1`,
    )
    .bind(date)
    .first<{
      version: string;
      valid_from: string;
      valid_to: string;
      json: string;
      md: string;
    }>();
  if (row === null) return null;
  const scheda = parseJsonColumn(SchedaSchema, row.json, "scheda", row.version);
  if (
    scheda.version !== row.version ||
    scheda.valid_from !== row.valid_from ||
    scheda.valid_to !== row.valid_to
  ) {
    throw new ParseError(
      `D1: json e colonne non coerenti in scheda (${row.version})`,
    );
  }
  return { scheda, md: row.md };
}
