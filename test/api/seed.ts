import type { Db } from "../../src/db/types";

// Popolano il D1 locale dei test con righe sintetiche (INSERT diretti: la sync è l'unica
// che scrive `sessions`/`timeseries`, qui servono solo misure e schede).

/** Inserisce misure già nel formato della colonna `json`; la riga ha id 1, 2, … nell'ordine dato. */
export async function seedMeasures(
  db: Db,
  measures: ReadonlyArray<{ date: string }>,
): Promise<void> {
  const insert = db.prepare(
    "INSERT INTO measures (id, date, json) VALUES (?1, ?2, ?3)",
  );
  await db.batch(
    measures.map((m, i) => insert.bind(i + 1, m.date, JSON.stringify(m))),
  );
}

/** Inserisce una scheda con il suo Markdown, nelle colonne coerenti con il JSON. */
export async function seedScheda(
  db: Db,
  scheda: { version: string; valid_from: string; valid_to: string },
  md: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(
      scheda.version,
      scheda.valid_from,
      scheda.valid_to,
      JSON.stringify(scheda),
      md,
    )
    .run();
}
