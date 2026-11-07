import { hc } from "hono/client";
import type { z } from "zod";
import type { AppType } from "../../../src/api/app";
import {
  CalendarResponseSchema,
  ExercisesResponseSchema,
  type FeedbackBody,
  MeasuresResponseSchema,
  ReportsResponseSchema,
  SchedaResponseSchema,
  type SlotPatchBody,
  WeekResponseSchema,
} from "../../../src/domain/dashboard";
import { PlannedSlotSchema } from "../../../src/domain/planning";
import { FeedbackSchema } from "../../../src/domain/types";
import { browser, SessionError } from "./session";

// Unico client dell'API (docs/buone-pratiche-react.md § 5): percorsi e tipi arrivano da `AppType`,
// le risposte si validano con gli schemi zod di src/domain/dashboard.ts. Con `X-Requested-With`
// Cloudflare Access risponde 401 a una sessione scaduta invece del redirect alla pagina di login
// (developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax).
const api = hc<AppType>("/", {
  headers: { "X-Requested-With": "XMLHttpRequest" },
}).api;

type ApiResponse = { status: number; json: () => Promise<unknown> };

// Ora dell'ultima ricarica per sessione scaduta (solo un numero, in ms): al massimo una al minuto.
const RELOAD_KEY = "palestra:lastReload";
const RELOAD_INTERVAL_MS = 60_000;

/**
 * Annota la ricarica e dice se è permessa: no se la precedente ha meno di 60 s, né se
 * sessionStorage non si può usare (navigazione privata, storage disattivato o pieno), perché
 * senza memoria della ricarica la pagina si ricaricherebbe all'infinito.
 */
function reloadAllowed(now: number): boolean {
  try {
    // Un'ora nel futuro (orologio spostato indietro) non conta come ricarica recente.
    const elapsed = now - Number(sessionStorage.getItem(RELOAD_KEY));
    if (elapsed >= 0 && elapsed < RELOAD_INTERVAL_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/**
 * Legge una risposta: 2xx → dati validati; 404 → `null` (la pagina mostra "Nessun dato");
 * 401/403 → sessione di Access scaduta: si ricarica la pagina, che passa di nuovo da Access, se
 * `reloadAllowed` lo permette (altrimenti `SessionError`); ogni altro stato → errore ("Riprova").
 */
async function read<T>(
  request: Promise<ApiResponse>,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const response = await request;
  if (response.status === 401 || response.status === 403) {
    if (!reloadAllowed(Date.now())) {
      throw new SessionError(
        `API: risposta ${response.status}, ricarica non permessa`,
      );
    }
    browser.reload();
    // La richiesta resta in corso fino alla ricarica: nessun errore tecnico da mostrare.
    return new Promise<never>(() => {});
  }
  if (response.status === 404) return null;
  if (response.status < 200 || response.status > 299) {
    throw new Error(`API: risposta ${response.status}`);
  }
  return schema.parse(await response.json());
}

/** Come `read` per una scrittura: anche il 404 (slot che non c'è più) è un errore. */
async function write<T>(
  request: Promise<ApiResponse>,
  schema: z.ZodType<T>,
): Promise<T> {
  const body = await read(request, schema);
  if (body === null) throw new Error("API: risposta 404");
  return body;
}

/** Tutte le misure, in ordine di data. */
export async function getMeasures() {
  const body = await read(api.measures.$get(), MeasuresResponseSchema);
  return body?.measures ?? null;
}

/** La scheda attiva oggi, con il Markdown. */
export function getScheda() {
  return read(api.scheda.$get(), SchedaResponseSchema);
}

/** Report e revisione del mese (`AAAA-MM`). */
export function getReport(month: string) {
  return read(
    api.reports[":month"].$get({ param: { month } }),
    ReportsResponseSchema,
  );
}

/** Slot e sedute della settimana ISO che contiene `date` (`AAAA-MM-GG`). */
export function getWeek(date: string) {
  return read(api.week.$get({ query: { date } }), WeekResponseSchema);
}

/** Tabella della forza e serie dell'e1RM del mese (`AAAA-MM`), dalle metriche del report. */
export function getExercises(month: string) {
  return read(
    api.exercises.$get({ query: { month } }),
    ExercisesResponseSchema,
  );
}

/** Slot, sedute extra e feedback del mese (`AAAA-MM`). */
export function getCalendar(month: string) {
  return read(api.calendar.$get({ query: { month } }), CalendarResponseSchema);
}

/** Salva il feedback di una seduta (giorno e `seq`): il feedback salvato. */
export function putFeedback(body: FeedbackBody) {
  return write(api.feedback.$put({ json: body }), FeedbackSchema);
}

/** Conferma lo slot `id` saltato, o il suo giorno scelto: lo slot aggiornato. */
export function patchSlot(id: string, body: SlotPatchBody) {
  return write(
    api.slots[":id"].$patch({ param: { id }, json: body }),
    PlannedSlotSchema,
  );
}
