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

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** `YYYY-MM-DD` canonico se y-m-d è un giorno reale tra `minYear` e il 2099, altrimenti `undefined`. */
function isoDay(
  y: number,
  m: number,
  d: number,
  minYear = 1900,
): string | undefined {
  if (y < minYear || y > 2099) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return undefined;
  }
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Le tre parti di un giorno ISO già validato. */
function ymd(iso: string): [string, string, string] {
  const [y = "", m = "", d = ""] = iso.split("-");
  return [y, m, d];
}

/** Trasforma un giorno riconosciuto (sostituzione) o lo registra (raccolta). */
export type MapIso = (iso: string) => string;

/**
 * Passa per `map` ogni data riconosciuta, tenendo ora del giorno e fuso. Gli stessi
 * riconoscitori servono alla raccolta (`collectDays`) e alla sostituzione (`anonymize`).
 */
function transformDates(input: string, map: MapIso): string {
  let text = input;
  // 1. `YYYY-MM-DD`, anche dentro `… HH:MM:SS +01:00` e ISO 8601.
  text = text.replace(
    /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g,
    (m0, y: string, m: string, d: string) => {
      const iso = isoDay(+y, +m, +d);
      if (!iso) return m0;
      const [fy, fm, fd] = ymd(map(iso));
      return `${fy}-${fm}-${fd}`;
    },
  );
  // 2. `DD/MM/YYYY`, anche con le barre codificate negli URL (`%2F`).
  text = text.replace(
    /(?<!\d)(\d{2})(\/|%2F)(\d{2})\2(\d{4})(?!\d)/gi,
    (m0, d: string, sep: string, m: string, y: string) => {
      const iso = isoDay(+y, +m, +d);
      if (!iso) return m0;
      const [fy, fm, fd] = ymd(map(iso));
      return `${fd}${sep}${fm}${sep}${fy}`;
    },
  );
  // 3. `YYYYMMDD` / `YYYYMMDDHHMMSS` come sequenza di cifre a sé.
  text = text.replace(
    /(?<![\w-]|\d[.,])(20\d{2})(\d{2})(\d{2})((?:[01]\d|2[0-3])[0-5]\d[0-5]\d)?(?![\w-]|[.,]\d)/g,
    (m0, y: string, m: string, d: string, time: string | undefined) => {
      const iso = isoDay(+y, +m, +d, 2000);
      if (!iso) return m0;
      const [fy, fm, fd] = ymd(map(iso));
      return `${fy}${fm}${fd}${time ?? ""}`;
    },
  );
  return text;
}

/** I giorni di calendario distinti riconosciuti nel testo, non ordinati. */
export function collectDays(input: string): string[] {
  const days = new Set<string>();
  transformDates(input, (iso) => {
    days.add(iso);
    return iso;
  });
  return [...days];
}

/**
 * Mappa i giorni reali distinti su giorni finti: ordine conservato, un intervallo reale di
 * 1 giorno resta 1 (le sedute a cavallo della mezzanotte mantengono una durata sensata),
 * ogni altro intervallo diventa casuale fra 2 e 9 giorni; il primo giorno finto è il primo
 * reale meno un valore casuale fra 60 e 400 giorni. Nessun giorno finto coincide col reale.
 * Uno scarto fisso sarebbe ricavabile da una data nota e dalla data del commit pubblico.
 */
export function buildDayMap(
  days: string[],
  randomInt: (min: number, max: number) => number,
): Map<string, string> {
  const map = new Map<string, string>();
  const [first, ...rest] = [...new Set(days)].sort();
  if (first === undefined) return map;
  const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  const firstMs = Date.parse(`${first}T00:00:00Z`);
  let fakeMs = firstMs - randomInt(60, 401) * DAY_MS;
  let prevRealMs = firstMs;
  map.set(first, isoOf(fakeMs));
  for (const day of rest) {
    const realMs = Date.parse(`${day}T00:00:00Z`);
    const gap = Math.round((realMs - prevRealMs) / DAY_MS);
    fakeMs += (gap === 1 ? 1 : randomInt(2, 10)) * DAY_MS;
    map.set(day, isoOf(fakeMs));
    prevRealMs = realMs;
  }
  for (const [real, fake] of map) {
    if (real === fake) throw new Error("mappa dei giorni degenere");
  }
  return map;
}

/**
 * Toglie dal testo le identità dell'utente (senza distinzione tra maiuscole e minuscole),
 * sostituisce ogni altra e-mail con una finta e rimappa le date con `mapDay`. Funzione
 * pura: stesso input, stesso output.
 */
export function anonymize(
  input: string,
  opts: { identities: string[]; mapDay: MapIso },
): string {
  const text = replaceEmails(replaceIdentities(input, opts.identities));
  return transformDates(text, opts.mapDay);
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

type Deps = {
  mapDay?: MapIso;
  randomInt?: (min: number, max: number) => number;
};

async function anonymizeDir(
  src: string,
  dest: string,
  deps: Deps,
): Promise<number> {
  const identities = await readIdentities(src);
  const names = (await readdir(src, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== IDENTITIES_FILE)
    .map((entry) => entry.name)
    .filter((name) => [".html", ".json"].includes(extname(name)))
    .sort();
  // Tutto in memoria prima di scrivere: se un profilo non si riduce, nessun file esce.
  const clean: { name: string; text: string }[] = [];
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
    clean.push({ name, text });
  }
  // Una sola mappa dei giorni per tutti i file: l'ordine delle sedute resta coerente.
  let mapDay = deps.mapDay;
  if (!mapDay) {
    const days = clean.flatMap((file) => collectDays(file.text));
    const dayMap = buildDayMap(days, deps.randomInt ?? randomInt);
    mapDay = (iso) => dayMap.get(iso) ?? iso;
  }
  await mkdir(dest, { recursive: true });
  let count = 0;
  for (const { name, text } of clean) {
    await writeFile(join(dest, name), anonymize(text, { identities, mapDay }));
    console.log(name);
    count++;
  }
  return count;
}

export async function main(argv: string[], deps: Deps = {}): Promise<number> {
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
    const count = await anonymizeDir(src, dest, deps);
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
