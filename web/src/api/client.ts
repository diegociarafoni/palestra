import { hc } from "hono/client";
import type { z } from "zod";
import type { AppType } from "../../../src/api/app";
import {
  MeasuresResponseSchema,
  ReportsResponseSchema,
  SchedaResponseSchema,
} from "../../../src/domain/dashboard";

// Unico client dell'API (docs/buone-pratiche-react.md § 5): percorsi e tipi arrivano da `AppType`,
// le risposte si validano con gli schemi zod di src/domain/dashboard.ts. Con `X-Requested-With`
// Cloudflare Access risponde 401 a una sessione scaduta invece del redirect alla pagina di login
// (developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/#ajax).
const api = hc<AppType>("/", {
  headers: { "X-Requested-With": "XMLHttpRequest" },
}).api;

type ApiResponse = { status: number; json: () => Promise<unknown> };

/**
 * Legge una risposta: 2xx → dati validati; 404 → `null` (la pagina mostra "Nessun dato");
 * 401/403 → sessione di Access scaduta: si ricarica la pagina, che passa di nuovo da Access;
 * ogni altro stato → errore (la pagina offre "Riprova").
 */
async function read<T>(
  request: Promise<ApiResponse>,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const response = await request;
  if (response.status === 401 || response.status === 403) {
    window.location.reload();
    // La richiesta resta in corso fino alla ricarica: nessun errore tecnico da mostrare.
    return new Promise<never>(() => {});
  }
  if (response.status === 404) return null;
  if (response.status < 200 || response.status > 299) {
    throw new Error(`API: risposta ${response.status}`);
  }
  return schema.parse(await response.json());
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
