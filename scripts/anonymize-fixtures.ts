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

/** Un'identità fatta di sole lettere, spazi e `' . -` si tratta come un nome. */
const NAME_LIKE = /^\p{L}[\p{L} '.-]*$/u;
/** Identità più corte di così non identificano nessuno e riscriverebbero tutto il testo. */
const MIN_IDENTITY_LENGTH = 3;
/** Entità HTML con nome che accettiamo per i caratteri delle identità. */
const NAMED_ENTITIES: Record<string, string> = {
  "'": "apos",
  '"': "quot",
  "&": "amp",
  à: "agrave",
  è: "egrave",
  é: "eacute",
  ì: "igrave",
  ò: "ograve",
  ù: "ugrave",
  À: "Agrave",
  È: "Egrave",
  É: "Eacute",
  Ì: "Igrave",
  Ò: "Ograve",
  Ù: "Ugrave",
};
/** Nel sorgente di un'espressione regolare, una barra rovesciata letterale. */
const BS = "\\\\";

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

/** Un carattere nelle sue forme: testo, entità HTML (decimale/esadecimale/nome), escape JS, URL. */
function charPattern(ch: string): string {
  const alts = new Set<string>([escapeRegExp(ch)]);
  const codePoints = new Set<number>();
  for (const c of new Set([ch, ch.toLowerCase(), ch.toUpperCase()])) {
    const cp = c.codePointAt(0);
    if (cp !== undefined) codePoints.add(cp);
  }
  for (const cp of codePoints) {
    alts.add(`&#0*${cp};`); // entità decimale, con zeri iniziali facoltativi
    alts.add(`&#[xX]0*${cp.toString(16)};`); // entità esadecimale
    alts.add(`(?:${BS}){1,2}u${cp.toString(16).padStart(4, "0")}`); // \uXXXX e \\uXXXX
    if (cp < 128) {
      // Percento anche per i caratteri ASCII che encodeURIComponent lascia (es. `'` → %27).
      const hex = cp.toString(16).padStart(2, "0");
      alts.add(`%${hex}`);
      alts.add(`%25${hex}`);
    }
  }
  const named = NAMED_ENTITIES[ch];
  if (named) alts.add(`&${named};`);
  if (ch === "'") alts.add(`${BS}x27`);
  if (["'", '"', "/", "\\"].includes(ch)) alts.add(`${BS}${escapeRegExp(ch)}`);
  const enc = encodeURIComponent(ch);
  if (enc !== ch) {
    alts.add(escapeRegExp(enc)); // %HH
    alts.add(escapeRegExp(enc.replace(/%/g, "%25"))); // %25HH (doppia codifica)
  }
  if (ch === " ") alts.add("\\+");
  return `(?:${[...alts].join("|")})`;
}

function corePattern(text: string): string {
  return [...text].map(charPattern).join("");
}

type Entry = {
  core: string;
  boundary: boolean;
  placeholder: string;
  priority: [number, number, number];
  anchored: RegExp;
};

function entriesFor(identity: string, index: number): Entry[] {
  if (identity.length < MIN_IDENTITY_LENGTH) return [];
  if (EMAIL.test(identity)) return []; // le e-mail le tratta replaceEmails
  const placeholder = placeholderFor(identity, index);
  const make = (text: string, boundary: boolean, derived: boolean): Entry => ({
    core: corePattern(text),
    boundary,
    placeholder,
    priority: [-text.length, derived ? 1 : 0, index],
    anchored: new RegExp(`^${corePattern(text)}$`, "iu"),
  });
  if (GUID.test(identity)) {
    // Il GUID anche senza trattini; sempre fuori dai confini di parola.
    return [
      make(identity, false, false),
      make(identity.replace(/-/g, ""), false, true),
    ];
  }
  if (NAME_LIKE.test(identity)) {
    // Nome e sue parole (≥ 3 lettere), solo ai confini di lettera Unicode.
    const words = identity.match(/\p{L}{3,}/gu) ?? [];
    return [
      make(identity, true, false),
      ...words.filter((w) => w !== identity).map((w) => make(w, true, true)),
    ];
  }
  return [make(identity, false, false)];
}

function replaceIdentities(input: string, identities: string[]): string {
  const entries = identities
    .flatMap((identity, i) => entriesFor(identity, i + 1))
    // Prima la più lunga; a parità, l'identità diretta prima di una parola derivata.
    .sort((a, b) => {
      for (let k = 0; k < 3; k++) {
        const diff = (a.priority[k] ?? 0) - (b.priority[k] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  if (entries.length === 0) return input;
  const source = entries
    .map((e) => (e.boundary ? `(?<!\\p{L})${e.core}(?!\\p{L})` : e.core))
    .join("|");
  const any = new RegExp(source, "giu");
  return input.replace(
    any,
    (match) =>
      entries.find((e) => e.anchored.test(match))?.placeholder ?? match,
  );
}

/** Ogni altra e-mail (connettore `@`, `%40`, `%2540`, `&#64;`, `&#x40;`) diventa quella finta. */
function replaceEmails(input: string): string {
  return input.replace(
    /[A-Za-z0-9._%+-]+(@|%40|%2540|&#0*64;|&#[xX]0*40;)[A-Za-z0-9._%+-]*[A-Za-z0-9-]\.[A-Za-z]{2,}/g,
    (_match, connector: string) => `utente${connector}example.com`,
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

type Lang = "it" | "en";
type Form = "full" | "abbr";
const MONTHS: Record<Lang, Record<Form, string[]>> = {
  it: {
    full: "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre".split(
      " ",
    ),
    abbr: "gen feb mar apr mag giu lug ago set ott nov dic".split(" "),
  },
  en: {
    full: "january february march april may june july august september october november december".split(
      " ",
    ),
    abbr: "jan feb mar apr may jun jul aug sep oct nov dec".split(" "),
  },
};
const WEEKDAYS: Record<Lang, Record<Form, string[]>> = {
  it: {
    full: "domenica lunedì martedì mercoledì giovedì venerdì sabato".split(" "),
    abbr: "dom lun mar mer gio ven sab".split(" "),
  },
  en: {
    full: "sunday monday tuesday wednesday thursday friday saturday".split(" "),
    abbr: "sun mon tue wed thu fri sat".split(" "),
  },
};
const LANGS: Lang[] = ["it", "en"];
const FORMS: Form[] = ["full", "abbr"];

type Hit = { lang: Lang; form: Form; idx: number };
function lookup(
  tables: Record<Lang, Record<Form, string[]>>,
  token: string,
): Hit | undefined {
  const t = token.toLowerCase().replace(/[.,]+$/, "");
  for (const lang of LANGS) {
    for (const form of FORMS) {
      const idx = tables[lang][form].indexOf(t);
      if (idx >= 0) return { lang, form, idx };
    }
  }
  return undefined;
}

/** Applica a `word` le maiuscole di `sample` (tutto maiuscolo, iniziale maiuscola o minuscolo). */
function applyCase(sample: string, word: string): string {
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) {
    return word.toUpperCase();
  }
  const head = sample.charAt(0);
  if (head === head.toUpperCase() && head !== head.toLowerCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return word.toLowerCase();
}

const MONTH_NAMES = [
  ...new Set(LANGS.flatMap((l) => FORMS.flatMap((f) => MONTHS[l][f]))),
].sort((a, b) => b.length - a.length);
const WEEKDAY_NAMES = [
  ...new Set(LANGS.flatMap((l) => FORMS.flatMap((f) => WEEKDAYS[l][f]))),
].sort((a, b) => b.length - a.length);
const MONTH_ALT = MONTH_NAMES.map((n) => escapeRegExp(n)).join("|");
const WD_ALT = WEEKDAY_NAMES.map((n) => escapeRegExp(n)).join("|");

/** Ricostruisce una data a parole dal giorno finto, tenendo lingua, forma e maiuscole. */
function rebuildWordDate(
  wdToken: string | undefined,
  dayToken: string,
  monthToken: string,
  fakeIso: string,
  order: "dmy" | "mdy",
): string | undefined {
  const monthHit = lookup(MONTHS, monthToken);
  if (!monthHit) return undefined;
  const wdHit = wdToken ? lookup(WEEKDAYS, wdToken) : undefined;
  const lang = wdHit?.lang ?? monthHit.lang;
  const [fy, fm, fd] = ymd(fakeIso);
  const fakeMonth = applyCase(
    monthToken,
    MONTHS[lang][monthHit.form][Number(fm) - 1] ?? "",
  );
  const day = dayToken.length === 2 ? fd : String(Number(fd));
  let weekday = "";
  if (wdToken !== undefined && wdHit) {
    const dow = new Date(`${fakeIso}T00:00:00Z`).getUTCDay();
    weekday = applyCase(wdToken, WEEKDAYS[lang][wdHit.form][dow] ?? "");
    weekday += wdToken.includes(",") ? ", " : " ";
  }
  return order === "dmy"
    ? `${weekday}${day} ${fakeMonth} ${fy}`
    : `${weekday}${fakeMonth} ${day}, ${fy}`;
}

/** Date a parole (it/en, nome mese pieno o abbreviato, giorno di settimana facoltativo). */
function transformWordDates(input: string, map: MapIso): string {
  const wd = `(?:((?:${WD_ALT})\\.?,?)\\s+)?`;
  let text = input.replace(
    new RegExp(
      `(?<!\\p{L})${wd}(\\d{1,2})\\s+(${MONTH_ALT})\\.?\\s+(\\d{4})(?![\\p{L}\\d])`,
      "giu",
    ),
    (m0, wdTok, day: string, monthTok: string, year: string) => {
      const hit = lookup(MONTHS, monthTok);
      if (!hit) return m0;
      const iso = isoDay(+year, hit.idx + 1, +day);
      if (!iso) return m0;
      return rebuildWordDate(wdTok, day, monthTok, map(iso), "dmy") ?? m0;
    },
  );
  text = text.replace(
    new RegExp(
      `(?<!\\p{L})${wd}(${MONTH_ALT})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})(?![\\p{L}\\d])`,
      "giu",
    ),
    (m0, wdTok, monthTok: string, day: string, year: string) => {
      const hit = lookup(MONTHS, monthTok);
      if (!hit) return m0;
      const iso = isoDay(+year, hit.idx + 1, +day);
      if (!iso) return m0;
      return rebuildWordDate(wdTok, day, monthTok, map(iso), "mdy") ?? m0;
    },
  );
  return text;
}

/**
 * Passa per `map` ogni data riconosciuta, tenendo ora del giorno e fuso. Gli stessi
 * riconoscitori servono alla raccolta (`collectDays`) e alla sostituzione (`anonymize`).
 */
function transformDates(input: string, map: MapIso): string {
  let text = transformWordDates(input, map);
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
  // 2. `YYYY/MM/DD`, anche con `%2F` o `\/`.
  text = text.replace(
    /(?<!\d)(\d{4})(\/|%2F|\\\/)(\d{1,2})\2(\d{1,2})(?!\d)/gi,
    (m0, y: string, sep: string, m: string, d: string) => {
      const iso = isoDay(+y, +m, +d);
      if (!iso) return m0;
      const [fy, fm, fd] = ymd(map(iso));
      return `${fy}${sep}${fm}${sep}${fd}`;
    },
  );
  // 3. `DD/MM/YYYY` (anche `D/M/YYYY`), con separatore `/`, `.`, `-`, `%2F` o `\/`.
  text = text.replace(
    /(?<!\d)(\d{1,2})(\/|%2F|\\\/|[.-])(\d{1,2})\2(\d{4})(?!\d)/gi,
    (m0, d: string, sep: string, m: string, y: string) => {
      const iso = isoDay(+y, +m, +d);
      if (!iso) return m0;
      const [fy, fm, fd] = ymd(map(iso));
      return `${fd}${sep}${fm}${sep}${fy}`;
    },
  );
  // 4. `YYYYMMDD`, `YYYYMMDDHHMMSS`, `YYYYMMDDTHHMMSS` come cifre a sé (anche dopo `_`/`-`).
  text = text.replace(
    /(?<![0-9A-Za-z])(?<!\d[.,])(20\d{2})(\d{2})(\d{2})(T?(?:[01]\d|2[0-3])[0-5]\d[0-5]\d)?(?![0-9A-Za-z-])(?![.,]\d)/g,
    (m0, y: string, m: string, d: string, time: string | undefined) => {
      const iso = isoDay(+y, +m, +d, 2000);
      if (!iso) return m0;
      const [fy, fm, fd] = ymd(map(iso));
      return `${fy}${fm}${fd}${time ?? ""}`;
    },
  );
  // 5. Epoch di 10 (secondi) o 13 (millisecondi) cifre, in [2015, 2035]; l'ora resta.
  text = text.replace(/(?<!\d)(\d{13}|\d{10})(?!\d)/g, (m0, digits: string) => {
    const ms = digits.length === 13 ? Number(digits) : Number(digits) * 1000;
    const iso = new Date(ms).toISOString().slice(0, 10);
    const year = Number(iso.slice(0, 4));
    if (year < 2015 || year > 2035) return m0;
    const fake = map(iso);
    if (fake === iso) return m0;
    const newMs =
      Date.parse(`${fake}T00:00:00Z`) + (ms - Date.parse(`${iso}T00:00:00Z`));
    return digits.length === 13
      ? String(newMs)
      : String(Math.floor(newMs / 1000));
  });
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
  // E-mail prima (tengono il connettore), poi le altre identità, poi le date.
  const text = replaceIdentities(replaceEmails(input), opts.identities);
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

/**
 * Toglie i commenti HTML e gli elementi `<script>` che non contengono `EU.currentUser`:
 * nessun parser li legge, ma trasportano array di nomi di mese, id di analytics e dati di
 * profilo che la rete di sicurezza altrimenti bloccherebbe.
 */
function stripNonProfile(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) =>
      /EU\.currentUser/.test(m) ? m : "",
    );
}

const ENTITY_DECODE: Record<string, string> = {
  apos: "'",
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
};
for (const [ch, name] of Object.entries(NAMED_ENTITIES)) {
  if (!(name in ENTITY_DECODE)) ENTITY_DECODE[name] = ch;
}

/** Decodifica entità HTML decimali, esadecimali e con nome. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) =>
      String.fromCodePoint(Number.parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => ENTITY_DECODE[name] ?? m);
}

/** Decodifica le sequenze `%HH` (anche multi-byte UTF-8); lascia il resto invariato. */
function decodePercent(text: string): string {
  return text.replace(/(?:%[0-9a-fA-F]{2})+/g, (m) => {
    try {
      return decodeURIComponent(m);
    } catch {
      return m;
    }
  });
}

/**
 * Forma normalizzata per la rete di sicurezza: decodifica entità HTML, escape JS/JSON e
 * percento finché il testo non cambia più, toglie gli accenti e porta in minuscolo.
 */
function normalizeForCheck(text: string): string {
  let s = text;
  for (let i = 0; i < 5; i++) {
    const next = decodePercent(decodeJsString(decodeHtmlEntities(s)));
    if (next === s) break;
    s = next;
  }
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const strip = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MONTH_FULL = [...MONTHS.it.full, ...MONTHS.en.full].map(strip);
const WEEKDAY_FULL = [...WEEKDAYS.it.full, ...WEEKDAYS.en.full].map(strip);
const MONTH_ABBR = [...MONTHS.it.abbr, ...MONTHS.en.abbr].map(strip);
const WEEKDAY_ABBR = [...WEEKDAYS.it.abbr, ...WEEKDAYS.en.abbr].map(strip);

const FLAG_FULL_NAMES = new RegExp(
  `(?<!\\p{L})(?:${[...new Set([...MONTH_FULL, ...WEEKDAY_FULL])].join("|")})(?!\\p{L})`,
  "u",
);
const FLAG_ABBR_COMBO = new RegExp(
  `(?<!\\p{L})(?:${[...new Set(WEEKDAY_ABBR)].join("|")})\\.?\\s+\\d{1,2}\\s+(?:${[...new Set(MONTH_ABBR)].join("|")})(?!\\p{L})`,
  "u",
);
const FLAG_RELATIVE =
  /(?<!\p{L})(?:oggi|ieri|giorni fa|today|yesterday|days ago)(?!\p{L})/u;
const FLAG_DDMMYY = /(?<!\d)\d{1,2}\/\d{1,2}\/\d{2}(?!\d)/;
const FLAG_EPOCH = /(?<!\d)(\d{13}|\d{10})(?!\d)/g;

/** Vero se la riga normalizzata contiene una data che non deve mai raggiungere le fixture. */
function hasDateResidue(line: string): boolean {
  if (
    FLAG_FULL_NAMES.test(line) ||
    FLAG_ABBR_COMBO.test(line) ||
    line.includes("/date(") ||
    FLAG_RELATIVE.test(line) ||
    FLAG_DDMMYY.test(line)
  ) {
    return true;
  }
  for (const [, digits] of line.matchAll(FLAG_EPOCH)) {
    if (!digits) continue;
    const ms = digits.length === 13 ? Number(digits) : Number(digits) * 1000;
    const year = new Date(ms).getUTCFullYear();
    if (year >= 2015 && year <= 2035) return true;
  }
  return false;
}

/** Matcher di un'identità residua sulla riga normalizzata (confini di lettera per i nomi). */
function identityCheckers(identities: string[]): RegExp[] {
  const checks: RegExp[] = [];
  for (const identity of identities) {
    const s = strip(identity);
    if (s.length < MIN_IDENTITY_LENGTH) continue;
    if (NAME_LIKE.test(identity)) {
      checks.push(new RegExp(`(?<!\\p{L})${escapeRegExp(s)}(?!\\p{L})`, "u"));
      for (const word of identity.match(/\p{L}{3,}/gu) ?? []) {
        checks.push(
          new RegExp(`(?<!\\p{L})${escapeRegExp(strip(word))}(?!\\p{L})`, "u"),
        );
      }
    } else {
      checks.push(new RegExp(escapeRegExp(s), "u"));
    }
  }
  return checks;
}

type Residue = { file: string; line: number; kind: "identity" | "date" };

/** Rete di sicurezza: cerca identità o date residue in ogni output, per file e riga. */
function findResidue(
  outputs: { name: string; text: string }[],
  identities: string[],
): Residue[] {
  const idChecks = identityCheckers(identities);
  const hits: Residue[] = [];
  for (const { name, text } of outputs) {
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = normalizeForCheck(raw);
      if (idChecks.some((re) => re.test(line))) {
        hits.push({ file: name, line: i + 1, kind: "identity" });
      }
      if (hasDateResidue(line)) {
        hits.push({ file: name, line: i + 1, kind: "date" });
      }
    });
  }
  return hits;
}

/** La rete di sicurezza ha trovato un residuo: non si scrive nulla (messaggi già stampati). */
class ResidueError extends ParseError {}

/** Solo questi file entrano nelle fixture; `strength_detail_N.html` con la numerazione. */
function isAllowedFixture(name: string): boolean {
  const exact = new Set([
    "login_form.html",
    "login_ok.html",
    "last_sessions.html",
    "session_cardio_only.json",
    "session_strength.json",
    "cardio_timeseries.json",
    "biometrics.json",
  ]);
  return exact.has(name) || /^strength_detail(_\d+)?\.html$/.test(name);
}

/** In `biometrics.json` ogni `value` numerico diventa un numero sintetico fisso per misura. */
function syntheticMeasures(json: string): string {
  let n = 0;
  return json.replace(
    /("value"\s*:\s*)-?\d+(?:\.\d+)?/g,
    (_m, head: string) => `${head}${100 + n++}`,
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
  const candidates = (await readdir(src, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== IDENTITIES_FILE)
    .map((entry) => entry.name)
    .filter((name) => [".html", ".json"].includes(extname(name)))
    .sort();
  // Solo i file in elenco; gli altri si contano senza stamparne il nome (dati personali).
  const names = candidates.filter(isAllowedFixture);
  const skipped = candidates.length - names.length;
  if (skipped > 0) console.error(`${skipped} file ignorati`);
  // Tutto in memoria prima di scrivere: se un profilo non si riduce, nessun file esce.
  const clean: { name: string; text: string }[] = [];
  for (const name of names) {
    let text = await readFile(join(src, name), "utf8");
    if (name === "biometrics.json") text = syntheticMeasures(text);
    if (extname(name) === ".html") {
      try {
        if (name === "login_ok.html" && readCurrentUser(text) === undefined) {
          throw new ParseError("EU.currentUser non trovato");
        }
        text = stripNonProfile(reduceCurrentUser(text));
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
  const outputs = clean.map(({ name, text }) => ({
    name,
    text: anonymize(text, { identities, mapDay }),
  }));
  // Rete di sicurezza: su un residuo non si scrive nulla, solo `file:riga: tipo`.
  const residue = findResidue(outputs, identities);
  if (residue.length > 0) {
    for (const { file, line, kind } of residue) {
      console.error(`${file}:${line}: ${kind}`);
    }
    throw new ResidueError("residuo trovato");
  }
  await mkdir(dest, { recursive: true });
  for (const { name, text } of outputs) {
    await writeFile(join(dest, name), text);
    console.log(name);
  }
  return outputs.length;
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
    if (error instanceof ResidueError) return 65; // messaggi già stampati
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
