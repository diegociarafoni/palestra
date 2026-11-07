import { z } from "zod";
import type { Db } from "../db/types";
import type { ExtraSession, SessionSummary } from "../domain/dashboard";
import { romeDate } from "../domain/dates";
import { type Session, SessionSchema } from "../domain/types";
import { parseJsonColumn, parseStored } from "./json";

/** Scrive seduta e serie temporali in un solo batch; ripeterla non duplica righe. */
export async function upsertSession(
  db: Db,
  s: Session,
  ts: Record<number, unknown>,
): Promise<void> {
  const session = db
    .prepare(
      `INSERT INTO sessions (session_id, date, started_at, json) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (session_id) DO UPDATE SET
         date = excluded.date, started_at = excluded.started_at, json = excluded.json`,
    )
    .bind(
      s.session_id,
      romeDate(s.started_at),
      s.started_at,
      JSON.stringify(s),
    );
  const series = Object.entries(ts).map(([ord, value]) =>
    db
      .prepare(
        `INSERT INTO timeseries (session_id, ord, json) VALUES (?1, ?2, ?3)
         ON CONFLICT (session_id, ord) DO UPDATE SET json = excluded.json`,
      )
      .bind(s.session_id, Number(ord), JSON.stringify(value)),
  );
  await db.batch([session, ...series]);
}

/** Id delle sedute con data (Europe/Rome) uguale o successiva a `sinceDate`. */
export async function knownSessionIds(
  db: Db,
  sinceDate: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT session_id FROM sessions WHERE date >= ?1")
    .bind(sinceDate)
    .all<{ session_id: string }>();
  return new Set(results.map((r) => r.session_id));
}

const SessionStartSchema = SessionSchema.pick({
  session_id: true,
  started_at: true,
});

/**
 * Id e inizio delle sedute con data (Europe/Rome) uguale o successiva a `sinceDate`, in ordine
 * cronologico (sola lettura, per l'abbinamento agli slot).
 */
export async function listSessionStarts(
  db: Db,
  sinceDate: string,
): Promise<Pick<Session, "session_id" | "started_at">[]> {
  // julianday() confronta gli istanti anche con offset diversi (+01:00, +02:00, Z).
  const { results } = await db
    .prepare(
      `SELECT rowid, session_id, started_at FROM sessions WHERE date >= ?1
       ORDER BY julianday(started_at), session_id`,
    )
    .bind(sinceDate)
    .all<{ rowid: number; session_id: string; started_at: string }>();
  // Nel messaggio d'errore il rowid, mai session_id o date (finirebbero nei log).
  return results.map(({ rowid, ...row }) =>
    parseStored(SessionStartSchema, row, "sessions", `rowid ${rowid}`),
  );
}

const SessionDaySchema = z.object({
  session_id: z.string(),
  date: z.iso.date(),
  seq: z.int().min(1),
});
export type SessionDay = z.infer<typeof SessionDaySchema>;

/**
 * Giorno (Europe/Rome) e numero nel giorno (`seq`, 1 = la prima) delle sedute `ids`, in ordine
 * cronologico; gli id sconosciuti mancano. Il numero conta tutte le sedute del giorno, in ordine
 * di istante: è il `seq` del feedback della seduta (chiave data e `seq`).
 */
export async function listSessionDays(
  db: Db,
  ids: string[],
): Promise<SessionDay[]> {
  // Gli id arrivano come un solo array JSON (json_each), qualunque sia il loro numero.
  const { results } = await db
    .prepare(
      `SELECT rowid, session_id, date, seq FROM (
         SELECT rowid, session_id, date, started_at,
           ROW_NUMBER() OVER (
             PARTITION BY date ORDER BY julianday(started_at), session_id
           ) AS seq
         FROM sessions
         WHERE date IN (
           SELECT date FROM sessions
           WHERE session_id IN (SELECT value FROM json_each(?1))
         )
       )
       WHERE session_id IN (SELECT value FROM json_each(?1))
       ORDER BY julianday(started_at), session_id`,
    )
    .bind(JSON.stringify(ids))
    .all<{ rowid: number; session_id: string; date: string; seq: number }>();
  // Nel messaggio d'errore il rowid, mai session_id o date (finirebbero nei log).
  return results.map(({ rowid, ...row }) =>
    parseStored(SessionDaySchema, row, "sessions", `rowid ${rowid}`),
  );
}

/** Sedute del mese `YYYY-MM` (data Europe/Rome), in ordine cronologico. */
export async function listSessionsByMonth(
  db: Db,
  month: string,
): Promise<Session[]> {
  // julianday() confronta gli istanti anche con offset diversi (+01:00, +02:00, Z).
  const { results } = await db
    .prepare(
      `SELECT rowid, json FROM sessions WHERE substr(date, 1, 7) = ?1
       ORDER BY julianday(started_at), session_id`,
    )
    .bind(month)
    .all<{ rowid: number; json: string }>();
  // Nel messaggio d'errore il rowid, mai session_id o date (finirebbero nei log).
  return results.map((r) =>
    parseJsonColumn(SessionSchema, r.json, "sessions", `rowid ${r.rowid}`),
  );
}

type SummaryRow = { rowid: number; date: string; json: string };

// Nel messaggio d'errore il rowid, mai session_id o date (finirebbero nei log).
function toSummary(r: SummaryRow): SessionSummary {
  const { name, moves } = parseJsonColumn(
    SessionSchema,
    r.json,
    "sessions",
    `rowid ${r.rowid}`,
  );
  return { date: r.date, name, moves };
}

/** Riassunti delle sedute tra `from` e `to` inclusi (date Europe/Rome), in ordine cronologico. */
export async function listSessionSummaries(
  db: Db,
  from: string,
  to: string,
): Promise<SessionSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT rowid, date, json FROM sessions WHERE date BETWEEN ?1 AND ?2
       ORDER BY julianday(started_at), session_id`,
    )
    .bind(from, to)
    .all<SummaryRow>();
  return results.map(toSummary);
}

/**
 * Riassunti delle sedute del mese `YYYY-MM` (data Europe/Rome) che nessuno slot cita, in ordine
 * cronologico, ognuna con il suo numero nel giorno (`seq`), contando anche le sedute abbinate.
 * Contano tutti gli slot, non solo quelli del mese: una seduta di inizio mese può recuperare uno
 * slot la cui finestra è nel mese precedente.
 */
export async function listUnmatchedSessionSummaries(
  db: Db,
  month: string,
): Promise<ExtraSession[]> {
  // Il numero si calcola su tutte le sedute del giorno, prima di togliere quelle abbinate.
  const { results } = await db
    .prepare(
      `SELECT rowid, date, json, seq FROM (
         SELECT rowid, session_id, date, started_at, json,
           ROW_NUMBER() OVER (
             PARTITION BY date ORDER BY julianday(started_at), session_id
           ) AS seq
         FROM sessions WHERE substr(date, 1, 7) = ?1
       ) AS day
       WHERE NOT EXISTS (
         SELECT 1 FROM planned_sessions
         WHERE planned_sessions.session_id = day.session_id
       )
       ORDER BY julianday(started_at), session_id`,
    )
    .bind(month)
    .all<SummaryRow & { seq: number }>();
  return results.map((r) => ({ ...toSummary(r), seq: r.seq }));
}
