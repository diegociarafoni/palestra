// Rapporto della forma dei dati di Mywellness (Task 0): legge le risposte grezze del probe
// (probe_out/, che resta sul computer dell'utente) e scrive un file Markdown con la sola forma,
// da committare al posto delle fixture reali: nomi di campi, tag e attributi e il formato di
// ogni valore, con ogni lettera resa `a`/`A` e ogni cifra resa `9`; in chiaro restano solo le
// parole di VOCAB. Vedi docs/probe-mywellness.md § 2 e
// kb/decisioni/2026-11-01-forma-dei-dati-al-posto-delle-fixture-reali.md.
// Uso: npx tsx scripts/shape-report.ts <cartella_probe> <file_md>
// Legge solo i file in INPUTS (degli altri stampa il numero su stderr) e identities.json, che
// serve solo al controllo finale: prima di scrivere cerca nel rapporto identità, numeri e nomi
// di mesi o giorni; se ne trova non scrive nulla e stampa solo `file:riga: tipo`.
// Exit code: 0 ok · 64 argomenti · 65 identities.json non interpretabile o controllo finale
// fallito (nessun file scritto) · 78 identities.json mancante.
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HTMLElement, type Node, NodeType, parse } from "node-html-parser";
import { z } from "zod";
import { ParseError } from "../src/errors";
import { readCurrentUser } from "./probe-mywellness";

/**
 * Parole lasciate in chiaro nei valori (minuscole, senza accenti), ordinate: unità, parole
 * della tabella delle serie e dell'interfaccia, tipi di esercizio. Nessun nome di mese o di
 * giorno, nessuna parola di una lettera (sarebbe un'iniziale). Ogni parola in più esce in
 * chiaro: il vocabolario lo rivede l'utente.
 */
export const VOCAB: readonly string[] = [
  "bpm",
  "cal",
  "calorie",
  "calories",
  "cardio",
  "carico",
  "cm",
  "compliance",
  "distance",
  "distanza",
  "done",
  "durata",
  "duration",
  "eseguita",
  "eseguite",
  "eseguiti",
  "forza",
  "gmt",
  "kcal",
  "kg",
  "kj",
  "km",
  "lb",
  "level",
  "livello",
  "load",
  "min",
  "move",
  "moves",
  "peso",
  "potenza",
  "power",
  "prevista",
  "previste",
  "previsti",
  "rep",
  "reps",
  "rip",
  "ripetizioni",
  "rpm",
  "sec",
  "serie",
  "sets",
  "speed",
  "spm",
  "strength",
  "target",
  "tempo",
  "time",
  "utc",
  "velocita",
  "watt",
  "weight",
];

export type ShapeContext = {
  /** Parole lasciate in chiaro, in minuscolo e senza accenti. */
  vocab: readonly string[];
  identityWords: ReadonlySet<string>;
  /** Iniziali dei nomi tra le identità (`mr` per "Mario Rossi"), in minuscolo. */
  initials: ReadonlySet<string>;
};

/**
 * Sequenze di lettere, di cifre, di spazi, o un carattere qualunque. Cifre sono tutti i
 * numeri Unicode (\p{N}), non solo i decimali; spazi anche i caratteri di controllo, perché
 * un NUL farebbe trattare il rapporto come binario da check-public-tree.
 */
const RUN = /[\p{L}\p{M}]+|\p{N}+|[\s\p{Cc}]+|[\s\S]/gu;
const LETTERS = /^[\p{L}\p{M}]/u;
const DIGITS = /^\p{N}/u;
const SPACES = /^[\s\p{Cc}]/u;
/** Caratteri invisibili: spazio di larghezza zero, trattino morbido, BOM… */
const INVISIBLE = /\p{Cf}/gu;
/** Una sequenza di 1 o 2 cifre diventa `99`; oltre 20, 20 `9` e `…`. */
const MIN_DIGITS = 2;
const MAX_DIGITS = 20;

/** Forma di confronto: NFKC, senza caratteri invisibili, minuscole, senza accenti. */
function fold(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Un'identità fatta solo di lettere, spazi, apostrofi, punti e trattini: un nome. */
const NAME_LIKE = /^[\p{L} '.-]+$/u;

/**
 * Parole di 3 o più lettere (più corte non identificano nessuno) dei nomi tra le identità e
 * della parte locale dell'e-mail. Token, cookie, URL e GUID non si spezzano in parole: restano
 * sottostringhe per il controllo finale, e parole come "user" o "https" prese da un URL
 * maschererebbero nomi utili come `userId`.
 */
function identityWordsOf(identities: readonly string[]): Set<string> {
  return new Set(
    identities.flatMap((raw) => {
      const identity = fold(raw);
      const at = identity.indexOf("@");
      const source = NAME_LIKE.test(identity)
        ? identity
        : at > 0
          ? identity.slice(0, at)
          : "";
      return source.match(/\p{L}{3,}/gu) ?? [];
    }),
  );
}

/** Le prime lettere delle prime due parole di ogni nome tra le identità. */
function initialsOf(identities: readonly string[]): Set<string> {
  return new Set(
    identities.flatMap((raw) => {
      const identity = fold(raw);
      if (!NAME_LIKE.test(identity)) return [];
      const match = /^[^\p{L}]*(\p{L})\S*\s+[^\p{L}]*(\p{L})/u.exec(identity);
      return match ? [`${match[1]}${match[2]}`] : [];
    }),
  );
}

/** Contesto delle maschere: il vocabolario senza le parole delle identità. */
export function shapeContext(identities: readonly string[]): ShapeContext {
  const identityWords = identityWordsOf(identities);
  return {
    vocab: VOCAB.filter((word) => !identityWords.has(word)),
    identityWords,
    initials: initialsOf(identities),
  };
}

/**
 * Il formato di un testo: lettere `a`/`A`, cifre `9` (almeno 2: una cifra sola direbbe che il
 * valore è sotto 10), spazi singoli, il resto com'è.
 */
export function maskText(text: string, vocab: readonly string[]): string {
  const runs = text.normalize("NFKC").replace(INVISIBLE, "").match(RUN) ?? [];
  return runs
    .map((run, i) => {
      if (SPACES.test(run)) return " ";
      if (DIGITS.test(run)) {
        const length = [...run].length;
        return length > MAX_DIGITS
          ? `${"9".repeat(MAX_DIGITS)}…`
          : "9".repeat(Math.max(length, MIN_DIGITS));
      }
      if (!LETTERS.test(run)) return run;
      if (vocab.includes(fold(run))) return run;
      // La `T` e la `Z` delle date ISO (`…29T18:30:00Z`).
      const afterDigits = DIGITS.test(runs[i - 1] ?? "");
      if (run === "Z" && afterDigits) return run;
      if (run === "T" && afterDigits && DIGITS.test(runs[i + 1] ?? "")) {
        return run;
      }
      return /^\p{Lu}/u.test(run) ? "A" : "a";
    })
    .join("");
}

const KEY = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
/**
 * Chiavi il cui valore è il nome di una grandezza di Mywellness (es. `HDistance`), su cui
 * `src/mywellness/normalize.ts` sceglie i dati: il valore resta scritto se ha la forma di un
 * nome senza spazi, come i valori di `class` o `name` nell'HTML.
 */
const PROPERTY_KEYS = new Set(["physicalProperty", "property"]);
const PROPERTY_VALUE = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

/**
 * Un nome (chiave, tag, attributo, valore di `class`…) si stampa, con ogni cifra resa `9`, solo
 * se ha la forma attesa, meno di 3 cifre in tutto e niente delle identità o delle date;
 * altrimenti `undefined`. Le cifre si contano in tutto, non solo di fila: un id esadecimale
 * può non averne 3 consecutive. Le parti sono le sequenze di lettere, spezzate anche tra
 * minuscola e maiuscola: in `marioRossi` il controllo finale, che cerca le parole tra confini
 * di lettera, non vedrebbe il nome. Una parte non può essere parola di un'identità, mese o
 * giorno, anche abbreviato (`fc-day-wed`, `Oct29`), né, se è di 2 maiuscole, le iniziali di un
 * nome (`MR`); una parola di un'identità di 4 o più lettere non può stare in nessun punto
 * delle lettere unite del nome (`mariorossi`, `user_mrossi`).
 */
function plainName(
  name: string,
  shape: RegExp,
  ctx: ShapeContext,
): string | undefined {
  if (!shape.test(name) || (name.match(/\d/g)?.length ?? 0) >= 3) {
    return undefined;
  }
  const parts = name.split(/[^\p{L}]+|(?<=\p{Ll})(?=\p{Lu})/u);
  if (
    parts.some((part) => {
      const word = fold(part);
      return (
        ctx.identityWords.has(word) ||
        DATE_WORDS.has(word) ||
        DATE_ABBREVIATIONS.has(word) ||
        (/^\p{Lu}{2}$/u.test(part) && ctx.initials.has(word))
      );
    })
  ) {
    return undefined;
  }
  const letters = (fold(name).match(/\p{L}+/gu) ?? []).join("");
  if (
    [...ctx.identityWords].some(
      (word) => word.length >= 4 && letters.includes(word),
    )
  ) {
    return undefined;
  }
  return name.replace(/\d/g, "9");
}

/** Il nome com'è secondo `plainName`, o la sua maschera tra `«»`. */
function shownName(name: string, shape: RegExp, ctx: ShapeContext): string {
  return plainName(name, shape, ctx) ?? `«${maskText(name, ctx.vocab)}»`;
}

/** Riga di intestazione e righe interne (non indentate) di un valore JSON. */
type Block = { head: string; body: string[] };

function indent(lines: string[]): string[] {
  return lines.map((line) => `  ${line}`);
}

/** Un oggetto o una lista JSON scritti in una stringa; altrimenti `undefined`. */
function parseNested(text: string): object | undefined {
  if (!/^\s*[[{]/.test(text)) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

function jsonBlock(value: unknown, ctx: ShapeContext): Block {
  if (value === null) return { head: "null", body: [] };
  if (typeof value === "boolean") return { head: "booleano", body: [] };
  if (typeof value === "number") {
    // Solo segno e tipo: il numero di cifre direbbe l'ordine di grandezza.
    const sign = value < 0 ? "-" : "";
    const kind = Number.isInteger(value) ? "9" : "9.9";
    return { head: `numero ${sign}${kind}`, body: [] };
  }
  if (typeof value === "string") {
    const nested = parseNested(value);
    if (nested !== undefined) {
      return { head: "json in stringa:", body: shapeOfJson(nested, ctx) };
    }
    return { head: `"${maskText(value, ctx.vocab)}"`, body: [] };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { head: "[]", body: [] };
    return { head: "", body: arrayLines(value, ctx) };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return { head: "{}", body: [] };
    const lines: string[] = [];
    let previous: string | undefined;
    for (const [key, item] of entries) {
      const plain = plainName(key, KEY, ctx) !== undefined;
      const name = shownName(key, KEY, ctx);
      const property =
        plain && PROPERTY_KEYS.has(key) && typeof item === "string"
          ? plainName(item, PROPERTY_VALUE, ctx)
          : undefined;
      const { head, body } =
        property !== undefined
          ? { head: `"${property}"`, body: [] }
          : jsonBlock(item, ctx);
      const entry = [
        head === "" ? `${name}:` : `${name}: ${head}`,
        ...indent(body),
      ];
      // Una mappa per data o per id: le voci mascherate uguali una volta, senza conteggio.
      const text = entry.join("\n");
      if (!plain && text === previous) continue;
      previous = plain ? undefined : text;
      lines.push(...entry);
    }
    return { head: "", body: lines };
  }
  return { head: "", body: [] };
}

/** Oltre queste forme diverse in una lista, una riga `… altre varianti`. */
const MAX_VARIANTS = 5;

/** Ogni forma diversa degli elementi una volta, nell'ordine; mai la lunghezza. */
function arrayLines(items: unknown[], ctx: ShapeContext): string[] {
  const seen: string[] = [];
  const lines: string[] = [];
  for (const item of items) {
    const { head, body } = jsonBlock(item, ctx);
    // Un oggetto o una lista comincia sulla riga del trattino, come in YAML.
    const element =
      head === ""
        ? [`- ${body[0] ?? ""}`, ...indent(body.slice(1))]
        : [`- ${head}`, ...indent(body)];
    const key = element.join("\n");
    if (seen.includes(key)) continue;
    if (seen.length === MAX_VARIANTS) {
      lines.push("… altre varianti");
      break;
    }
    seen.push(key);
    lines.push(...element);
  }
  return lines;
}

/** La forma di un valore JSON, una riga per campo, indentata di 2 spazi per livello. */
export function shapeOfJson(value: unknown, ctx: ShapeContext): string[] {
  const { head, body } = jsonBlock(value, ctx);
  return head === "" ? body : [head, ...indent(body)];
}

const TAG = /^[a-z][a-z0-9-]{0,30}$/;
const ATTRIBUTE = /^[a-z_:][a-z0-9_.:-]{0,40}$/i;
/**
 * I soli nomi di attributo che si stampano, oltre a `data-…` e `aria-…`: su un valore senza
 * virgolette il parser fa nascere attributi dal testo della pagina (`value=Mario Rossi` dà
 * l'attributo `rossi`).
 */
export const HTML_ATTRIBUTES: ReadonlySet<string> = new Set([
  ...[
    "id",
    "class",
    "name",
    "type",
    "value",
    "href",
    "src",
    "action",
    "method",
  ],
  ...["for", "role", "rel", "title", "alt", "lang", "dir", "style", "width"],
  ...["height", "colspan", "rowspan", "scope", "placeholder", "target"],
  ...["content", "charset", "http-equiv", "property", "itemprop", "tabindex"],
  ...[
    "autocomplete",
    "maxlength",
    "minlength",
    "min",
    "max",
    "step",
    "pattern",
  ],
  ...[
    "accept",
    "enctype",
    "form",
    "label",
    "nonce",
    "integrity",
    "crossorigin",
  ],
  ...[
    "referrerpolicy",
    "media",
    "sizes",
    "srcset",
    "loading",
    "async",
    "defer",
  ],
  ...["hidden", "disabled", "readonly", "required", "multiple", "open"],
  ...["novalidate", "autofocus", "onclick", "onchange", "onsubmit", "onload"],
  "onerror",
]);
/** Gli attributi dell'elenco che si scrivono senza valore. */
const BOOLEAN_ATTRIBUTES = new Set([
  ...["async", "defer", "hidden", "disabled", "readonly", "required"],
  ...["multiple", "open", "novalidate", "autofocus"],
]);
/** Mai stampati, neanche mascherati: dicono che cosa ha scelto l'utente. */
const CHOICE_ATTRIBUTES = new Set(["checked", "selected"]);
const CUSTOM_ATTRIBUTE = /^(?:data|aria)-[a-z][a-z0-9_-]{0,40}$/i;
/** Attributi il cui valore è un nome del modello della pagina (es. `name=hdSessionIdCR`). */
const NAMING_ATTRIBUTES = new Set([
  "class",
  "for",
  "id",
  "method",
  "name",
  "rel",
  "role",
  "type",
]);
const NAMING_VALUE = /^[A-Za-z][A-Za-z0-9_. :-]{0,60}$/;
const OMITTED = "(contenuto omesso)";

/** Una classe di una lista `class`, giudicata da sola. */
const CLASS_TOKEN = /^[A-Za-z][A-Za-z0-9_.:-]{0,60}$/;

/** Il nome di un attributo dell'elenco o `data-…`/`aria-…`, in minuscolo; altrimenti `undefined`. */
function attributeName(name: string, ctx: ShapeContext): string | undefined {
  if (
    !HTML_ATTRIBUTES.has(name.toLowerCase()) &&
    !CUSTOM_ATTRIBUTE.test(name)
  ) {
    return undefined;
  }
  return plainName(name, ATTRIBUTE, ctx)?.toLowerCase();
}

function attributeText(name: string, value: string, ctx: ShapeContext): string {
  const plain = attributeName(name, ctx);
  const shown = plain ?? `«${maskText(name, ctx.vocab)}»`;
  // Senza valore si stampano solo gli attributi booleani dell'elenco.
  if (value === "") {
    return plain !== undefined && BOOLEAN_ATTRIBUTES.has(plain)
      ? plain
      : `«${maskText(name, ctx.vocab)}»`;
  }
  // Tutti gli altri valori, compresi href, src, action e data-*, sono mascherati.
  if (plain === undefined || !NAMING_ATTRIBUTES.has(plain)) {
    return `${shown}=«${maskText(value, ctx.vocab)}»`;
  }
  // Le classi una per una: `fc-day` resta scritta, `fc-day-wed` no.
  const kept =
    plain === "class"
      ? value
          .trim()
          .split(/\s+/)
          .map((token) => shownName(token, CLASS_TOKEN, ctx))
          .join(" ")
      : shownName(value, NAMING_VALUE, ctx);
  return `${shown}=${kept}`;
}

function elementLine(element: HTMLElement, ctx: ShapeContext): string {
  const shown = shownName(element.rawTagName.toLowerCase(), TAG, ctx);
  const attributes = Object.entries(element.attributes)
    .filter(([name]) => !CHOICE_ATTRIBUTES.has(name.toLowerCase()))
    .map(([name, value]) => attributeText(name, value, ctx));
  return attributes.length === 0 ? shown : `${shown}[${attributes.join(", ")}]`;
}

/** Di uno script solo la forma di `EU.currentUser`, decodificato come fa il client. */
function scriptLines(text: string, ctx: ShapeContext): string[] {
  let user: unknown;
  try {
    user = readCurrentUser(text);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    return ["EU.currentUser:", "  (JSON non valido)"];
  }
  if (user === undefined) return [OMITTED];
  return ["EU.currentUser:", ...indent(shapeOfJson(user, ctx))];
}

function nodeLines(node: Node, ctx: ShapeContext): string[] {
  if (node instanceof HTMLElement) {
    const tag = node.rawTagName.toLowerCase();
    const inner =
      tag === "script"
        ? scriptLines(node.rawText, ctx)
        : tag === "style"
          ? [OMITTED]
          : childLines(node.childNodes, ctx);
    return [elementLine(node, ctx), ...indent(inner)];
  }
  if (node.nodeType !== NodeType.TEXT_NODE) return [];
  const text = node.text.trim();
  return text === "" ? [] : [`"${maskText(text, ctx.vocab)}"`];
}

/** I fratelli consecutivi uguali una volta, con `(ripetuto)` e senza conteggio. */
function childLines(nodes: Node[], ctx: ShapeContext): string[] {
  const lines: string[] = [];
  let previous: string | undefined;
  let first = -1;
  let repeated = false;
  for (const node of nodes) {
    const own = nodeLines(node, ctx);
    if (own.length === 0) continue;
    const text = own.join("\n");
    if (text === previous) {
      if (!repeated) lines[first] += " (ripetuto)";
      repeated = true;
      continue;
    }
    previous = text;
    first = lines.length;
    repeated = false;
    lines.push(...own);
  }
  return lines;
}

/** La forma di una pagina HTML: un elemento per riga, indentato di 2 spazi per livello. */
export function shapeOfHtml(html: string, ctx: ShapeContext): string[] {
  // Con le opzioni predefinite i commenti non entrano nell'albero.
  return childLines(parse(html).childNodes, ctx);
}

export type Hit = { line: number; kind: "identity" | "number" | "date" };

/** Mesi e giorni della settimana per intero, in italiano e in inglese, senza accenti. */
export const DATE_WORDS: ReadonlySet<string> = new Set([
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
  "lunedi",
  "martedi",
  "mercoledi",
  "giovedi",
  "venerdi",
  "sabato",
  "domenica",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
/** Le loro abbreviazioni: "set" è settembre in it-IT, quindi non sta in VOCAB. */
export const DATE_ABBREVIATIONS: ReadonlySet<string> = new Set([
  // Mesi in italiano.
  ...["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "sett"],
  ...["ott", "nov", "dic"],
  // Mesi in inglese.
  ...["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept"],
  ...["oct", "nov", "dec"],
  // Giorni in italiano e in inglese.
  ...["lun", "mar", "mer", "gio", "ven", "sab", "dom"],
  ...["mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun"],
]);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ALL_DIGITS = /^\p{N}+$/u;

/**
 * Controllo finale, fail closed, su righe già mascherate: identità (parole di 3 o più
 * lettere dei nomi e della parte locale dell'e-mail, tra confini di lettera; e-mail e sua
 * parte locale, GUID con e senza trattini, token, cookie, URL e le altre identità che non
 * sono nomi come sottostringhe; identità di sole cifre, da 4, tra confini di cifra),
 * numeri (3 o più cifre non tutte `9`), date (nomi di mesi e giorni, anche abbreviati). Con le
 * maschere corrette non trova nulla: un risultato è un difetto o un nome che sembra un dato.
 */
export function checkReport(
  lines: readonly string[],
  identities: readonly string[],
): Hit[] {
  const words = identityWordsOf(identities);
  const digitIdentities = new Set<string>();
  const substrings = new Set<string>();
  for (const identity of identities.map(fold)) {
    if (identity === "") continue;
    if (ALL_DIGITS.test(identity)) {
      if ([...identity].length >= 4) digitIdentities.add(identity);
      continue;
    }
    if (!NAME_LIKE.test(identity)) substrings.add(identity);
    const at = identity.indexOf("@");
    if (at > 0) substrings.add(identity.slice(0, at));
    if (GUID.test(identity)) substrings.add(identity.replaceAll("-", ""));
  }
  const hits: Hit[] = [];
  lines.forEach((raw, i) => {
    const line = fold(raw);
    const letterRuns = line.match(/\p{L}+/gu) ?? [];
    const digitRuns = line.match(/\p{N}+/gu) ?? [];
    if (
      letterRuns.some((run) => words.has(run)) ||
      digitRuns.some((run) => digitIdentities.has(run)) ||
      [...substrings].some((text) => line.includes(text))
    ) {
      hits.push({ line: i + 1, kind: "identity" });
    }
    if (digitRuns.some((run) => [...run].length >= 3 && /[^9]/u.test(run))) {
      hits.push({ line: i + 1, kind: "number" });
    }
    if (
      letterRuns.some(
        (run) => DATE_WORDS.has(run) || DATE_ABBREVIATIONS.has(run),
      )
    ) {
      hits.push({ line: i + 1, kind: "date" });
    }
  });
  return hits;
}

const USAGE = "Uso: npx tsx scripts/shape-report.ts <cartella_probe> <file_md>";
const IDENTITIES_FILE = "identities.json";
/** I soli file del probe che il rapporto legge, nell'ordine delle sezioni. */
const INPUTS = [
  /^login_form\.html$/,
  /^login_ok\.html$/,
  /^last_sessions(?:_(\d+))?\.html$/,
  /^session_strength\.json$/,
  /^session_cardio_only\.json$/,
  /^strength_detail(?:_(\d+))?\.html$/,
  /^cardio_timeseries\.json$/,
  /^biometrics\.json$/,
];
const HEADER = [
  "# Forma dei dati di Mywellness",
  "",
  "File generato da `scripts/shape-report.ts` (Task 0) con le risposte del probe, che restano sul computer dell'utente. Mostra solo la forma dei dati:",
  "",
  "- restano scritti i nomi dei campi JSON, dei tag e degli attributi HTML e i valori di attributi come `class`, `id` e `name` e dei campi `physicalProperty` e `property`, se hanno la forma di un nome; gli altri sono mascherati tra `«»`;",
  "- nei valori ogni parola diventa `a` (se comincia con una minuscola) o `A` (se comincia con una maiuscola) e ogni cifra diventa `9`;",
  "- restano scritte solo le parole del vocabolario `VOCAB` dello script (unità di misura, parole della tabella delle serie e dell'interfaccia, tipi di esercizio), la punteggiatura, i simboli e la `T` e la `Z` delle date ISO;",
  "- liste e righe ripetute (`(ripetuto)`) non dicono quanti elementi hanno; il contenuto degli script è omesso, tranne la forma di `EU.currentUser`.",
  "",
  "Nient'altro: nessun nome, data, numero o identificativo.",
].join("\n");

/** Famiglia (posizione in INPUTS) e numero (1 senza suffisso) di un file del probe. */
function inputOrder(name: string): [number, number] | undefined {
  for (const [family, input] of INPUTS.entries()) {
    const match = input.exec(name);
    if (match) return [family, Number(match[1] ?? 1)];
  }
  return undefined;
}

async function readIdentities(src: string): Promise<string[]> {
  const text = await readFile(join(src, IDENTITIES_FILE), "utf8");
  try {
    return z.array(z.string()).parse(JSON.parse(text));
  } catch (error) {
    // Mai il messaggio originale: potrebbe citare le identità contenute nel file.
    throw new ParseError(
      `${IDENTITIES_FILE} non valido: serve un array di stringhe`,
      { cause: error },
    );
  }
}

function shapeOfFile(name: string, text: string, ctx: ShapeContext): string[] {
  if (!name.endsWith(".json")) return shapeOfHtml(text, ctx);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return ["(JSON non valido)"];
  }
  return shapeOfJson(value, ctx);
}

/** Una sezione del rapporto; `equalTo`: il file precedente della stessa famiglia, se uguale. */
type Section = {
  name: string;
  family: number;
  shape: string[];
  equalTo?: string;
};

function render(sections: Section[]): string {
  const parts = [HEADER];
  for (const { name, shape, equalTo } of sections) {
    parts.push(
      `## ${name}`,
      equalTo
        ? `Uguale a ${equalTo}.`
        : ["```text", ...shape, "```"].join("\n"),
    );
  }
  return `${parts.join("\n\n")}\n`;
}

export async function main(
  argv: string[],
  deps: Partial<{ vocab: readonly string[] }> = {},
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
  let identities: string[];
  try {
    identities = await readIdentities(src);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    console.error(error.message);
    return 65;
  }
  const ctx = shapeContext(identities);
  // Solo per i test: un vocabolario dato, senza togliere le parole delle identità.
  if (deps.vocab) ctx.vocab = deps.vocab;
  const entries = await readdir(src);
  const inputs = entries
    .flatMap((name) => {
      const order = inputOrder(name);
      return order ? [{ name, order }] : [];
    })
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]);
  // Gli altri file (session_<n>.json…) non si leggono; identities.json non è una sezione.
  const skipped = entries.length - inputs.length - 1;
  const sections: Section[] = [];
  for (const { name, order } of inputs) {
    const text = new TextDecoder().decode(await readFile(join(src, name)));
    const shape = shapeOfFile(name, text, ctx);
    const previous = sections.findLast((s) => s.family === order[0]);
    const equal = previous?.shape.join("\n") === shape.join("\n");
    sections.push({
      name,
      family: order[0],
      shape,
      ...(previous && equal ? { equalTo: previous.name } : {}),
    });
  }
  // Fail closed: un solo risultato e non si scrive nulla; su stderr mai il testo trovato.
  const hits = sections.flatMap(({ name, shape, equalTo }) =>
    equalTo
      ? []
      : checkReport(shape, identities).map(
          ({ line, kind }) => `${name}:${line}: ${kind}`,
        ),
  );
  if (hits.length > 0) {
    for (const hit of hits) console.error(hit);
    return 65;
  }
  await writeFile(dest, render(sections));
  console.log(`rapporto scritto: ${dest}`);
  console.log(`sezioni: ${sections.length}`);
  if (skipped > 0) console.error(`file ignorati: ${skipped}`);
  return 0;
}

// Eseguito con `npx tsx scripts/shape-report.ts`; importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2));
}
