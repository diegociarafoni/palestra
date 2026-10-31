// Anonimizza le risposte grezze di Mywellness (probe_out/) prima che diventino fixture
// pubbliche: identità sostituite da segnaposto, altre e-mail rese finte, date spostate
// di un numero casuale di giorni, profilo `EU.currentUser` ridotto a id, token e culture.
// Uso: npx tsx scripts/anonymize-fixtures.ts <cartella_probe> <cartella_fixture>
// Legge <cartella_probe>/identities.json (scritto dal probe) e copia ogni file .html e
// .json con lo stesso nome. Stampa solo i nomi dei file e il loro numero, mai il contenuto
// né lo spostamento. Exit code: 0 ok · 64 argomenti · 65 identities.json o profilo non
// interpretabili (nessun file scritto) · 78 identities.json mancante.
import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ParseError } from "../src/errors";

const DAY_MS = 86_400_000;

/**
 * Spostamenti ammessi, in giorni: da −400 a −30, mai un multiplo di 7 (con settimane
 * intere i giorni della settimana resterebbero quelli reali delle sedute).
 */
export const DAY_OFFSETS: readonly number[] = Array.from(
  { length: 371 },
  (_, i) => -400 + i,
).filter((days) => days % 7 !== 0);
const EMAIL_PLACEHOLDER = "utente@example.com";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+$/;

/** Caratteri sintattici delle espressioni regolari (modalità `u`). */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

/** Segnaposto della n-esima identità (da 1): stessa forma per GUID ed e-mail. */
function placeholderFor(identity: string, n: number): string {
  if (GUID.test(identity)) {
    return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  }
  if (EMAIL.test(identity)) return EMAIL_PLACEHOLDER;
  return `anon-${n}`;
}

/** Forme in cui un valore compare nelle risposte: testo, URL, form, stringa JSON. */
const ENCODINGS: ((text: string) => string)[] = [
  (text) => text,
  (text) => encodeURIComponent(text),
  (text) => new URLSearchParams({ v: text }).toString().slice(2),
  (text) => JSON.stringify(text).slice(1, -1),
  // I serializzatori .NET scrivono i caratteri non ASCII come \uXXXX.
  (text) =>
    JSON.stringify(text)
      .slice(1, -1)
      .replace(
        /[^\x20-\x7e]/g,
        (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
      ),
];

/** Identità più corte di così non identificano nessuno e riscriverebbero tutto il testo. */
const MIN_IDENTITY_LENGTH = 3;

function replaceIdentities(input: string, identities: string[]): string {
  const entries = identities.flatMap((identity, i) => {
    if (identity.length < MIN_IDENTITY_LENGTH) return [];
    const placeholder = placeholderFor(identity, i + 1);
    return ENCODINGS.map((encode) => {
      const text = encode(identity);
      return {
        text,
        exact: new RegExp(`^${escapeRegExp(text)}$`, "iu"),
        placeholder: encode(placeholder),
      };
    });
  });
  if (entries.length === 0) return input;
  // Un solo passaggio, la più lunga per prima: un segnaposto non viene mai riletto.
  const alternatives = [...entries]
    .sort((a, b) => b.text.length - a.text.length)
    .map((e) => escapeRegExp(e.text));
  const any = new RegExp(alternatives.join("|"), "giu");
  return input.replace(
    any,
    (match) => entries.find((e) => e.exact.test(match))?.placeholder ?? match,
  );
}

/** Ogni altra e-mail, anche codificata in un URL (`%40`), diventa quella finta. */
function replaceEmails(input: string): string {
  return input.replace(
    /[A-Za-z0-9._%+-]+(@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    (_match, at: string) => EMAIL_PLACEHOLDER.replace("@", at),
  );
}

/** Giorno spostato di `days`, o `undefined` se `y-m-d` non è una data valida. */
function shiftDay(
  y: number,
  m: number,
  d: number,
  days: number,
): { y: number; m: number; d: number } | undefined {
  if (y < 1900 || y > 2099) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  const shifted = new Date(date.getTime() + days * DAY_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  };
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** `YYYY-MM-DD`, anche dentro `YYYY-MM-DD HH:MM:SS +01:00` e ISO 8601: ora e fuso restano. */
function shiftDashedDates(input: string, days: number): string {
  return input.replace(
    /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g,
    (match, y: string, m: string, d: string) => {
      const s = shiftDay(Number(y), Number(m), Number(d), days);
      return s ? `${pad(s.y, 4)}-${pad(s.m)}-${pad(s.d)}` : match;
    },
  );
}

/** `DD/MM/YYYY`, anche con le barre codificate negli URL (`%2F`). */
function shiftSlashedDates(input: string, days: number): string {
  return input.replace(
    /(?<!\d)(\d{2})(\/|%2F)(\d{2})\2(\d{4})(?!\d)/gi,
    (match, d: string, sep: string, m: string, y: string) => {
      const s = shiftDay(Number(y), Number(m), Number(d), days);
      return s ? `${pad(s.d)}${sep}${pad(s.m)}${sep}${pad(s.y, 4)}` : match;
    },
  );
}

/**
 * `YYYYMMDD` e `YYYYMMDDHHMMSS` solo come sequenza di cifre a sé (non dentro parole,
 * GUID o numeri decimali) e solo se sono una data valida tra il 2000 e il 2099:
 * carichi, ripetizioni e id restano identici.
 */
function shiftCompactDates(input: string, days: number): string {
  return input.replace(
    /(?<![\w-]|\d[.,])(20\d{2})(\d{2})(\d{2})((?:[01]\d|2[0-3])[0-5]\d[0-5]\d)?(?![\w-]|[.,]\d)/g,
    (match, y: string, m: string, d: string, time: string | undefined) => {
      const s = shiftDay(Number(y), Number(m), Number(d), days);
      return s ? `${pad(s.y, 4)}${pad(s.m)}${pad(s.d)}${time ?? ""}` : match;
    },
  );
}

/**
 * Toglie dal testo le identità dell'utente (senza distinzione tra maiuscole e minuscole),
 * sostituisce ogni altra e-mail con una finta e sposta di `dayOffset` giorni le date
 * riconosciute. Funzione pura: stesso input, stesso output.
 */
export function anonymize(
  input: string,
  opts: { identities: string[]; dayOffset: number },
): string {
  let text = replaceEmails(replaceIdentities(input, opts.identities));
  text = shiftDashedDates(text, opts.dayOffset);
  text = shiftSlashedDates(text, opts.dayOffset);
  return shiftCompactDates(text, opts.dayOffset);
}

// Profilo dell'utente nelle pagine del sito: `EU.currentUser = JSON.parse('<JSON>')`, con
// il JSON dentro una stringa JavaScript tra apici (virgolette scritte come \").
const CURRENT_USER =
  /(EU\.currentUser\s*=\s*JSON\.parse\(')((?:[^'\\]|\\[\s\S])*)('\))/g;
const JS_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
};

function decodeJsString(text: string): string {
  return text.replace(
    /\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g,
    (_match, code: string) =>
      code.length > 1
        ? String.fromCharCode(Number.parseInt(code.slice(1), 16))
        : (JS_ESCAPES[code] ?? code),
  );
}

function parseCurrentUser(literal: string): Record<string, unknown> {
  try {
    return z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(decodeJsString(literal)));
  } catch (error) {
    // La causa può citare il testo del profilo: non va mai stampata.
    throw new ParseError("EU.currentUser non interpretabile", { cause: error });
  }
}

/** Profilo `EU.currentUser` della pagina, o `undefined` se la pagina non lo contiene. */
export function readCurrentUser(
  html: string,
): Record<string, unknown> | undefined {
  const match = new RegExp(CURRENT_USER.source).exec(html);
  return match ? parseCurrentUser(match[2] ?? "") : undefined;
}

const ReducedUser = z.object({
  id: z.string(),
  token: z.string(),
  culture: z.string().optional(),
});

/** Riduce ogni profilo `EU.currentUser` della pagina alle sole chiavi id, token, culture. */
function reduceCurrentUser(html: string): string {
  return html.replace(
    CURRENT_USER,
    (_match, head: string, literal: string, tail: string) => {
      const user = ReducedUser.safeParse(parseCurrentUser(literal));
      if (!user.success) {
        throw new ParseError("EU.currentUser senza id o token", {
          cause: user.error,
        });
      }
      const { id, token, culture } = user.data;
      const json = JSON.stringify({ id, token, culture });
      return `${head}${json.replace(/[\\'"]/g, "\\$&")}${tail}`;
    },
  );
}

function pickDayOffset(): number {
  const offset = DAY_OFFSETS[randomInt(DAY_OFFSETS.length)];
  if (offset === undefined) throw new Error("DAY_OFFSETS vuoto");
  return offset;
}

const USAGE =
  "Uso: npx tsx scripts/anonymize-fixtures.ts <cartella_probe> <cartella_fixture>";
const IDENTITIES_FILE = "identities.json";

async function readIdentities(src: string): Promise<string[]> {
  try {
    const text = await readFile(join(src, IDENTITIES_FILE), "utf8");
    return z.array(z.string()).parse(JSON.parse(text));
  } catch (error) {
    // Mai il messaggio originale: potrebbe citare le identità contenute nel file.
    throw new ParseError(
      `${IDENTITIES_FILE} non valido: serve un array di stringhe`,
      { cause: error },
    );
  }
}

async function anonymizeDir(
  src: string,
  dest: string,
  dayOffset: number,
): Promise<number> {
  const identities = await readIdentities(src);
  const names = (await readdir(src, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== IDENTITIES_FILE)
    .map((entry) => entry.name)
    .filter((name) => [".html", ".json"].includes(extname(name)))
    .sort();
  // Tutto in memoria prima di scrivere: se un profilo non si riduce, nessun file esce.
  const outputs: { name: string; text: string }[] = [];
  for (const name of names) {
    let text = await readFile(join(src, name), "utf8");
    if (extname(name) === ".html") {
      try {
        if (name === "login_ok.html" && readCurrentUser(text) === undefined) {
          throw new ParseError("EU.currentUser non trovato");
        }
        text = reduceCurrentUser(text);
      } catch (error) {
        if (!(error instanceof ParseError)) throw error;
        throw new ParseError(`${name}: ${error.message}`, { cause: error });
      }
    }
    outputs.push({ name, text: anonymize(text, { identities, dayOffset }) });
  }
  await mkdir(dest, { recursive: true });
  for (const { name, text } of outputs) {
    await writeFile(join(dest, name), text);
    console.log(name);
  }
  return outputs.length;
}

export async function main(
  argv: string[],
  deps: { dayOffset?: number } = {},
): Promise<number> {
  const [src, dest] = argv;
  if (argv.length !== 2 || !src || !dest) {
    console.error(USAGE);
    return 64;
  }
  if (!existsSync(join(src, IDENTITIES_FILE))) {
    console.error(
      `${IDENTITIES_FILE} mancante in ${src}: eseguire prima il probe`,
    );
    return 78;
  }
  try {
    const count = await anonymizeDir(
      src,
      dest,
      deps.dayOffset ?? pickDayOffset(),
    );
    console.log(`${count} file anonimizzati`);
    return 0;
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    console.error(error.message);
    return 65;
  }
}

// Eseguito con `npx tsx scripts/anonymize-fixtures.ts`; importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2));
}
