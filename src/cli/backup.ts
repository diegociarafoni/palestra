// Backup mensile di D1 su R2: `wrangler d1 export` in una cartella temporanea, upload
// nel bucket `palestra-backup` (giurisdizione UE), cancellazione del file locale.
// Uso: npm run backup (nessun argomento). Su stderr solo nome del file e dimensione.
// Exit code (exitCodeFor, docs/buone-pratiche.md § 8): 0 ok · 64 argomenti · 69 export non
// riuscito o vuoto, errore di R2 · 75 errore transitorio di R2 · 78 variabili mancanti o
// credenziali rifiutate.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { romeDate } from "../domain/dates";
import { exitCodeFor, SyncError } from "../errors";
import { putObject } from "../r2/put-object";
import { runWrangler } from "./wrangler";

const BUCKET = "palestra-backup";
const REQUIRED_ENV = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

/** Esporta il database remoto `palestra` nel file indicato; restituisce l'exit code di wrangler. */
async function exportWithWrangler(output: string): Promise<number> {
  // `--skip-confirmation`: nessuna domanda interattiva. Output mai mostrato: runWrangler.
  const { code } = await runWrangler([
    "d1",
    "export",
    "palestra",
    "--remote",
    "--skip-confirmation",
    "--output",
    output,
  ]);
  return code;
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: Partial<{
    exportDb(output: string): Promise<number>;
    upload(key: string, body: Uint8Array): Promise<void>;
    now(): Date;
  }> = {},
): Promise<number> {
  if (argv.length > 0) {
    console.error("Uso: npm run backup (nessun argomento)");
    return 64;
  }
  // Il token e l'account servono anche a wrangler, che li legge dall'ambiente.
  const {
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
  } = env;
  if (!token || !accountId || !accessKeyId || !secretAccessKey) {
    // Solo i nomi delle variabili mancanti, mai i valori.
    const missing = REQUIRED_ENV.filter((name) => !env[name]);
    console.error(`Variabili d'ambiente mancanti: ${missing.join(", ")}`);
    return 78;
  }
  const now = () => deps.now?.() ?? new Date();
  const {
    exportDb = exportWithWrangler,
    // Firma con l'orologio letto al momento della PUT, non all'avvio: dopo un export
    // lento gli endpoint S3 rifiutano uno scarto d'orario oltre 15 minuti (403, exit 78).
    upload = (key: string, body: Uint8Array) =>
      putObject({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket: BUCKET,
        key,
        body,
        now: now(),
      }),
  } = deps;
  const key = `palestra-${romeDate(now().toISOString())}.sql`;
  const dir = await mkdtemp(join(tmpdir(), "palestra-backup-"));
  try {
    const file = join(dir, key);
    const exitCode = await exportDb(file);
    if (exitCode !== 0) {
      console.error(`Export D1 non riuscito (wrangler exit ${exitCode})`);
      return 69;
    }
    const body = existsSync(file) ? await readFile(file) : new Uint8Array();
    if (body.length === 0) {
      console.error("Export D1 vuoto");
      return 69;
    }
    try {
      await upload(key, body);
    } catch (error) {
      if (!(error instanceof SyncError)) throw error;
      console.error(`Backup non riuscito: ${error.message}`);
      return exitCodeFor(error);
    }
    console.error(`Backup caricato: ${key} (${body.length} byte)`);
    return 0;
  } finally {
    // Il file contiene dati personali: si cancella anche quando l'export o l'upload
    // falliscono (non dopo SIGINT/SIGTERM: vedi docs/dashboard.md).
    await rm(dir, { recursive: true, force: true });
  }
}

// Eseguito con `npm run backup` (tsx); importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
