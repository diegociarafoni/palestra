/** Errore di dominio della sync; le sottoclassi decidono l'exit code (docs/buone-pratiche.md § 8). */
export class SyncError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Credenziali rifiutate (401/403): nessun retry. */
export class AuthError extends SyncError {}

/** Risposta o dato che non rispetta lo schema atteso. */
export class ParseError extends SyncError {}

/** Errore temporaneo (rete, 429, 5xx) ancora presente dopo i retry. */
export class TransientError extends SyncError {}

/** Servizio esterno non disponibile o risposta di errore non transitoria. */
export class UpstreamError extends SyncError {}

/** Exit code `sysexits` di un errore (docs/buone-pratiche.md § 8); 70 se non è previsto. */
export function exitCodeFor(e: unknown): number {
  if (e instanceof AuthError) return 78;
  if (e instanceof ParseError) return 65;
  if (e instanceof UpstreamError) return 69;
  if (e instanceof TransientError) return 75;
  return 70;
}
