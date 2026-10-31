import type { z } from "zod";
import { ParseError } from "../errors";

// Gli errori nominano la tabella e solo una chiave non personale (id intero, rowid,
// chiave di profilo, versione, mese): mai session_id, date, settimane o contenuto.

/** Valida un valore letto da D1 (riga o JSON già decodificato) con il suo schema. */
export function parseStored<T>(
  schema: z.ZodType<T>,
  value: unknown,
  table: string,
  key: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ParseError(`D1: dato non conforme in ${table} (${key})`, {
      cause: result.error,
    });
  }
  return result.data;
}

/** Decodifica e valida una colonna JSON di D1. */
export function parseJsonColumn<T>(
  schema: z.ZodType<T>,
  text: string,
  table: string,
  key: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ParseError(`D1: JSON non valido in ${table} (${key})`, {
      cause: error,
    });
  }
  return parseStored(schema, value, table, key);
}
