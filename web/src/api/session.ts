// Errore di sessione e nuovi tentativi, fuori da client.ts: main.tsx li importa senza portare nel
// primo caricamento il client, zod e gli schemi (che restano nei chunk delle pagine).

/** 401/403 anche dopo una ricarica recente: ricaricare di nuovo non basta (niente nuovi tentativi). */
export class SessionError extends Error {}

/** Nuovi tentativi del QueryClient dell'app: fino a 3, come il default, mai per la sessione. */
export function retryQuery(failureCount: number, error: Error): boolean {
  return !(error instanceof SessionError) && failureCount < 3;
}
