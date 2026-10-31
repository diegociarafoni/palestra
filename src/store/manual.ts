import { z } from "zod";
import type { Db } from "../db/types";
import {
  type Feedback,
  type FeedbackInput,
  FeedbackInputSchema,
  FeedbackSchema,
  type Measure,
  MeasureSchema,
  type Recovery,
  RecoverySchema,
} from "../domain/types";
import { ParseError } from "../errors";
import { auditStatement } from "./audit";
import { parseJsonColumn, parseStored } from "./json";

// Riga di `feedback` letta da D1: joint_pain è 0/1.
const FeedbackRowSchema = FeedbackSchema.extend({
  joint_pain: z.union([z.literal(0), z.literal(1)]).transform((v) => v === 1),
});

/**
 * Salva il feedback del giorno (uno per data) e la riga `audit` nello stesso batch.
 * planned_id e session_id già presenti restano se il nuovo valore è vuoto.
 */
export async function upsertFeedback(
  db: Db,
  f: FeedbackInput,
  actor: string,
): Promise<Feedback> {
  const parsed = FeedbackInputSchema.safeParse(f);
  if (!parsed.success) {
    throw new ParseError("feedback non valido", { cause: parsed.error });
  }
  const input = parsed.data;
  const existing = await db
    .prepare("SELECT id FROM feedback WHERE date = ?1")
    .bind(input.date)
    .first();
  const [saved] = await db.batch([
    db
      .prepare(
        `INSERT INTO feedback
           (planned_id, session_id, date, class, joint_pain, joint_where, notes, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (date) DO UPDATE SET
           planned_id = COALESCE(excluded.planned_id, feedback.planned_id),
           session_id = COALESCE(excluded.session_id, feedback.session_id),
           class = excluded.class,
           joint_pain = excluded.joint_pain,
           joint_where = excluded.joint_where,
           notes = excluded.notes,
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .bind(
        input.planned_id ?? null,
        input.session_id ?? null,
        input.date,
        input.class,
        input.joint_pain ? 1 : 0,
        input.joint_where ?? null,
        input.notes ?? null,
        new Date().toISOString(),
      ),
    auditStatement(
      db,
      actor,
      "feedback",
      input.date,
      existing ? "update" : "insert",
    ),
  ]);
  return parseStored(
    FeedbackRowSchema,
    saved?.results[0],
    "feedback",
    input.date,
  );
}

/** Feedback del mese `YYYY-MM`, in ordine di data. */
export async function listFeedback(db: Db, month: string): Promise<Feedback[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM feedback WHERE substr(date, 1, 7) = ?1 ORDER BY date",
    )
    .bind(month)
    .all<{ date: string }>();
  return results.map((r) =>
    parseStored(FeedbackRowSchema, r, "feedback", r.date),
  );
}

/** Misure tra `from` e `to` inclusi (date `YYYY-MM-DD`, estremi facoltativi). */
export async function listMeasures(
  db: Db,
  from?: string,
  to?: string,
): Promise<Measure[]> {
  const { results } = await db
    .prepare(
      `SELECT id, json FROM measures
       WHERE (?1 IS NULL OR date >= ?1) AND (?2 IS NULL OR date <= ?2)
       ORDER BY date, id`,
    )
    .bind(from ?? null, to ?? null)
    .all<{ id: number; json: string }>();
  return results.map((r) =>
    parseJsonColumn(MeasureSchema, r.json, "measures", String(r.id)),
  );
}

/** Recupero tra le settimane ISO `from` e `to` incluse (`YYYY-Www`, estremi facoltativi). */
export async function listRecovery(
  db: Db,
  from?: string,
  to?: string,
): Promise<Recovery[]> {
  const { results } = await db
    .prepare(
      `SELECT week, json FROM recovery
       WHERE (?1 IS NULL OR week >= ?1) AND (?2 IS NULL OR week <= ?2)
       ORDER BY week`,
    )
    .bind(from ?? null, to ?? null)
    .all<{ week: string; json: string }>();
  return results.map((r) =>
    parseJsonColumn(RecoverySchema, r.json, "recovery", r.week),
  );
}

/** Valore della chiave di profilo letto con `schema`; null se la chiave manca. */
export async function getProfile<T>(
  db: Db,
  key: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const json = await db
    .prepare("SELECT json FROM profile WHERE key = ?1")
    .bind(key)
    .first<string>("json");
  return json === null ? null : parseJsonColumn(schema, json, "profile", key);
}
