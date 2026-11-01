/**
 * Tracciamento del login Mywellness (issue #52), da eseguire sul computer dell'utente.
 * Registra solo origini, percorsi con gli id mascherati, status, nomi dei campi dei form e
 * segni di captcha o JavaScript: mai query, valori, cookie, token o credenziali.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/index";

const ID_SEGMENT =
  /\d{3}|@|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[\w-]{24,}$/i;

/**
 * Origine e percorso con gli id mascherati; niente credenziali, query né frammento. `mask`:
 * parole (es. la parte locale dell'e-mail) che rendono un segmento un id.
 */
export function describeUrl(url: URL, mask: string[] = []): string {
  const path = url.pathname
    .split("/")
    .map((segment) => {
      const [head = "", ...params] = segment.split(";");
      const lower = decodeURIComponentSafe(head).toLowerCase();
      const masked =
        ID_SEGMENT.test(head) ||
        mask.some((word) => lower.includes(word.toLowerCase()))
          ? "<id>"
          : head;
      return params.length > 0 ? `${masked};<param>` : masked;
    })
    .join("/");
  return `${url.protocol}//${url.host}${path}`;
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export type FormField = { name: string; type: string };
export type FormReport = {
  method: string;
  action: string;
  fields: FormField[];
};
export type PageReport = {
  forms: FormReport[];
  captcha: string[];
  scripts: number;
  noscript: boolean;
  loginLinks: string[];
};

const FORM_PATTERN = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
const FIELD_PATTERN = /<(input|button|select|textarea)\b([^>]*)>/gi;
const LINK_PATTERN = /<a\b[^>]*\shref\s*=\s*["']([^"']*)["']/gi;
// Link verso pagine di accesso o verso il portale Mywellness (/cloud).
const LOGIN_LINK = /login|signin|sign-in|account|auth|\/cloud/i;
const CAPTCHA_MARKERS: [string, RegExp][] = [
  ["recaptcha", /g-recaptcha|recaptcha\/api|grecaptcha/i],
  ["hcaptcha", /hcaptcha/i],
  ["turnstile", /cf-turnstile|challenges\.cloudflare\.com/i],
  ["arkose", /arkoselabs|funcaptcha/i],
  ["friendlycaptcha", /friendlycaptcha|frc-captcha/i],
];

/** Valore di un attributo HTML (solo per nomi, tipi, metodi e URL: mai stampato da solo). */
function attribute(attrs: string, name: string): string | undefined {
  const match = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  ).exec(attrs);
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3]);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

/** Entità HTML di un valore d'attributo, come le decodifica il browser. */
function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? entity;
      const point =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isSafeInteger(point) && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    },
  );
}

/** Form con i valori: solo per comporre il POST, mai per il rapporto. */
type ParsedForm = {
  method: string;
  action: URL;
  fields: (FormField & { value: string })[];
};

function parseForms(html: string, base: URL): ParsedForm[] {
  const forms: ParsedForm[] = [];
  for (const [, attrs = "", body = ""] of html.matchAll(FORM_PATTERN)) {
    const fields: ParsedForm["fields"] = [];
    for (const [, tag = "", fieldAttrs = ""] of body.matchAll(FIELD_PATTERN)) {
      const name = attribute(fieldAttrs, "name");
      if (name === undefined) continue;
      const type =
        tag.toLowerCase() === "input"
          ? (attribute(fieldAttrs, "type") ?? "text").toLowerCase()
          : tag.toLowerCase() === "button"
            ? (attribute(fieldAttrs, "type") ?? "submit").toLowerCase()
            : tag.toLowerCase();
      const value = decodeEntities(attribute(fieldAttrs, "value") ?? "");
      fields.push({ name: decodeEntities(name), type, value });
    }
    const action =
      URL.parse(decodeEntities(attribute(attrs, "action") ?? ""), base.href) ??
      base;
    forms.push({
      method: (attribute(attrs, "method") ?? "GET").toUpperCase(),
      action,
      fields,
    });
  }
  return forms;
}

/** Pagina HTML ridotta a ciò che serve per capire il login, senza alcun valore. */
export function analyzePage(
  html: string,
  base: URL,
  mask: string[] = [],
): PageReport {
  const forms: FormReport[] = parseForms(html, base).map((form) => ({
    method: form.method,
    action: describeUrl(form.action, mask),
    fields: form.fields.map(({ name, type }) => ({ name, type })),
  }));
  const loginLinks = new Set<string>();
  for (const [, href = ""] of html.matchAll(LINK_PATTERN)) {
    const url = URL.parse(decodeEntities(href), base.href);
    if (url !== null && LOGIN_LINK.test(url.host + url.pathname)) {
      loginLinks.add(describeUrl(url, mask));
    }
  }
  return {
    forms,
    captcha: CAPTCHA_MARKERS.filter(([, marker]) => marker.test(html)).map(
      ([name]) => name,
    ),
    scripts: (html.match(/<script\b/gi) ?? []).length,
    noscript: /<noscript\b/i.test(html),
    loginLinks: [...loginLinks],
  };
}

// Stesso User-Agent del client della sync: il tracciamento vede ciò che vedrà la sync.
const USER_AGENT = `palestra-sync/${VERSION}`;
const DEFAULT_HOSTS = [
  "www.mywellness.com",
  "services.mywellness.com",
  "www.technogym.com",
];
const DEFAULT_STARTS = [
  "https://www.mywellness.com/cloud/User/Login",
  "https://www.mywellness.com/",
];
const MAX_HOPS = 10;
const REQUEST_TIMEOUT_MS = 30_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type TraceOptions = {
  /** Con le credenziali il tracciamento prova anche il login. */
  login?: { email: string; password: string };
  allowHosts?: string[];
  starts?: URL[];
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
};

export type Secret = { kind: string; value: string };

/** Righe del rapporto e valori visti che non devono mai comparirvi. */
export type TraceResult = { lines: string[]; secrets: Secret[] };

type FinalPage = { url: URL; status: number; html: string | undefined };

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

class Tracer {
  readonly lines: string[] = [];
  readonly secrets: Secret[] = [];
  readonly #hosts: Set<string>;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #minIntervalMs: number;
  readonly #mask: string[];
  // Cookie separati per origine: tornano solo all'origine che li ha impostati.
  readonly #cookies = new Map<string, Map<string, string>>();
  #lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(opts: TraceOptions) {
    this.#hosts = new Set([...DEFAULT_HOSTS, ...(opts.allowHosts ?? [])]);
    this.#fetch = opts.fetch ?? fetch;
    this.#sleep = opts.sleep ?? defaultSleep;
    this.#minIntervalMs = opts.minIntervalMs ?? 1000;
    const local = opts.login?.email.split("@")[0] ?? "";
    this.#mask = local.length >= 3 ? [local] : [];
  }

  describe(url: URL): string {
    return describeUrl(url, this.#mask);
  }

  /**
   * Segue i redirect da `start` (con POST solo la prima richiesta); si ferma su host fuori
   * elenco, non HTTPS, o su un 307/308 dopo un POST: il form non viene mai reinviato.
   */
  async follow(
    start: URL,
    post?: URLSearchParams,
  ): Promise<FinalPage | undefined> {
    let url = start;
    let body = post;
    for (let hop = 1; hop <= MAX_HOPS; hop++) {
      if (!this.#allowed(url)) return undefined;
      const method = body === undefined ? "GET" : "POST";
      const response = await this.#exchange(url, method, body);
      if (response === undefined) {
        this.lines.push(
          `  ${hop}. ${method} ${this.describe(url)} → errore di rete`,
        );
        return undefined;
      }
      const cookies = this.#storeCookies(url, response);
      const location = response.headers.get("location");
      if (REDIRECT_STATUSES.has(response.status) && location !== null) {
        void response.body?.cancel().catch(() => undefined);
        const next = URL.parse(location, url.href);
        this.lines.push(
          `  ${hop}. ${method} ${this.describe(url)} → ${response.status}, cookie impostati ${cookies}, ${next === null ? "destinazione non valida" : `verso ${this.describe(next)}`}`,
        );
        if (next === null) return undefined;
        if (body !== undefined && response.status >= 307) {
          this.lines.push(
            `  Fermo: ${response.status} dopo il POST, il form non viene reinviato`,
          );
          return undefined;
        }
        body = undefined;
        url = next;
        continue;
      }
      const type = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase();
      const text = await response.text().catch(() => undefined);
      this.lines.push(
        `  ${hop}. ${method} ${this.describe(url)} → ${response.status} ${type || "senza tipo"}, cookie impostati ${cookies}`,
      );
      const html = type === "text/html" ? text : undefined;
      if (html !== undefined)
        this.#describePage(analyzePage(html, url, this.#mask));
      return { url, status: response.status, html };
    }
    this.lines.push(`  Fermo: più di ${MAX_HOPS} redirect`);
    return undefined;
  }

  /** Login con l'unico form con password trovato, poi verifica della sessione Mywellness. */
  async login(
    pages: FinalPage[],
    credentials: { email: string; password: string },
  ): Promise<void> {
    const candidates = pages.flatMap((page) =>
      page.status === 200 && page.html !== undefined
        ? parseForms(page.html, page.url).flatMap((form, index) =>
            form.fields.filter((field) => field.type === "password").length ===
            1
              ? [{ page, form, index: index + 1, html: page.html ?? "" }]
              : [],
          )
        : [],
    );
    const [candidate] = candidates;
    if (candidate === undefined || candidates.length > 1) {
      this.lines.push(
        `Login non eseguito: ${candidates.length} form con password (ne serve esattamente 1)`,
      );
      return;
    }
    const { page, form, index, html } = candidate;
    const captcha = analyzePage(html, page.url, this.#mask).captcha;
    if (captcha.length > 0) {
      this.lines.push(
        `Login non eseguito: captcha sulla pagina del form (${captcha.join(", ")})`,
      );
      return;
    }
    const users = form.fields.filter(
      (field) =>
        field.type === "email" ||
        (field.type === "text" && /user|email|login|mail/i.test(field.name)),
    );
    if (form.method !== "POST" || users.length !== 1) {
      this.lines.push(
        "Login non eseguito: il form non usa POST o il campo utente non è identificabile",
      );
      return;
    }
    const body = new URLSearchParams();
    let submit = false;
    for (const field of form.fields) {
      if (field.type === "hidden") {
        body.append(field.name, field.value);
        this.secrets.push({ kind: "campo nascosto", value: field.value });
      } else if (field === users[0]) {
        body.append(field.name, credentials.email);
      } else if (field.type === "password") {
        body.append(field.name, credentials.password);
      } else if (field.type === "submit" && !submit) {
        body.append(field.name, field.value);
        submit = true;
      }
    }
    this.lines.push(
      `Login: form ${index} di ${this.describe(page.url)} · campi inviati: ${[...body.keys()].join(", ")}`,
    );
    await this.follow(form.action, body);
    const training = new URL("https://www.mywellness.com/cloud/Training");
    this.lines.push(`Verifica: ${this.describe(training)}`);
    const result = await this.follow(training);
    if (result?.html !== undefined) {
      const user = /EU\.currentUser\s*=/.test(result.html);
      const loginForm = /type\s*=\s*["']?password/i.test(result.html);
      this.lines.push(
        `  Utente corrente: ${user ? "sì" : "no"} · form di login: ${loginForm ? "sì" : "no"}`,
      );
    }
  }

  #allowed(url: URL): boolean {
    if (url.protocol !== "https:") {
      this.lines.push(`  Fermo: ${url.protocol} non è HTTPS`);
      return false;
    }
    if (!this.#hosts.has(url.host)) {
      this.lines.push(
        `  Fermo: ${url.protocol}//${url.host} non è nell'elenco degli host (aggiungerlo con --allow-host solo dopo averlo verificato)`,
      );
      return false;
    }
    return true;
  }

  #describePage(page: PageReport): void {
    const withPassword = page.forms.filter((form) =>
      form.fields.some((field) => field.type === "password"),
    ).length;
    this.lines.push(
      `  Pagina: form ${page.forms.length} (con password ${withPassword}) · captcha: ${page.captcha.join(", ") || "nessuno"} · script ${page.scripts} · noscript: ${page.noscript ? "sì" : "no"}`,
    );
    page.forms.forEach((form, index) => {
      const fields =
        form.fields
          .map((field) => `${field.name} (${field.type})`)
          .join(", ") || "nessuno";
      this.lines.push(
        `  Form ${index + 1}: ${form.method} ${form.action} · campi: ${fields}`,
      );
    });
    if (page.loginLinks.length > 0) {
      this.lines.push(`  Link di accesso: ${page.loginLinks.join(", ")}`);
    }
  }

  async #exchange(
    url: URL,
    method: "GET" | "POST",
    body?: URLSearchParams,
  ): Promise<Response | undefined> {
    const wait = this.#lastRequestAt + this.#minIntervalMs - Date.now();
    if (wait > 0) await this.#sleep(wait);
    this.#lastRequestAt = Date.now();
    const headers = new Headers({ "User-Agent": USER_AGENT });
    const jar = this.#cookies.get(url.origin);
    if (jar !== undefined && jar.size > 0) {
      headers.set(
        "Cookie",
        [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    if (body !== undefined) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
    }
    try {
      return await this.#fetch(url.toString(), {
        method,
        headers,
        body: body?.toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return undefined;
    }
  }

  /** Salva i cookie della risposta per la sua origine; restituisce quanti sono. */
  #storeCookies(url: URL, response: Response): number {
    const headers = response.headers.getSetCookie();
    const jar = this.#cookies.get(url.origin) ?? new Map<string, string>();
    for (const header of headers) {
      const pair = header.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const value = pair.slice(separator + 1).trim();
      jar.set(pair.slice(0, separator).trim(), value);
      this.secrets.push({ kind: "cookie", value });
    }
    this.#cookies.set(url.origin, jar);
    return headers.length;
  }
}

/** Traccia le catene di login a partire dalle pagine d'ingresso di Mywellness. */
export async function traceLogin(
  opts: TraceOptions = {},
): Promise<TraceResult> {
  const tracer = new Tracer(opts);
  const starts = opts.starts ?? DEFAULT_STARTS.map((start) => new URL(start));
  const pages: FinalPage[] = [];
  for (const [index, start] of starts.entries()) {
    tracer.lines.push(`Catena ${index + 1}: ${tracer.describe(start)}`);
    const page = await tracer.follow(start);
    if (page !== undefined) pages.push(page);
  }
  if (opts.login !== undefined) {
    const { email, password } = opts.login;
    tracer.secrets.push(
      { kind: "e-mail", value: email },
      { kind: "parte locale dell'e-mail", value: email.split("@")[0] ?? "" },
      { kind: "password", value: password },
    );
    await tracer.login(pages, opts.login);
  }
  return { lines: tracer.lines, secrets: tracer.secrets };
}

// Sotto queste lunghezze un cookie o un campo nascosto (es. «true») darebbe falsi allarmi.
const MIN_LEAK_LENGTH: Record<string, number> = {
  cookie: 8,
  "campo nascosto": 8,
  "parte locale dell'e-mail": 3,
};

/**
 * Controllo finale che blocca: righe del rapporto che contengono un valore visto. Restituisce
 * solo «riga n: tipo», mai il valore.
 */
export function findLeaks(lines: string[], secrets: Secret[]): string[] {
  const leaks: string[] = [];
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    const kinds = new Set<string>();
    for (const { kind, value } of secrets) {
      if (value.length < (MIN_LEAK_LENGTH[kind] ?? 1)) continue;
      if (lower.includes(value.toLowerCase())) kinds.add(kind);
    }
    for (const kind of kinds) leaks.push(`riga ${index + 1}: ${kind}`);
  });
  return leaks;
}

const USAGE =
  "Uso: npx tsx scripts/trace-mywellness-login.ts [--login] [--allow-host HOST]... [--start URL_HTTPS]...";
const HOST_PATTERN = /^[a-z0-9.-]+(:\d+)?$/i;

export type MainDeps = {
  trace?: (opts: TraceOptions) => Promise<TraceResult>;
  out?: (line: string) => void;
  err?: (line: string) => void;
};

/** Argomenti → opzioni; `undefined` se non validi. */
function parseArgs(
  argv: string[],
): { login: boolean; allowHosts: string[]; starts: URL[] } | undefined {
  const parsed = {
    login: false,
    allowHosts: [] as string[],
    starts: [] as URL[],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--login") {
      parsed.login = true;
    } else if (arg === "--allow-host") {
      const host = argv[++i];
      if (host === undefined || !HOST_PATTERN.test(host)) return undefined;
      parsed.allowHosts.push(host.toLowerCase());
    } else if (arg === "--start") {
      const start = URL.parse(argv[++i] ?? "");
      if (start === null || start.protocol !== "https:") return undefined;
      parsed.starts.push(start);
    } else {
      return undefined;
    }
  }
  return parsed;
}

/**
 * Exit code: 0 rapporto stampato, 64 argomenti errati, 65 rapporto bloccato dal controllo
 * finale, 78 credenziali mancanti con `--login`.
 */
export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: MainDeps = {},
): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const args = parseArgs(argv);
  if (args === undefined) {
    err(USAGE);
    return 64;
  }
  const opts: TraceOptions = {};
  if (args.login) {
    const missing = ["MYWELLNESS_EMAIL", "MYWELLNESS_PASSWORD"].filter(
      (name) => !env[name],
    );
    if (missing.length > 0) {
      err(`Variabili d'ambiente mancanti: ${missing.join(", ")}`);
      return 78;
    }
    opts.login = {
      email: env.MYWELLNESS_EMAIL ?? "",
      password: env.MYWELLNESS_PASSWORD ?? "",
    };
  }
  if (args.allowHosts.length > 0) opts.allowHosts = args.allowHosts;
  if (args.starts.length > 0) opts.starts = args.starts;
  const result = await (deps.trace ?? traceLogin)(opts);
  const leaks = findLeaks(result.lines, result.secrets);
  if (leaks.length > 0) {
    err("Rapporto non stampato: contiene valori da non pubblicare");
    for (const leak of leaks) err(leak);
    return 65;
  }
  for (const line of result.lines) out(line);
  out(
    "Fine: nel rapporto non ci sono query, cookie, token né valori dei campi.",
  );
  return 0;
}

// Solo se eseguito come script, non quando un test importa il modulo.
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
