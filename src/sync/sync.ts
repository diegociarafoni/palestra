import { z } from "zod";
import type { Db } from "../db/types";
import { isoWeek, romeDate } from "../domain/dates";
import {
  matchSession,
  overdue,
  type PlannedSlot,
  type WeekTemplate,
  WeekTemplateSchema,
} from "../domain/planning";
import type { Session } from "../domain/types";
import { ParseError } from "../errors";
import type { MywellnessClient } from "../mywellness/client";
import { normalizeSession } from "../mywellness/normalize";
import { getProfile } from "../store/manual";
import {
  ensureWeekSlots,
  listSlotsByWeek,
  updateSlot,
} from "../store/planning";
import {
  knownSessionIds,
  listSessionStarts,
  upsertSession,
} from "../store/sessions";

// Sync delle sedute Mywellness in D1. Nessun log con dati: id, date e contenuti restano qui.

/** Metodi del client usati dalla sync (i test passano un oggetto finto). */
export type SyncClient = Pick<
  MywellnessClient,
  | "listSessionIds"
  | "getSession"
  | "getStrengthDetailHtml"
  | "getCardioTimeseries"
>;

const DEFAULT_LOOKBACK_DAYS = 14;
const DAY_MS = 86_400_000;

/** Data `YYYY-MM-DD` spostata di `n` giorni. */
function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// Campi della seduta grezza che dicono quali pagine scaricare (docs/mywellness-api.md § 2);
// il resto lo valida normalizeSession. "2026-11-06 18:05:30 +01:00": data e ora del club.
const RawRefsSchema = z.looseObject({
  data: z.looseObject({
    startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2} /),
    physicalActivities: z.array(
      z.looseObject({
        isCardio: z.boolean(),
        analyticsId: z.string().nullish(),
        performedPhysicalActivity: z.looseObject({
          id: z.string(),
          facilityId: z.string().nullish(),
          data: z.looseObject({ data: z.array(z.unknown()) }),
        }),
      }),
    ),
  }),
});

/**
 * Seduta normalizzata e serie temporali per ordine dell'esercizio. Dettaglio forza per gli
 * esercizi di forza con dati dell'attrezzo (senza dati: registrati a mano, nessuna pagina);
 * serie temporale per i cardio con `analyticsId` e `facilityId`.
 */
async function fetchSession(
  client: SyncClient,
  id: string,
): Promise<{ session: Session; series: Record<number, unknown> }> {
  const raw = await client.getSession(id);
  const refs = RawRefsSchema.safeParse(raw);
  if (!refs.success) {
    throw new ParseError("Mywellness: dettaglio seduta non conforme", {
      cause: refs.error,
    });
  }
  const day = refs.data.data.startedOn.slice(0, 10);
  const strengthDetails: Record<string, string> = {};
  const timeseries: Record<string, unknown> = {};
  const series: Record<number, unknown> = {};
  for (const [index, a] of refs.data.data.physicalActivities.entries()) {
    const { id: activityId, facilityId, data } = a.performedPhysicalActivity;
    if (!a.isCardio && data.data.length > 0) {
      strengthDetails[activityId] = await client.getStrengthDetailHtml(
        activityId,
        day,
      );
    }
    if (a.isCardio && a.analyticsId && facilityId) {
      const value = await client.getCardioTimeseries(a.analyticsId, facilityId);
      // normalizeSession le legge per id dell'attività, upsertSession per ordine (da 1).
      timeseries[activityId] = value;
      series[index + 1] = value;
    }
  }
  const session = normalizeSession(raw, {
    sessionId: id,
    strengthDetails,
    timeseries,
  });
  return { session, series };
}

/**
 * Abbina agli slot le sedute della finestra che nessuno slot riferisce ancora, nuove o già
 * salvate, creando gli slot mancanti delle settimane da `since` a `today`; poi segna
 * `da_confermare` gli slot scaduti. Restituisce il numero di slot modificati.
 */
async function updateSlots(
  db: Db,
  tpl: WeekTemplate,
  since: string,
  today: string,
): Promise<number> {
  const weeks = new Map<string, PlannedSlot[]>();
  const slotsOf = async (week: string): Promise<PlannedSlot[]> => {
    let slots = weeks.get(week);
    if (slots === undefined) {
      await ensureWeekSlots(db, week, tpl);
      slots = await listSlotsByWeek(db, week);
      weeks.set(week, slots);
    }
    return slots;
  };
  for (let day = since; day <= today; day = addDays(day, 1)) {
    await slotsOf(isoWeek(day));
  }
  // In ordine di inizio: il sabato recupera lo slot 1 prima che la domenica recuperi il 2.
  const sessions = await listSessionStarts(db, since);
  for (const s of sessions) await slotsOf(isoWeek(romeDate(s.started_at)));
  const referenced = new Set(
    [...weeks.values()].flat().flatMap((slot) => slot.session_id ?? []),
  );
  let updated = 0;
  for (const session of sessions) {
    // Già abbinata, o extra: riesaminare una extra dà di nuovo extra.
    if (referenced.has(session.session_id)) continue;
    const date = romeDate(session.started_at);
    const slots = await slotsOf(isoWeek(date));
    const match = matchSession(date, slots, tpl);
    if (match.kind === "extra") continue;
    // Uno slot `saltata` che riceve una seduta perde il motivo: la seduta reale prevale.
    const patch = {
      status: match.status,
      session_id: session.session_id,
      reason: null,
    };
    await updateSlot(db, match.id, patch);
    // L'abbinamento successivo vede lo slot aggiornato.
    const index = slots.findIndex((s) => s.id === match.id);
    const slot = slots[index];
    if (slot !== undefined) slots[index] = { ...slot, ...patch };
    updated++;
  }
  for (const slots of weeks.values()) {
    for (const id of overdue(slots, today)) {
      await updateSlot(db, id, { status: "da_confermare" });
      updated++;
    }
  }
  return updated;
}

/**
 * Salva in D1 le sedute nuove degli ultimi `lookbackDays` giorni (fino a `today`, data di
 * Roma) e aggiorna gli slot programmati. Le sedute già presenti non si scaricano di nuovo:
 * ripetere la sync non cambia nulla. Il modello settimanale si legge e tutte le sedute nuove
 * si scaricano prima di ogni scrittura: un modello non valido o un errore di Mywellness non
 * scrive nulla. Se D1 fallisce dopo il salvataggio delle sedute, o se il modello manca, la
 * sync successiva con il modello abbina comunque le sedute della finestra rimaste senza slot.
 */
export async function sync(
  client: SyncClient,
  db: Db,
  opts: { lookbackDays?: number; today?: string } = {},
): Promise<{ newSessions: number; slotsUpdated: number }> {
  const today = opts.today ?? romeDate(new Date().toISOString());
  const since = addDays(today, -(opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS));
  const tpl = await getProfile(db, "settimana_tipo", WeekTemplateSchema);
  const ids = await client.listSessionIds({ since, until: today });
  const known = await knownSessionIds(db, since);
  const fetched: Awaited<ReturnType<typeof fetchSession>>[] = [];
  for (const id of ids) {
    if (!known.has(id)) fetched.push(await fetchSession(client, id));
  }
  for (const { session, series } of fetched) {
    await upsertSession(db, session, series);
  }
  if (tpl === null) {
    // Senza modello le sedute si salvano comunque: le abbina la prima sync con il modello.
    console.error(
      "Modello settimanale assente (profile, settimana_tipo): slot non aggiornati",
    );
    return { newSessions: fetched.length, slotsUpdated: 0 };
  }
  const slotsUpdated = await updateSlots(db, tpl, since, today);
  return { newSessions: fetched.length, slotsUpdated };
}
