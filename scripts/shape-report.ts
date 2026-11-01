import { HTMLElement, type Node, NodeType, parse } from "node-html-parser";
import { ParseError } from "../src/errors";
import { readCurrentUser } from "../src/mywellness/client";

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
  "distance",
  "distanza",
  "durata",
  "duration",
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
  "rep",
  "reps",
  "rip",
  "ripetizioni",
  "rpm",
  "sec",
  "serie",
  "set",
  "sets",
  "speed",
  "spm",
  "strength",
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
const MAX_DIGITS = 20;

/** Forma di confronto: NFKC, minuscole, senza accenti. */
function fold(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Parole di 3 o più lettere delle identità: più corte non identificano nessuno. */
function identityWordsOf(identities: readonly string[]): Set<string> {
  return new Set(
    identities.flatMap((identity) => fold(identity).match(/\p{L}{3,}/gu) ?? []),
  );
}

/** Contesto delle maschere: il vocabolario senza le parole delle identità. */
export function shapeContext(identities: readonly string[]): ShapeContext {
  const identityWords = identityWordsOf(identities);
  return {
    vocab: VOCAB.filter((word) => !identityWords.has(word)),
    identityWords,
  };
}

/** Il formato di un testo: lettere `a`/`A`, cifre `9`, spazi singoli, il resto com'è. */
export function maskText(text: string, vocab: readonly string[]): string {
  const runs = text.normalize("NFKC").replace(INVISIBLE, "").match(RUN) ?? [];
  return runs
    .map((run, i) => {
      if (SPACES.test(run)) return " ";
      if (DIGITS.test(run)) {
        const length = [...run].length;
        return length > MAX_DIGITS
          ? `${"9".repeat(MAX_DIGITS)}…`
          : "9".repeat(length);
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
 * Un nome (chiave, tag, attributo, valore di `class`…) si stampa com'è solo se ha la forma
 * attesa, nessuna sequenza di 3 o più cifre e nessuna parte che sia parola di un'identità.
 * Le parti sono le sequenze di lettere, spezzate anche tra minuscola e maiuscola: in
 * `marioRossi` il controllo finale, che cerca le parole tra confini di lettera, non vedrebbe
 * il nome.
 */
function isPlainName(name: string, shape: RegExp, ctx: ShapeContext): boolean {
  if (!shape.test(name) || /\d{3}/.test(name)) return false;
  return !name
    .split(/[^\p{L}]+|(?<=\p{Ll})(?=\p{Lu})/u)
    .some((part) => ctx.identityWords.has(fold(part)));
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
    return { head: `numero ${maskText(String(value), ctx.vocab)}`, body: [] };
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
      const plain = isPlainName(key, KEY, ctx);
      const name = plain ? key : `«${maskText(key, ctx.vocab)}»`;
      const { head, body } = jsonBlock(item, ctx);
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

function attributeText(name: string, value: string, ctx: ShapeContext): string {
  const plain = isPlainName(name, ATTRIBUTE, ctx);
  const shown = plain ? name : `«${maskText(name, ctx.vocab)}»`;
  if (value === "") return shown;
  // Tutti gli altri valori, compresi href, src, action e data-*, sono mascherati.
  const keep =
    plain &&
    NAMING_ATTRIBUTES.has(name.toLowerCase()) &&
    isPlainName(value, NAMING_VALUE, ctx);
  return `${shown}=${keep ? value : `«${maskText(value, ctx.vocab)}»`}`;
}

function elementLine(element: HTMLElement, ctx: ShapeContext): string {
  const tag = element.rawTagName.toLowerCase();
  const shown = isPlainName(tag, TAG, ctx)
    ? tag
    : `«${maskText(tag, ctx.vocab)}»`;
  const attributes = Object.entries(element.attributes).map(([name, value]) =>
    attributeText(name, value, ctx),
  );
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
  for (const node of nodes) {
    const own = nodeLines(node, ctx);
    if (own.length === 0) continue;
    const text = own.join("\n");
    if (text === previous) {
      if (!lines[first]?.endsWith(" (ripetuto)")) lines[first] += " (ripetuto)";
      continue;
    }
    previous = text;
    first = lines.length;
    lines.push(...own);
  }
  return lines;
}

/** La forma di una pagina HTML: un elemento per riga, indentato di 2 spazi per livello. */
export function shapeOfHtml(html: string, ctx: ShapeContext): string[] {
  // Con le opzioni predefinite i commenti non entrano nell'albero.
  return childLines(parse(html).childNodes, ctx);
}
