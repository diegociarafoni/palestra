import { z } from "zod";
import type { Db } from "../db/types";
import { parseJsonColumn } from "./json";

export type ReportKind = "report" | "revisione";

/** Salva il Markdown del mese; un nuovo salvataggio sostituisce il precedente. */
export async function saveReport(
  db: Db,
  month: string,
  kind: ReportKind,
  md: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reports (month, kind, md, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (month, kind) DO UPDATE SET
         md = excluded.md, created_at = excluded.created_at`,
    )
    .bind(month, kind, md, new Date().toISOString())
    .run();
}

export async function getReport(
  db: Db,
  month: string,
  kind: ReportKind,
): Promise<string | null> {
  return db
    .prepare("SELECT md FROM reports WHERE month = ?1 AND kind = ?2")
    .bind(month, kind)
    .first<string>("md");
}

/** Una riga per chiave, valore in JSON; le chiavi già salvate e non ripetute restano. */
export async function saveMetrics(
  db: Db,
  month: string,
  metrics: Record<string, unknown>,
): Promise<void> {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return; // D1 rifiuta un batch vuoto
  await db.batch(
    entries.map(([key, value]) =>
      db
        .prepare(
          `INSERT INTO metrics (month, key, json) VALUES (?1, ?2, ?3)
           ON CONFLICT (month, key) DO UPDATE SET json = excluded.json`,
        )
        .bind(month, key, JSON.stringify(value)),
    ),
  );
}

export async function getMetrics(
  db: Db,
  month: string,
): Promise<Record<string, unknown>> {
  const { results } = await db
    .prepare("SELECT key, json FROM metrics WHERE month = ?1")
    .bind(month)
    .all<{ key: string; json: string }>();
  return Object.fromEntries(
    results.map((r) => [
      r.key,
      parseJsonColumn(z.unknown(), r.json, "metrics", `${month}/${r.key}`),
    ]),
  );
}
