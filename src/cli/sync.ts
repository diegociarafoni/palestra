import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createD1HttpDb } from "../db/d1-http";
import { exitCodeFor, SyncError } from "../errors";
import { MywellnessClient } from "../mywellness/client";
import { type SyncClient, sync } from "../sync/sync";

// CLI della sync notturna: `npm run sync [-- --lookback-days N]`.
// I log finiscono nelle Actions pubbliche: su stdout solo i conteggi, mai id, date, e-mail,
// password o token.

/** Client della CLI: i metodi della sync più il login e il token di sessione. */
export type CliClient = SyncClient & Pick<MywellnessClient, "login" | "token">;

/** Dipendenze iniettabili nei test. */
export type SyncDeps = {
  makeClient: (credentials: { email: string; password: string }) => CliClient;
};

const USAGE = "Uso: npm run sync [-- --lookback-days N]";
const POSITIVE_INT = /^[1-9]\d*$/;

// Tutte controllate prima di ogni richiesta: una variabile D1 mancante non costa un login.
const REQUIRED_ENV = [
  "MYWELLNESS_EMAIL",
  "MYWELLNESS_PASSWORD",
  "CLOUDFLARE_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "CF_TOKEN_D1",
] as const;

const DEFAULT_DEPS: SyncDeps = {
  makeClient: (credentials) => new MywellnessClient(credentials),
};

/**
 * Riga di errore per i log pubblici: il messaggio solo per i nostri errori (senza dati
 * personali); degli altri solo il nome. Mai `cause` né stack.
 */
function failureMessage(e: unknown): string {
  return e instanceof SyncError
    ? `Sync non riuscita: ${e.message}`
    : `Sync non riuscita: errore inatteso (${e instanceof Error ? e.name : typeof e})`;
}

/** Giorni di `--lookback-days N` (undefined senza argomenti); null se gli argomenti sono errati. */
function parseLookbackDays(argv: string[]): number | undefined | null {
  if (argv.length === 0) return undefined;
  const [flag, value, ...rest] = argv;
  if (
    flag !== "--lookback-days" ||
    value === undefined ||
    !POSITIVE_INT.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    rest.length > 0
  ) {
    return null;
  }
  return Number(value);
}

/**
 * Sincronizza in D1 le sedute Mywellness e gli slot programmati. Exit code `sysexits`
 * (docs/buone-pratiche.md § 8): 0 ok, 64 argomenti errati, 78 variabili mancanti o
 * credenziali, poi `exitCodeFor`.
 */
export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: SyncDeps = DEFAULT_DEPS,
): Promise<number> {
  const lookbackDays = parseLookbackDays(argv);
  if (lookbackDays === null) {
    console.error(USAGE);
    return 64;
  }
  // Vuota = mancante: GitHub passa così un secret o una variabile non impostati.
  const missing = REQUIRED_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    console.error(`Variabili d'ambiente mancanti: ${missing.join(", ")}`);
    return 78;
  }
  try {
    const db = createD1HttpDb({
      accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
      databaseId: env.D1_DATABASE_ID ?? "",
      token: env.CF_TOKEN_D1 ?? "",
    });
    const client = deps.makeClient({
      email: env.MYWELLNESS_EMAIL ?? "",
      password: env.MYWELLNESS_PASSWORD ?? "",
    });
    await client.login();
    // Il token nasce nel processo, il workflow non può mascherarlo: lo fa la CLI, prima di
    // ogni altra riga su stdout.
    if (env.GITHUB_ACTIONS === "true") {
      console.log(`::add-mask::${client.token}`);
    }
    const result = await sync(client, db, { lookbackDays });
    console.log(`sedute nuove: ${result.newSessions}`);
    console.log(`slot aggiornati: ${result.slotsUpdated}`);
  } catch (e) {
    console.error(failureMessage(e));
    return exitCodeFor(e);
  }
  return 0;
}

// Solo se eseguito come script (npm run sync), non quando un test importa il modulo.
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
