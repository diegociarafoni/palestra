import type { Db } from "../../src/db/types";
import type { PlannedSlot } from "../../src/domain/planning";

// Popolano il D1 locale dei test con righe sintetiche (INSERT diretti: la sync è l'unica
// che scrive `sessions`/`timeseries`, qui servono solo misure, schede e slot; le sedute si
// scrivono con `upsertSession`, la funzione della sync).

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

/** Inserisce slot programmati; la finestra va in `window_days` come array JSON. */
export async function seedSlots(
  db: Db,
  slots: ReadonlyArray<PlannedSlot>,
): Promise<void> {
  const insert = db.prepare(
    `INSERT INTO planned_sessions
       (id, week, slot, window_days, date, scheda_day, status, reason, session_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  );
  await db.batch(
    slots.map((s) =>
      insert.bind(
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
    ),
  );
}
