// Prova di ripristino del backup mensile (docs/dashboard.md, «Backup e ripristino»):
// scarica palestra-AAAA-MM-GG.sql da R2, lo importa nel database nuovo palestra-restore-test,
// confronta il numero di righe di ogni tabella con palestra (sola lettura) e cancella
// palestra-restore-test. Uso: npm run restore-test -- [AAAA-MM-GG] (default: oggi a Roma).
// Su stdout solo la tabella dei conteggi; mai righe del backup né output di wrangler.
// Exit code: 0 conteggi identici · 64 argomenti · 65 conteggi diversi · 69 backup vuoto,
// passo di wrangler non riuscito, risposta inattesa o errore di R2 · 75 errore transitorio
// di R2 · 78 variabili mancanti o credenziali rifiutate.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { romeDate } from "../domain/dates";
import { SyncError } from "../errors";
import { getObject } from "../r2/get-object";
import { exitCodeFor } from "./backup";
import { runWrangler } from "./wrangler";

const BUCKET = "palestra-backup";
const SOURCE = "palestra";
const TARGET = "palestra-restore-test";
const REQUIRED_ENV = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// I nomi entrano nella query di conteggio: solo identificatori semplici.
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Tabelle dell'utente: escluse quelle interne di SQLite (sqlite_*) e di D1 (_cf_*).
const TABLES_SQL =
  "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name";

// Risposta di `wrangler d1 execute --json` per una sola istruzione.
const D1Json = z
  .array(z.object({ results: z.array(z.unknown()), success: z.literal(true) }))
  .length(1);
const TableRow = z.object({ name: z.string() });
const CountRow = z.object({ t: z.string(), n: z.number().int().nonnegative() });

type Wrangler = (
  args: readonly string[],
  opts?: { capture?: boolean },
) => Promise<{ code: number; stdout: string }>;

class StepError extends Error {}

/** Una query in sola lettura su `db`; l'output di wrangler resta in memoria, mai stampato. */
async function select<T>(
  wrangler: Wrangler,
  db: string,
  sql: string,
  row: z.ZodType<T>,
  what: string,
): Promise<T[]> {
  const { code, stdout } = await wrangler(
    ["d1", "execute", db, "--remote", "--json", "--command", sql],
    { capture: true },
  );
  if (code !== 0) {
    throw new StepError(`Non riuscito: ${what} (wrangler exit ${code})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = undefined;
  }
  const result = D1Json.safeParse(parsed);
  const rows = result.success
    ? z.array(row).safeParse(result.data[0]?.results)
    : undefined;
  if (!rows?.success) {
    throw new StepError(`Risposta inattesa di wrangler da ${db}`);
  }
  return rows.data;
}

/** Tabelle dell'utente in `db`, validate prima di entrare in una query. */
async function tables(wrangler: Wrangler, db: string): Promise<string[]> {
  const names = (
    await select(
      wrangler,
      db,
      TABLES_SQL,
      TableRow,
      `lettura delle tabelle di ${db}`,
    )
  ).map((r) => r.name);
  if (!names.every((t) => TABLE_NAME.test(t))) {
    throw new StepError(`Nome di tabella non ammesso in ${db}`);
  }
  return names;
}

/** Numero di righe di ogni tabella di `db`, con una sola query. */
async function counts(
  wrangler: Wrangler,
  db: string,
  names: string[],
): Promise<Map<string, number>> {
  if (names.length === 0) return new Map();
  const sql = names
    .map((t) => `SELECT '${t}' AS t, count(*) AS n FROM "${t}"`)
    .join(" UNION ALL ");
  const rows = await select(
    wrangler,
    db,
    sql,
    CountRow,
    `conteggio delle righe di ${db}`,
  );
  return new Map(rows.map((r) => [r.t, r.n]));
}

/** Tabella del confronto per stdout; `differences` = tabelle con conteggi diversi. */
function report(
  restored: Map<string, number>,
  source: Map<string, number>,
): { lines: string[]; differences: number; total: number } {
  const names = [...new Set([...restored.keys(), ...source.keys()])].sort();
  const cell = (n: number | undefined) => String(n ?? "—").padStart(10);
  let differences = 0;
  const lines = [
    `${"tabella".padEnd(18)}${"ripristino".padStart(10)}${"palestra".padStart(10)}`,
  ];
  for (const name of names) {
    const a = restored.get(name);
    const b = source.get(name);
    const same = a !== undefined && a === b;
    if (!same) differences++;
    lines.push(
      `${name.padEnd(18)}${cell(a)}${cell(b)}${same ? "" : "  DIVERSO"}`,
    );
  }
  return { lines, differences, total: names.length };
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: Partial<{
    download(key: string): Promise<Uint8Array>;
    wrangler: Wrangler;
    now(): Date;
  }> = {},
): Promise<number> {
  const [date, ...rest] = argv;
  if (rest.length > 0 || (date !== undefined && !DATE.test(date))) {
    console.error("Uso: npm run restore-test -- [AAAA-MM-GG]");
    return 64;
  }
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
    wrangler = runWrangler,
    download = (key: string) =>
      getObject({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket: BUCKET,
        key,
        now: now(),
      }),
  } = deps;
  const key = `palestra-${date ?? romeDate(now().toISOString())}.sql`;

  let body: Uint8Array;
  try {
    body = await download(key);
  } catch (error) {
    if (!(error instanceof SyncError)) throw error;
    console.error(`Download non riuscito: ${error.message}`);
    return exitCodeFor(error);
  }
  if (body.length === 0) {
    console.error(`Backup vuoto: ${key}`);
    return 69;
  }
  console.error(`Backup scaricato: ${key} (${body.length} byte)`);

  const created = await wrangler([
    "d1",
    "create",
    TARGET,
    "--jurisdiction",
    "eu",
  ]);
  if (created.code !== 0) {
    console.error(
      `Non riuscito: creazione di ${TARGET} (wrangler exit ${created.code}). Se esiste già, va cancellato prima.`,
    );
    return 69;
  }

  let exitCode: number;
  try {
    // Dentro il try: anche se la cartella non si crea, palestra-restore-test si cancella.
    // Il file contiene dati personali: cartella cancellata subito dopo l'import.
    const dir = await mkdtemp(join(tmpdir(), "palestra-restore-"));
    try {
      const file = join(dir, "backup.sql");
      await writeFile(file, body);
      const imported = await wrangler([
        "d1",
        "execute",
        TARGET,
        "--remote",
        "--file",
        file,
        "--yes",
      ]);
      if (imported.code !== 0) {
        throw new StepError(
          `Non riuscito: import in ${TARGET} (wrangler exit ${imported.code})`,
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    console.error(`Import in ${TARGET} completato`);
    const restoredTables = await tables(wrangler, TARGET);
    const sourceTables = await tables(wrangler, SOURCE);
    const restored = await counts(wrangler, TARGET, restoredTables);
    const source = await counts(wrangler, SOURCE, sourceTables);
    const { lines, differences, total } = report(restored, source);
    for (const line of lines) console.log(line);
    if (differences === 0) {
      console.log(`Esito: conteggi identici in ${total} tabelle.`);
      exitCode = 0;
    } else {
      console.log(
        `Esito: conteggi diversi in ${differences} tabelle su ${total}.`,
      );
      exitCode = 65;
    }
  } catch (error) {
    if (!(error instanceof StepError)) throw error;
    console.error(error.message);
    exitCode = 69;
  } finally {
    // Anche dopo un errore: il database di prova contiene una copia dei dati personali.
    const deleted = await wrangler([
      "d1",
      "delete",
      TARGET,
      "--skip-confirmation",
    ]);
    if (deleted.code === 0) {
      console.error(`${TARGET} cancellato`);
    } else {
      console.error(
        `Cancellazione di ${TARGET} non riuscita (wrangler exit ${deleted.code}): va cancellato a mano.`,
      );
      exitCode = 69;
    }
  }
  return exitCode;
}

// Eseguito con `npm run restore-test` (tsx); importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
