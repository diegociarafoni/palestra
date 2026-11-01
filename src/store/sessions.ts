import type { Db } from "../db/types";
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
