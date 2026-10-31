import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createD1HttpDb } from "../db/d1-http";
import { exitCodeFor, SyncError } from "../errors";
import { runReport } from "../report/run";

// CLI del report mensile: `npm run report -- --month AAAA-MM`.
// I log finiscono nelle Actions pubbliche: mai contenuto delle sedute, date, id o token.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const REQUIRED_ENV = [
  "CLOUDFLARE_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "CF_TOKEN_D1",
] as const;

/**
 * Genera e salva in D1 il report del mese. Exit code `sysexits` (docs/buone-pratiche.md § 8):
 * 0 ok, 64 argomenti errati, 78 variabili mancanti o credenziali, poi `exitCodeFor`.
 */
export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const [flag, month, ...rest] = argv;
  if (
    flag !== "--month" ||
    month === undefined ||
    !MONTH.test(month) ||
    rest.length > 0
  ) {
    console.error("Uso: npm run report -- --month AAAA-MM");
    return 64;
  }
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
    await runReport(db, month);
  } catch (e) {
    // Solo i messaggi dei nostri errori (senza dati personali); degli altri solo il nome.
    console.error(
      e instanceof SyncError
        ? `Report non generato: ${e.message}`
        : `Report non generato: errore inatteso (${e instanceof Error ? e.name : typeof e})`,
    );
    return exitCodeFor(e);
  }
  console.log("report salvato");
  return 0;
}

// Solo se eseguito come script (npm run report), non quando un test importa il modulo.
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
