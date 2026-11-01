import type { DefaultOptions } from "@tanstack/react-query";

// Errore di sessione, nuovi tentativi e ricarica, fuori da client.ts: main.tsx li importa senza
// portare nel primo caricamento il client, zod e gli schemi (che restano nei chunk delle pagine).

/** 401/403 anche dopo una ricarica recente: ricaricare di nuovo non basta (niente nuovi tentativi). */
export class SessionError extends Error {}

// Nuovi tentativi: fino a 3, come il default di TanStack Query, mai per la sessione.
function retryQuery(failureCount: number, error: Error): boolean {
  return !(error instanceof SessionError) && failureCount < 3;
}

/** Opzioni predefinite del QueryClient dell'app (main.tsx). */
export const queryDefaults: DefaultOptions = {
  queries: { retry: retryQuery },
};

/** Ricarica della pagina, dietro un oggetto che i test possono sostituire (jsdom non ricarica). */
export const browser = { reload: () => window.location.reload() };
