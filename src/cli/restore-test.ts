// Prova di ripristino del backup mensile (docs/dashboard.md, «Backup e ripristino»):
// scarica palestra-AAAA-MM-GG.sql da R2, lo importa nel database nuovo palestra-restore-test,
// confronta il numero di righe di ogni tabella con le INSERT del dump (palestra, in sola
// lettura, è solo una colonna informativa) e cancella palestra-restore-test.
// Uso: npm run restore-test -- [AAAA-MM-GG] (default: oggi a Roma).
// Su stdout solo la tabella dei conteggi; mai righe del backup né output di wrangler.
// Exit code: 0 conteggi identici al dump · 1 conteggi diversi (la prova ha girato, esito negativo)
// · 64 argomenti · 65 risposta di wrangler non interpretabile o nome di tabella non ammesso
// (nel dump o in palestra-restore-test) · 69 backup vuoto, passo di wrangler non riuscito
// (anche CF_TOKEN_D1 rifiutato) o errore di R2 · 75 errore transitorio di R2 · 78 variabili
// mancanti o chiavi R2 rifiutate. Un errore nella lettura di palestra non cambia l'esito.
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
// I nomi entrano nella query di conteggio e su stdout: solo identificatori semplici.
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Tabelle dell'utente: escluse quelle interne di SQLite (sqlite_*) e di D1 (_cf_*).
const TABLES_SQL =
  "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name";
// Una riga per INSERT nell'export di D1: `INSERT INTO "<tabella>" ("c1",…) VALUES(…);`, con gli
// a capo delle stringhe scritti come char(10). Una riga che non inizia così non si conta.
const INSERT_LINE = /^INSERT INTO "([^"]+)"[ (]/;
// Indici, trigger e viste seguono tutti i dati: da lì in poi (corpi dei trigger) non si conta.
const SCHEMA_TAIL = /^CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TRIGGER|VIEW)\s/i;
const INTERNAL_TABLE = /^(sqlite_|_cf_)/;

// Risposta di `wrangler d1 execute --json` per una sola istruzione.
const D1Json = z
  .array(z.object({ results: z.array(z.unknown()), success: z.literal(true) }))
  .length(1);
const TableRow = z.object({ name: z.string() });
const CountsRow = z.record(z.string(), z.number().int().nonnegative());

type Wrangler = (
  args: readonly string[],
  opts?: { capture?: boolean },
) => Promise<{ code: number; stdout: string }>;

/** Un passo fallito: `exitCode` 69 per wrangler, 65 per dati non interpretabili (§ 8). */
class StepError extends Error {
  constructor(
    message: string,
    readonly exitCode: 65 | 69 = 69,
  ) {
    super(message);
  }
}

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
    throw new StepError(`Risposta inattesa di wrangler da ${db}`, 65);
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
    throw new StepError(`Nome di tabella non ammesso in ${db}`, 65);
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
  // Una SELECT non composta, una colonna per tabella: D1 rifiuta le SELECT composte
  // (UNION ALL) con più di 5 termini (#36).
  const sql = `SELECT ${names
    .map((t) => `(SELECT count(*) FROM "${t}") AS "${t}"`)
    .join(", ")}`;
  const rows = await select(
    wrangler,
    db,
    sql,
    CountsRow,
    `conteggio delle righe di ${db}`,
  );
  const row = rows[0];
  const columns = row ? Object.keys(row).sort() : [];
  if (
    rows.length !== 1 ||
    !row ||
    columns.join() !== [...names].sort().join()
  ) {
    throw new StepError(`Risposta inattesa di wrangler da ${db}`, 65);
  }
  return new Map(Object.entries(row));
}

/**
 * Righe attese per tabella: le INSERT del dump, contate in memoria (tabelle interne escluse).
 * `undefined` se un nome non è un identificatore semplice: su stdout vanno solo nomi di tabella.
 */
function dumpCounts(sql: string): Map<string, number> | undefined {
  const counts = new Map<string, number>();
  for (const line of sql.split("\n")) {
    if (SCHEMA_TAIL.test(line)) break;
    const name = INSERT_LINE.exec(line)?.[1];
    if (name === undefined || INTERNAL_TABLE.test(name)) continue;
    if (!TABLE_NAME.test(name)) return undefined;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Tabella del confronto per stdout. L'esito dipende solo da dump e ripristino: `palestra`
 * riceve righe nuove dopo il backup, quindi la sua colonna è informativa (#35).
 */
function report(
  dump: Map<string, number>,
  restored: Map<string, number>,
  source: Map<string, number>,
): { lines: string[]; differences: number; total: number } {
  const names = [
    ...new Set([...dump.keys(), ...restored.keys(), ...source.keys()]),
  ].sort();
  const cell = (n: number | undefined) => String(n ?? "—").padStart(12);
  let differences = 0;
  let total = 0;
  const lines = [
    `${"tabella".padEnd(18)}${"dump".padStart(12)}${"ripristino".padStart(12)}${"palestra".padStart(12)}`,
  ];
  for (const name of names) {
    const r = restored.get(name);
    // Una tabella ripristinata senza INSERT nel dump è vuota; una solo in palestra non si controlla.
    const checked = dump.has(name) || restored.has(name);
    const d = checked ? (dump.get(name) ?? 0) : undefined;
    const same = !checked || r === d;
    if (checked) total++;
    if (!same) differences++;
    lines.push(
      `${name.padEnd(18)}${cell(d)}${cell(r)}${cell(source.get(name))}${same ? "" : "  DIVERSO"}`,
    );
  }
  return { lines, differences, total };
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
  const dump = dumpCounts(new TextDecoder().decode(body));
  if (!dump) {
    console.error(`Nome di tabella non ammesso nel dump: ${key}`);
    return 65;
  }

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
    const restored = await counts(
      wrangler,
      TARGET,
      await tables(wrangler, TARGET),
    );
    // palestra è solo informativo: se non si legge, la colonna resta vuota e l'esito non cambia.
    let source = new Map<string, number>();
    try {
      source = await counts(wrangler, SOURCE, await tables(wrangler, SOURCE));
    } catch (error) {
      if (!(error instanceof StepError)) throw error;
      console.error(`${error.message}: colonna palestra non disponibile`);
    }
    const { lines, differences, total } = report(dump, restored, source);
    for (const line of lines) console.log(line);
    if (differences === 0) {
      console.log(`Esito: conteggi identici al dump in ${total} tabelle.`);
      exitCode = 0;
    } else {
      console.log(
        `Esito: conteggi diversi dal dump in ${differences} tabelle su ${total}.`,
      );
      exitCode = 1;
    }
  } catch (error) {
    if (!(error instanceof StepError)) throw error;
    console.error(error.message);
    exitCode = error.exitCode;
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
