// Rapporto della forma dei dati di Mywellness (Task 0): legge le risposte grezze del probe
// (probe_out/, che resta sul computer dell'utente) e scrive un file Markdown con la sola forma,
// da committare al posto delle fixture reali: nomi di campi, tag e attributi e il formato di
// ogni valore, con ogni lettera resa `a`/`A` e ogni cifra resa `9`; in chiaro restano solo le
// parole di VOCAB. Vedi docs/probe-mywellness.md § 2 e
// kb/decisioni/2026-11-01-forma-dei-dati-al-posto-delle-fixture-reali.md.
// Uso: npx tsx scripts/shape-report.ts <cartella_probe> <file_md>
// Legge solo i file in INPUTS (gli altri non li apre né li conta) e scrive una sezione per
// famiglia, con un titolo fisso e le forme diverse dei suoi file in ordine alfabetico.
// identities.json serve solo al controllo finale: prima di scrivere cerca nelle sezioni
// identità, numeri e nomi di mesi o giorni; se ne trova non scrive nulla e stampa solo
// `sezione:riga: tipo`.
// Su stdout solo `rapporto scritto: <file_md>`.
// Exit code: 0 ok · 64 argomenti · 65 identities.json non interpretabile o controllo finale
// fallito (nessun file scritto) · 70 errore imprevisto (solo un messaggio fisso e il codice
// dell'errore del file system) · 78 identities.json mancante.
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HTMLElement, type Node, NodeType, parse } from "node-html-parser";
import { z } from "zod";
import { exitCodeFor, ParseError } from "../src/errors";
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
/**
 * I soli simboli che restano: punteggiatura e simboli ASCII e pochi segni tipografici. Ogni
 * altro carattere che non è lettera, cifra o spazio diventa `?` (un'emoji, un simbolo raro o un
 * carattere privato potrebbero fare da contrassegno).
 */
const KEPT_SYMBOL = /^[!-/:-@[-`{-~«»–—€°·’‘“”…]$/u;
/** Una sequenza di 1 o 2 cifre diventa `99`; oltre 20, 20 `9` e `…`. */
const MIN_DIGITS = 2;
const MAX_DIGITS = 20;

/** Lettere che NFD non scompone in lettera e accento. */
const TRANSLITERATION: Readonly<Record<string, string>> = {
  ł: "l",
  ø: "o",
  ß: "ss",
  ı: "i",
  đ: "d",
  æ: "ae",
  œ: "oe",
  þ: "th",
};

/** Forma di confronto: NFKC, senza caratteri invisibili, minuscole, senza accenti. */
function fold(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[łøßıđæœþ]/gu, (letter) => TRANSLITERATION[letter] ?? letter);
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

/**
 * Le iniziali, in entrambi gli ordini: le prime lettere delle prime due parole di ogni nome tra
 * le identità e, poiché il probe raccoglie nome e cognome anche in campi separati, di ogni
 * coppia di nomi di una parola.
 */
function initialsOf(identities: readonly string[]): Set<string> {
  const names = identities.map(fold).filter((name) => NAME_LIKE.test(name));
  const single = names.flatMap((name) => {
    const match = /^[^\p{L}]*(\p{L})\S*$/u.exec(name.trim());
    return match?.[1] ? [match[1]] : [];
  });
  return new Set([
    ...names.flatMap((name) => {
      const match = /^[^\p{L}]*(\p{L})\S*\s+[^\p{L}]*(\p{L})/u.exec(name);
      return match ? [`${match[1]}${match[2]}`, `${match[2]}${match[1]}`] : [];
    }),
    ...single.flatMap((a, i) =>
      single.flatMap((b, j) => (i === j ? [] : [`${a}${b}`])),
    ),
  ]);
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
 * valore è sotto 10), spazi singoli, i simboli di KEPT_SYMBOL, `?` per il resto.
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
      if (run === "`") return "'";
      if (!LETTERS.test(run)) return KEPT_SYMBOL.test(run) ? run : "?";
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
 * Un nome (chiave JSON, tag, attributo, valore di `name`, `type` e `method` o di `property`) si
 * stampa, con ogni sequenza di cifre resa `99`, solo se ha la forma attesa e meno di 3 cifre in
 * tutto; altrimenti `undefined`. Le cifre si contano in tutto, non solo di fila: un id
 * esadecimale può non averne 3 consecutive. Le parti sono le sequenze di lettere, spezzate
 * anche tra minuscola e maiuscola (in `marioRossi` il controllo finale, che cerca le parole tra
 * confini di lettera, non vedrebbe il nome). Il nome si maschera se:
 * - una parte è una parola di DATE_PARTS (`fc-day-wed`, `Oct29`; non per i tag: `th` resta);
 * - almeno 4 parti hanno 1 o 2 lettere (`AbCdEfGh9j`, un token);
 * - una parte di 2 lettere sono iniziali di un nome (`mr`, `Mr`, `RM`), o le parti di una
 *   lettera, unite, le contengono (`M.R`, `m-r`);
 * - una parola di un'identità sta in un punto qualunque delle lettere unite del nome
 *   (`mariorossi`, `user_mrossi`, `profileeva`).
 */
function plainName(
  name: string,
  shape: RegExp,
  ctx: ShapeContext,
  dateParts = true,
): string | undefined {
  if (!shape.test(name) || (name.match(/\d/g)?.length ?? 0) >= 3) {
    return undefined;
  }
  const parts = name
    .split(/[^\p{L}]+|(?<=\p{Ll})(?=\p{Lu})/u)
    .filter((part) => part !== "");
  if (parts.filter((part) => [...part].length <= 2).length >= 4) {
    return undefined;
  }
  if (
    parts.some((part) => {
      const word = fold(part);
      return (
        (dateParts && DATE_PART_SET.has(word)) ||
        ([...part].length === 2 && ctx.initials.has(word))
      );
    })
  ) {
    return undefined;
  }
  const singles = parts
    .filter((part) => [...part].length === 1)
    .map(fold)
    .join("");
  if ([...ctx.initials].some((initials) => singles.includes(initials))) {
    return undefined;
  }
  // Le parole delle identità hanno almeno 3 lettere (identityWordsOf).
  const letters = (fold(name).match(/\p{L}+/gu) ?? []).join("");
  if ([...ctx.identityWords].some((word) => letters.includes(word))) {
    return undefined;
  }
  return name.replace(/\d+/g, "99");
}

/** Il nome com'è secondo `plainName`, o la sua maschera tra `«»`. */
function shownName(
  name: string,
  shape: RegExp,
  ctx: ShapeContext,
  dateParts = true,
): string {
  return (
    plainName(name, shape, ctx, dateParts) ?? `«${maskText(name, ctx.vocab)}»`
  );
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

/** Oltre 40 livelli di oggetti, liste o elementi, una riga `(troppo profondo)`. */
const MAX_DEPTH = 40;
const TOO_DEEP = "(troppo profondo)";
// Le altre parole che il rapporto scrive da sé (vedi FIXED_TEXT).
const OMITTED = "(contenuto omesso)";
const INVALID_JSON = "(JSON non valido)";
const NESTED_JSON = "json in stringa:";
const CURRENT_USER = "EU.currentUser:";
const REPEATED = " (ripetuto)";
const MORE_VARIANTS = "… altre varianti";
const MORE_COLUMNS = "… altre colonne";
const UNREADABLE_ATTRIBUTES = "«attributi non leggibili»";

function jsonBlock(value: unknown, ctx: ShapeContext, depth: number): Block {
  if (typeof value === "object" && value !== null && depth >= MAX_DEPTH) {
    return { head: TOO_DEEP, body: [] };
  }
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
      return {
        head: NESTED_JSON,
        body: shapeOfJson(nested, ctx, depth + 1),
      };
    }
    return { head: `"${maskText(value, ctx.vocab)}"`, body: [] };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { head: "[]", body: [] };
    return { head: "", body: arrayLines(value, ctx, depth) };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return { head: "{}", body: [] };
    const lines: string[] = [];
    // Le voci con la chiave mascherata (una mappa per data o per id) stanno insieme, dove
    // compare la prima, con la regola dei fratelli HTML: niente ordine e niente conteggio.
    const masked: string[][] = [];
    let at = -1;
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
          : jsonBlock(item, ctx, depth + 1);
      const entry = [
        head === "" ? `${name}:` : `${name}: ${head}`,
        ...indent(body),
      ];
      if (plain) {
        lines.push(...entry);
        continue;
      }
      if (at < 0) at = lines.length;
      masked.push(entry);
    }
    if (at >= 0) lines.splice(at, 0, ...variantLines(masked, true));
    return { head: "", body: lines };
  }
  return { head: "", body: [] };
}

/** Oltre queste forme diverse in un gruppo, una riga `… altre varianti`. */
const MAX_VARIANTS = 5;

/**
 * Ogni forma diversa di un gruppo una volta, in ordine alfabetico e mai nell'ordine del file,
 * al massimo MAX_VARIANTS. Con `repeated`, `(ripetuto)` sulla prima riga di una forma che
 * compare più di una volta. Mai un conteggio.
 */
function variantLines(items: readonly string[][], repeated: boolean): string[] {
  const variants = new Map<string, { lines: string[]; count: number }>();
  for (const lines of items) {
    const text = lines.join("\n");
    const seen = variants.get(text);
    if (seen) seen.count++;
    else variants.set(text, { lines, count: 1 });
  }
  const texts = [...variants.keys()].sort();
  const out = texts.slice(0, MAX_VARIANTS).flatMap((text) => {
    const { lines, count } = variants.get(text) ?? { lines: [], count: 0 };
    const [first = "", ...rest] = lines;
    return [repeated && count > 1 ? `${first}${REPEATED}` : first, ...rest];
  });
  if (texts.length > MAX_VARIANTS) out.push(MORE_VARIANTS);
  return out;
}

/** Le forme diverse degli elementi; mai la lunghezza della lista. */
function arrayLines(
  items: unknown[],
  ctx: ShapeContext,
  depth: number,
): string[] {
  const elements = items.map((item) => {
    const { head, body } = jsonBlock(item, ctx, depth + 1);
    // Un oggetto o una lista comincia sulla riga del trattino, come in YAML.
    return head === ""
      ? [`- ${body[0] ?? ""}`, ...indent(body.slice(1))]
      : [`- ${head}`, ...indent(body)];
  });
  return variantLines(elements, false);
}

/** La forma di un valore JSON, una riga per campo, indentata di 2 spazi per livello. */
export function shapeOfJson(
  value: unknown,
  ctx: ShapeContext,
  depth = 0,
): string[] {
  const { head, body } = jsonBlock(value, ctx, depth);
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
/**
 * I soli attributi il cui valore si stampa, se ha la forma di un nome: quelli che leggono i
 * parser (es. `name=hdSessionIdCR`). I valori di `class`, `id` e degli altri sono mascherati.
 */
const NAMING_ATTRIBUTES = new Set(["method", "name", "type"]);
const NAMING_VALUE = /^[A-Za-z][A-Za-z0-9_. :-]{0,60}$/;
/** Virgolette con la barra: il parser spezza male gli attributi e ne fa nascere dal testo. */
const ESCAPED_QUOTE = /\\["']/;

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

function attributeText(
  name: string,
  value: string,
  maskValues: boolean,
  ctx: ShapeContext,
): string {
  const plain = attributeName(name, ctx);
  const shown = plain ?? `«${maskText(name, ctx.vocab)}»`;
  // Senza valore si stampano solo gli attributi booleani dell'elenco.
  if (value === "") {
    return plain !== undefined && BOOLEAN_ATTRIBUTES.has(plain)
      ? plain
      : `«${maskText(name, ctx.vocab)}»`;
  }
  // Tutti gli altri valori, compresi class, id, href, src e data-*, sono mascherati.
  if (maskValues || plain === undefined || !NAMING_ATTRIBUTES.has(plain)) {
    return `${shown}=«${maskText(value, ctx.vocab)}»`;
  }
  return `${shown}=${shownName(value, NAMING_VALUE, ctx)}`;
}

function elementLine(element: HTMLElement, ctx: ShapeContext): string {
  // I tag sono esclusi dalla regola delle date: `th` è anche "giovedì" abbreviato.
  const shown = shownName(element.rawTagName.toLowerCase(), TAG, ctx, false);
  const maskValues = ESCAPED_QUOTE.test(element.rawAttrs);
  let entries: [string, string][];
  try {
    entries = Object.entries(element.attributes);
  } catch {
    // Attributi come `toString=` o `constructor=`: il parser non sa decodificarli.
    return `${shown}[${UNREADABLE_ATTRIBUTES}]`;
  }
  const attributes = entries
    .filter(([name]) => !CHOICE_ATTRIBUTES.has(name.toLowerCase()))
    .map(([name, value]) => attributeText(name, value, maskValues, ctx));
  return attributes.length === 0 ? shown : `${shown}[${attributes.join(", ")}]`;
}

/** Di uno script solo la forma di `EU.currentUser`, decodificato come fa il client. */
function scriptLines(text: string, ctx: ShapeContext, depth: number): string[] {
  let user: unknown;
  try {
    user = readCurrentUser(text);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    return [CURRENT_USER, `  ${INVALID_JSON}`];
  }
  if (user === undefined) return [OMITTED];
  return [CURRENT_USER, ...indent(shapeOfJson(user, ctx, depth))];
}

/**
 * La tabella delle serie, riconosciuta come in `src/mywellness/normalize.ts`: un'intestazione
 * `th` con "seri" (Serie, Series, Serien).
 */
function isSetTable(table: HTMLElement): boolean {
  return table.querySelectorAll("th").some((th) => /seri/i.test(th.text));
}

/** `setTable`: il nodo sta nella tabella delle serie, l'unica le cui celle restano in ordine. */
function nodeLines(
  node: Node,
  ctx: ShapeContext,
  depth: number,
  setTable: boolean,
): string[] {
  if (node instanceof HTMLElement) {
    if (depth >= MAX_DEPTH) return [TOO_DEEP];
    const tag = node.rawTagName.toLowerCase();
    const inside = tag === "table" ? isSetTable(node) : setTable;
    const inner =
      tag === "script"
        ? scriptLines(node.rawText, ctx, depth + 1)
        : tag === "style"
          ? [OMITTED]
          : tag === "tr" && inside
            ? cellLines(node.childNodes, ctx, depth + 1, inside)
            : childLines(node.childNodes, ctx, depth + 1, inside);
    return [elementLine(node, ctx), ...indent(inner)];
  }
  if (node.nodeType !== NodeType.TEXT_NODE) return [];
  const text = node.text.trim();
  return text === "" ? [] : [`"${maskText(text, ctx.vocab)}"`];
}

/**
 * I fratelli raggruppati per tag (i testi sono un gruppo), nell'ordine in cui ogni tag compare
 * la prima volta; in ogni gruppo le forme diverse secondo `variantLines`. Resta visibile solo
 * l'ordine della prima comparsa dei tag diversi.
 */
function childLines(
  nodes: Node[],
  ctx: ShapeContext,
  depth: number,
  setTable: boolean,
): string[] {
  const groups = new Map<string, string[][]>();
  for (const node of nodes) {
    const own = nodeLines(node, ctx, depth, setTable);
    if (own.length === 0) continue;
    const tag =
      node instanceof HTMLElement ? node.rawTagName.toLowerCase() : "#text";
    const group = groups.get(tag);
    if (group) group.push(own);
    else groups.set(tag, [own]);
  }
  return [...groups.values()].flatMap((group) => variantLines(group, true));
}

/** Oltre queste colonne della tabella delle serie, una riga `… altre colonne`. */
const MAX_COLUMNS = 12;

/**
 * Le celle di una riga della tabella delle serie nell'ordine delle colonne, al massimo
 * MAX_COLUMNS: il Task 0 Step 5 deve sapere in che ordine stanno serie, ripetizioni e kg. Solo
 * qui: in un'altra tabella (un calendario) la posizione di una cella direbbe un giorno. Le righe
 * restano raggruppate come gli altri fratelli, così il numero di serie non si legge.
 */
function cellLines(
  nodes: Node[],
  ctx: ShapeContext,
  depth: number,
  setTable: boolean,
): string[] {
  const cells = nodes
    .map((node) => nodeLines(node, ctx, depth, setTable))
    .filter((lines) => lines.length > 0);
  const lines = cells.slice(0, MAX_COLUMNS).flat();
  if (cells.length > MAX_COLUMNS) lines.push(MORE_COLUMNS);
  return lines;
}

/** La forma di una pagina HTML: un elemento per riga, indentato di 2 spazi per livello. */
export function shapeOfHtml(html: string, ctx: ShapeContext): string[] {
  // Con le opzioni predefinite i commenti non entrano nell'albero.
  return childLines(parse(html).childNodes, ctx, 0, false);
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
/** Le forme di 2 lettere dei giorni: il controllo finale non le cerca (`th` è un tag). */
const TWO_LETTER_DAYS: ReadonlySet<string> = new Set([
  ...["lu", "ma", "me", "gi", "ve", "sa", "do", "mo", "tu", "we", "th", "fr"],
  ...["su", "di", "mi", "so"],
]);
/**
 * Ogni parola di data che un nome stampato non può contenere, minuscola e senza accenti, in
 * ordine: DATE_WORDS, DATE_ABBREVIATIONS, mesi e giorni in tedesco, francese e spagnolo, interi
 * e abbreviati, parole relative, momenti del giorno e forme di 2 lettere dei giorni.
 */
export const DATE_PARTS: readonly string[] = [
  ...new Set([
    ...DATE_WORDS,
    ...DATE_ABBREVIATIONS,
    // Mesi in tedesco, francese e spagnolo.
    ...["januar", "februar", "marz", "april", "mai", "juni", "juli", "august"],
    ...["september", "oktober", "november", "dezember", "jan", "feb", "mrz"],
    ...["apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez"],
    ...["janvier", "fevrier", "mars", "avril", "juin", "juillet", "aout"],
    ...["septembre", "octobre", "novembre", "decembre", "janv", "fevr", "avr"],
    ...["juil", "sept", "oct", "dec", "enero", "febrero", "marzo", "abril"],
    ...["mayo", "junio", "julio", "agosto", "septiembre", "octubre"],
    ...["noviembre", "diciembre", "ene", "abr", "ago", "dic"],
    // Giorni in tedesco, francese e spagnolo.
    ...["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"],
    ...["sonntag", "mo", "di", "mi", "do", "fr", "sa", "so", "lundi", "mardi"],
    ...["mercredi", "jeudi", "vendredi", "samedi", "dimanche", "lun", "mar"],
    ...["mer", "jeu", "ven", "sam", "dim", "lunes", "martes", "miercoles"],
    ...["jueves", "viernes", "sabado", "domingo"],
    // Parole relative e momenti del giorno.
    ...["oggi", "ieri", "domani", "today", "yesterday", "tomorrow", "weekend"],
    ...["mattina", "pomeriggio", "sera", "notte", "morning", "afternoon"],
    ...["evening", "night", "am", "pm"],
    ...TWO_LETTER_DAYS,
  ]),
].sort();
const DATE_PART_SET: ReadonlySet<string> = new Set(DATE_PARTS);
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
  // Le stesse identità scritte con i 9: una cifra per `9`, e ogni sequenza di cifre per `99`
  // come nei nomi stampati, così un token con 1 o 2 cifre non passa per un nome.
  for (const text of [...substrings]) {
    substrings.add(text.replace(/\p{N}/gu, "9"));
    substrings.add(text.replace(/\p{N}+/gu, "99"));
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
        (run) => DATE_PART_SET.has(run) && !TWO_LETTER_DAYS.has(run),
      )
    ) {
      hits.push({ line: i + 1, kind: "date" });
    }
  });
  return hits;
}

const USAGE = "Uso: npx tsx scripts/shape-report.ts <cartella_probe> <file_md>";
const IDENTITIES_FILE = "identities.json";
/**
 * Le sole famiglie di file del probe che il rapporto legge, nell'ordine delle sezioni, con il
 * titolo fisso della sezione: né il numero né il nome dei file entrano nel rapporto.
 */
const INPUTS: readonly { heading: string; file: RegExp }[] = [
  { heading: "login_form.html", file: /^login_form\.html$/ },
  { heading: "login_ok.html", file: /^login_ok\.html$/ },
  { heading: "last_sessions*.html", file: /^last_sessions(?:_\d+)?\.html$/ },
  { heading: "session_strength.json", file: /^session_strength\.json$/ },
  { heading: "session_cardio_only.json", file: /^session_cardio_only\.json$/ },
  {
    heading: "strength_detail*.html",
    file: /^strength_detail(?:_\d+)?\.html$/,
  },
  { heading: "cardio_timeseries.json", file: /^cardio_timeseries\.json$/ },
  { heading: "biometrics.json", file: /^biometrics\.json$/ },
];
const HEADER = [
  "# Forma dei dati di Mywellness",
  "",
  "File generato da `scripts/shape-report.ts` (Task 0) con le risposte del probe, che restano sul computer dell'utente. Mostra solo la forma dei dati, con una sezione per famiglia di file e, in ogni sezione, le forme diverse dei suoi file in ordine alfabetico:",
  "",
  "- restano scritti i nomi dei campi JSON, dei tag e degli attributi HTML noti e i valori di attributi come `class`, `id` e `name` e dei campi `physicalProperty` e `property`, se hanno la forma di un nome, con ogni cifra resa `9`; gli altri sono mascherati tra `«»`;",
  "- nei valori ogni parola diventa `a` (se comincia con una minuscola) o `A` (se comincia con una maiuscola); una sequenza di 1 o 2 cifre diventa `99`, una più lunga ha un `9` per cifra (al massimo 20, poi `…`); i numeri JSON diventano `numero 9`, `numero 9.9` o `numero -9`;",
  "- restano scritte solo le parole del vocabolario `VOCAB` dello script (unità di misura, parole della tabella delle serie e dell'interfaccia, tipi di esercizio), la punteggiatura e i simboli ASCII, pochi segni tipografici e la `T` e la `Z` delle date ISO; ogni altro carattere diventa `?`;",
  "- elementi fratelli con lo stesso tag, voci con la chiave mascherata ed elementi di una lista compaiono una volta per forma, in ordine alfabetico e al massimo 5 (poi `… altre varianti`), senza dire quanti sono; le celle di una riga di tabella restano tutte, nell'ordine delle colonne; `(ripetuto)` segna un fratello o una voce che si ripete; il contenuto degli script è omesso, tranne la forma di `EU.currentUser`.",
  "",
  "Dell'ordine della pagina resta solo l'ordine in cui compaiono per la prima volta i tag diversi tra fratelli. Nient'altro: nessun nome, data, numero o identificativo.",
].join("\n");

/**
 * Il testo che il rapporto scrive da sé: intestazione, titoli delle sezioni e parole del
 * renderer. Un test controlla che non contenga parole di DATE_PARTS, che il controllo finale
 * segnalerebbe.
 */
export const FIXED_TEXT: readonly string[] = [
  ...HEADER.split("\n"),
  ...INPUTS.map(({ heading }) => `## ${heading}`),
  "```text",
  ...["numero 9", "numero 9.9", "numero -9", "booleano", "null", "[]", "{}"],
  ...[NESTED_JSON, CURRENT_USER, OMITTED, INVALID_JSON, REPEATED],
  ...[MORE_VARIANTS, MORE_COLUMNS, TOO_DEEP, UNREADABLE_ATTRIBUTES],
];

export async function readIdentities(src: string): Promise<string[]> {
  const text = await readFile(join(src, IDENTITIES_FILE), "utf8");
  try {
    return z.array(z.string()).parse(JSON.parse(text));
  } catch {
    // Né il messaggio né la causa originale: potrebbero citare le identità del file.
    throw new ParseError(
      `${IDENTITIES_FILE} non valido: serve un array di stringhe`,
    );
  }
}

function shapeOfFile(name: string, text: string, ctx: ShapeContext): string[] {
  if (!name.endsWith(".json")) return shapeOfHtml(text, ctx);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [INVALID_JSON];
  }
  return shapeOfJson(value, ctx);
}

/**
 * Le righe di una sezione: il titolo e ogni forma diversa una volta, in ordine alfabetico e al
 * massimo MAX_VARIANTS, poi `… altre varianti`.
 */
function sectionLines(heading: string, shapes: readonly string[][]): string[] {
  const distinct = new Map(shapes.map((shape) => [shape.join("\n"), shape]));
  const keys = [...distinct.keys()].sort();
  const lines = [
    `## ${heading}`,
    ...keys
      .slice(0, MAX_VARIANTS)
      .flatMap((key) => ["", "```text", ...(distinct.get(key) ?? []), "```"]),
  ];
  if (keys.length > MAX_VARIANTS) lines.push("", MORE_VARIANTS);
  return lines;
}

type Deps = Partial<{ vocab: readonly string[] }>;

export async function main(argv: string[], deps: Deps = {}): Promise<number> {
  const [src, dest] = argv;
  if (argv.length !== 2 || !src || !dest) {
    console.error(USAGE);
    return 64;
  }
  try {
    return await report(src, dest, deps);
  } catch (error) {
    // Un messaggio fisso, mai quello originale né la traccia: potrebbero citare un dato. Degli
    // errori del file system solo il codice (es. EACCES).
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      /^E[A-Z]+$/.test(error.code)
        ? `: ${error.code}`
        : "";
    console.error(`errore imprevisto${code}`);
    return exitCodeFor(error);
  }
}

async function report(src: string, dest: string, deps: Deps): Promise<number> {
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
  // Gli altri file (session_<n>.json…) non si leggono né si contano.
  const entries = await readdir(src);
  const sections: { heading: string; lines: string[] }[] = [];
  for (const { heading, file } of INPUTS) {
    const shapes: string[][] = [];
    for (const name of entries.filter((entry) => file.test(entry))) {
      const text = new TextDecoder().decode(await readFile(join(src, name)));
      shapes.push(shapeOfFile(name, text, ctx));
    }
    if (shapes.length > 0) {
      sections.push({ heading, lines: sectionLines(heading, shapes) });
    }
  }
  // Fail closed sulle sezioni come saranno scritte, titoli compresi: un solo risultato e non
  // si scrive nulla; su stderr mai il testo trovato.
  const hits = sections.flatMap(({ heading, lines }) =>
    checkReport(lines, identities).map(
      ({ line, kind }) => `${heading}:${line}: ${kind}`,
    ),
  );
  if (hits.length > 0) {
    for (const hit of hits) console.error(hit);
    return 65;
  }
  const parts = [HEADER, ...sections.map(({ lines }) => lines.join("\n"))];
  await writeFile(dest, `${parts.join("\n\n")}\n`);
  console.log(`rapporto scritto: ${dest}`);
  return 0;
}

// Eseguito con `npx tsx scripts/shape-report.ts`; importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2));
}
