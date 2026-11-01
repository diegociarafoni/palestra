/**
 * Tracciamento anonimo del login Mywellness (issue #52), da eseguire sul computer dell'utente.
 * Nessuna credenziale: registra solo origini, percorsi con gli id mascherati, status, nomi e
 * tipi dei campi dei form e segni di protezioni anti-bot. Mai query, valori, cookie o token.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type HTMLElement, parse } from "node-html-parser";
import { VERSION } from "../src/index";

// Un segmento resta in chiaro solo se sembra una parola: lettere, «-», «_», al più due cifre e
// poche maiuscole interne. Tutto il resto (id, token, base64, JWT, e-mail) diventa <id>.
const WORD = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_DIGITS = 2;
const MAX_CASE_CHANGES = 4;
// Tipico dei token, raro nelle parole: «XoN» (una minuscola fra maiuscole) o «N5j».
const TOKEN_HINT = /[A-Z][a-z][A-Z]|[A-Za-z]\d[A-Za-z]/;

function isWord(text: string): boolean {
  return (
    WORD.test(text) &&
    (text.match(/\d/g) ?? []).length <= MAX_DIGITS &&
    !TOKEN_HINT.test(text) &&
    (text.match(/[a-z][A-Z]/g) ?? []).length <= MAX_CASE_CHANGES
  );
}

/** Segmento di percorso: una parola, con al più un'estensione di sole lettere. */
function describeSegment(segment: string): string {
  const [head = "", ...params] = segment.split(";");
  const dot = head.lastIndexOf(".");
  const word =
    head === "" ||
    isWord(head) ||
    (dot > 0 &&
      isWord(head.slice(0, dot)) &&
      /^[A-Za-z]{1,5}$/.test(head.slice(dot + 1)));
  return `${word ? head : "<id>"}${params.length > 0 ? ";<param>" : ""}`;
}

/** Origine e percorso con gli id mascherati; mai credenziali, query né frammento. */
export function describeUrl(url: URL): string {
  const path = url.pathname.split("/").map(describeSegment).join("/");
  return `${url.protocol}//${url.host}${path}`;
}

/** Nome di un campo o di un cookie, con le parti che sembrano token mascherate. */
export function describeName(name: string): string {
  return name
    .split(/([.$:[\]])/)
    .map((part, index) =>
      index % 2 === 1 || part === "" || isWord(part) ? part : "<id>",
    )
    .join("");
}

/** Destinazione: origine e percorso mascherato, o solo lo schema se non è http(s). */
export function describeTarget(url: URL): string {
  return url.protocol === "https:" || url.protocol === "http:"
    ? describeUrl(url)
    : `schema ${url.protocol} non ammesso`;
}

/** Valori della query e del frammento: non vanno mai stampati. */
function urlSecrets(url: URL): string[] {
  return [...url.searchParams.values(), url.hash.slice(1)];
}

export type FieldReport = { name: string; type: string; disabled: boolean };
export type FormReport = {
  method: string;
  action: string;
  fields: FieldReport[];
  warnings: string[];
};
export type PageReport = {
  forms: FormReport[];
  warnings: string[];
  protection: string[];
  scripts: number;
  noscript: boolean;
  scriptRedirect: boolean;
  csrfMeta: string[];
  refresh: string | undefined;
  loginLinks: string[];
};

// Segni nell'HTML di captcha e sfide anti-bot: se ce n'è uno il login via HTTP non si tenta.
const BODY_PROTECTIONS: [string, RegExp][] = [
  ["reCAPTCHA", /recaptcha/i],
  ["hCaptcha", /hcaptcha/i],
  [
    "Cloudflare Turnstile",
    /cf-turnstile|challenges\.cloudflare\.com\/turnstile/i,
  ],
  ["sfida Cloudflare", /_cf_chl_opt|\/cdn-cgi\/challenge-platform/i],
  ["DataDome", /captcha-delivery\.com|datadome/i],
  ["PerimeterX", /px-captcha|perimeterx|_pxAppId/i],
  ["Imperva", /_Incapsula_Resource|incapsula/i],
  ["AWS WAF", /awswaf|aws-waf-token/i],
  ["Akamai", /\/_sec\/cp_challenge|ak-challenge|bm-verify/i],
  ["Arkose", /arkoselabs|funcaptcha/i],
  ["Friendly Captcha", /friendlycaptcha|frc-captcha/i],
];
const ANY_CAPTCHA = /captcha/i;
// Link verso pagine di accesso o verso il portale Mywellness (/cloud).
const LOGIN_LINK = /login|signin|sign-in|account|auth|\/cloud/i;
const MAX_LINKS = 10;
const CSRF_META = /csrf|xsrf|token/i;
const SCRIPT_REDIRECT = /\blocation\s*(?:\.\s*(?:href|replace|assign)\b|=[^=])/;
const METHODS = new Set(["GET", "POST", "DIALOG"]);
const FIELDS = "input, button, select, textarea";

function fieldType(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  if (tag === "select" || tag === "textarea") return tag;
  const type = (
    element.getAttribute("type") ?? (tag === "button" ? "submit" : "text")
  ).toLowerCase();
  return /^[a-z-]{1,20}$/.test(type) ? type : "<tipo>";
}

/**
 * Pagina HTML ridotta a ciò che serve per capire il login: form risolti come nel browser
 * (`<base href>`, action assente), protezioni, meta anti-CSRF e refresh, link di accesso.
 * `secrets`: valori visti (campi, meta, query) che il rapporto non deve mai contenere.
 */
export function analyzePage(
  html: string,
  url: URL,
): { report: PageReport; secrets: string[] } {
  // Commenti e script restano testo; i <template> non sono parte della pagina.
  const root = parse(html, { comment: false });
  for (const template of root.querySelectorAll("template")) template.remove();
  const secrets: string[] = [];
  const warnings: string[] = [];

  const baseHref = root.querySelector("base[href]")?.getAttribute("href");
  if (baseHref !== undefined) warnings.push("<base href> presente");
  const base =
    (baseHref === undefined ? null : URL.parse(baseHref, url.href)) ?? url;
  const resolve = (href: string): URL | null => {
    const target = URL.parse(href, base.href);
    if (target !== null) secrets.push(...urlSecrets(target));
    return target;
  };

  for (const element of root.querySelectorAll(`${FIELDS}, option`)) {
    const value = element.getAttribute("value");
    if (value) secrets.push(value);
  }
  if (
    root.querySelectorAll(FIELDS).some((field) => field.hasAttribute("form"))
  ) {
    warnings.push("campi fuori dai form (attributo form)");
  }

  const forms = root.querySelectorAll("form").map((form): FormReport => {
    const method = (form.getAttribute("method") ?? "GET").toUpperCase();
    const action = form.getAttribute("action") ?? "";
    const target = action === "" ? undefined : resolve(action);
    const controls = form.querySelectorAll(FIELDS);
    return {
      method: METHODS.has(method) ? method : "<metodo>",
      action:
        target === undefined
          ? "la pagina stessa"
          : target === null
            ? "action non valida"
            : describeTarget(target),
      fields: controls.flatMap((field) => {
        const name = field.getAttribute("name");
        return name
          ? [
              {
                name: describeName(name),
                type: fieldType(field),
                disabled: field.hasAttribute("disabled"),
              },
            ]
          : [];
      }),
      warnings: [
        ...(controls.some((c) => c.hasAttribute("formaction"))
          ? ["pulsante con formaction"]
          : []),
        ...(controls.some((c) => c.hasAttribute("formmethod"))
          ? ["pulsante con formmethod"]
          : []),
      ],
    };
  });

  const csrfMeta: string[] = [];
  let refresh: string | undefined;
  for (const meta of root.querySelectorAll("meta")) {
    const content = meta.getAttribute("content") ?? "";
    const name = meta.getAttribute("name") ?? "";
    const isRefresh =
      (meta.getAttribute("http-equiv") ?? "").toLowerCase() === "refresh";
    if (!isRefresh && !CSRF_META.test(name)) continue;
    if (content !== "") secrets.push(content);
    if (!isRefresh) {
      csrfMeta.push(describeName(name));
      continue;
    }
    // Senza «url=» il refresh ricarica la pagina stessa.
    const href = /url\s*=\s*['"]?([^'"\s]+)/i.exec(content)?.[1];
    const target = href === undefined ? undefined : resolve(href);
    refresh =
      target === undefined
        ? "la pagina stessa"
        : target === null
          ? "destinazione non valida"
          : describeTarget(target);
  }

  const loginLinks = new Set<string>();
  for (const link of root.querySelectorAll("a[href]")) {
    const target = resolve(link.getAttribute("href") ?? "");
    if (
      target !== null &&
      (target.protocol === "https:" || target.protocol === "http:") &&
      LOGIN_LINK.test(target.host + target.pathname)
    ) {
      loginLinks.add(describeUrl(target));
    }
  }
  const links = [...loginLinks];

  const scripts = root.querySelectorAll("script");
  const protection = BODY_PROTECTIONS.filter(([, marker]) =>
    marker.test(html),
  ).map(([name]) => name);
  if (protection.length === 0 && ANY_CAPTCHA.test(html)) {
    protection.push("captcha non identificato");
  }

  return {
    report: {
      forms,
      warnings,
      protection,
      scripts: scripts.length,
      noscript: root.querySelector("noscript") !== null,
      scriptRedirect: scripts.some((script) =>
        SCRIPT_REDIRECT.test(script.text),
      ),
      csrfMeta,
      refresh,
      loginLinks:
        links.length > MAX_LINKS
          ? [
              ...links.slice(0, MAX_LINKS),
              `(altri ${links.length - MAX_LINKS})`,
            ]
          : links,
    },
    secrets: secrets.filter((secret) => secret !== ""),
  };
}

// Stesso User-Agent del client della sync: il tracciamento vede ciò che vedrà la sync.
const USER_AGENT = `palestra-sync/${VERSION}`;
// Solo gli host osservati: l'avvio della sync e il redirect riportato nella issue #52.
const HOSTS = ["www.mywellness.com", "www.technogym.com"];
const DEFAULT_START = "https://www.mywellness.com/cloud/User/Login";
const MAX_REDIRECTS = 10;
const REQUEST_TIMEOUT_MS = 30_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCK_STATUSES = new Set([403, 429, 503]);

export type TraceOptions = {
  /** Host in più, già verificati (opzione `--allow-host`). */
  hosts?: string[];
  starts?: URL[];
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
};

/** Righe del rapporto, valori visti da oscurare, e se una richiesta è fallita in rete. */
export type TraceResult = {
  lines: string[];
  secrets: string[];
  networkError: boolean;
};

/** Protezioni anti-bot riconoscibili dalle intestazioni della risposta. */
function headerProtection(status: number, headers: Headers): string[] {
  const found: string[] = [];
  if (headers.has("cf-mitigated"))
    found.push("sfida Cloudflare (cf-mitigated)");
  if (headers.has("x-datadome")) found.push("DataDome");
  if (headers.has("x-amzn-waf-action")) found.push("AWS WAF");
  if (headers.has("x-iinfo")) found.push("Imperva");
  const server = headers.get("server") ?? "";
  if (BLOCK_STATUSES.has(status) && /^cloudflare$/i.test(server)) {
    found.push("blocco Cloudflare");
  }
  if (BLOCK_STATUSES.has(status) && /^akamai/i.test(server)) {
    found.push("blocco Akamai");
  }
  // Pagina «Request blocked» di CloudFront: di solito una regola AWS WAF.
  if (BLOCK_STATUSES.has(status) && /^cloudfront$/i.test(server)) {
    found.push("blocco CloudFront (AWS WAF)");
  }
  return found;
}

/** Nome dell'errore di rete e, se c'è, il codice di sistema: mai il messaggio. */
function describeNetworkError(error: unknown): string {
  const name =
    error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name)
      ? error.name
      : "errore";
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? cause.code
      : undefined;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)
    ? `${name}, ${code}`
    : name;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, ms));

class Tracer {
  readonly lines: string[] = [];
  readonly secrets: string[] = [];
  networkError = false;
  readonly #hosts: Set<string>;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #minIntervalMs: number;
  // Cookie separati per origine: tornano solo all'origine che li ha impostati.
  readonly #cookies = new Map<string, Map<string, string>>();
  #lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(opts: TraceOptions) {
    this.#hosts = new Set([...HOSTS, ...(opts.hosts ?? [])]);
    this.#fetch = opts.fetch ?? fetch;
    this.#sleep = opts.sleep ?? defaultSleep;
    this.#minIntervalMs = opts.minIntervalMs ?? 1000;
  }

  /** Segue i redirect da `start` con sole GET; si ferma prima di un host fuori elenco. */
  async follow(start: URL): Promise<void> {
    let url = start;
    for (let hop = 1; hop <= MAX_REDIRECTS + 1; hop++) {
      if (!this.#allowed(url)) return;
      if (hop > MAX_REDIRECTS) {
        this.lines.push(`  Fermo: più di ${MAX_REDIRECTS} redirect`);
        return;
      }
      const step = `  ${hop}. GET ${describeUrl(url)} →`;
      let response: Response;
      try {
        response = await this.#get(url);
      } catch (error) {
        this.networkError = true;
        this.lines.push(
          `${step} errore di rete (${describeNetworkError(error)})`,
        );
        return;
      }
      const cookies = this.#storeCookies(url, response);
      const location = response.headers.get("location");
      if (REDIRECT_STATUSES.has(response.status) && location !== null) {
        await response.body?.cancel().catch(() => undefined);
        const next = URL.parse(location, url.href);
        if (next === null) {
          this.lines.push(
            `${step} ${response.status} · cookie: ${cookies} · destinazione non valida`,
          );
          return;
        }
        this.secrets.push(...urlSecrets(next));
        this.lines.push(
          `${step} ${response.status} · cookie: ${cookies} · verso ${describeTarget(next)}`,
        );
        url = next;
        continue;
      }
      const type = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase();
      const text = await response.text().catch(() => "");
      this.lines.push(
        `${step} ${response.status} ${type ? (/^[a-z]+\/[a-z0-9.+-]+$/.test(type) ? type : "<tipo>") : "senza tipo"} · cookie: ${cookies}`,
      );
      const page = type === "text/html" ? analyzePage(text, url) : undefined;
      const protection = [
        ...headerProtection(response.status, response.headers),
        ...(page?.report.protection ?? []),
      ];
      this.lines.push(
        `  Protezione: ${protection.join(", ") || "nessun segno"}`,
      );
      if (page !== undefined) {
        this.secrets.push(...page.secrets);
        this.#describePage(page.report);
      }
      return;
    }
  }

  #allowed(url: URL): boolean {
    if (url.protocol !== "https:") {
      this.lines.push(`  Fermo: ${url.protocol} non è HTTPS`);
      return false;
    }
    if (url.username !== "" || url.password !== "") {
      this.lines.push("  Fermo: l'URL contiene credenziali");
      return false;
    }
    if (!this.#hosts.has(url.host)) {
      this.lines.push(
        `  Fermo: https://${url.host} non è nell'elenco degli host`,
      );
      return false;
    }
    return true;
  }

  #describePage(page: PageReport): void {
    const yesNo = (flag: boolean) => (flag ? "sì" : "no");
    this.lines.push(
      `  Pagina: form ${page.forms.length} · script ${page.scripts} · noscript: ${yesNo(page.noscript)} · redirect da script: ${yesNo(page.scriptRedirect)}`,
    );
    if (page.warnings.length > 0) {
      this.lines.push(`  Avvisi: ${page.warnings.join(", ")}`);
    }
    if (page.csrfMeta.length > 0) {
      this.lines.push(`  Meta anti-CSRF: ${page.csrfMeta.join(", ")}`);
    }
    if (page.refresh !== undefined) {
      this.lines.push(`  Meta refresh: verso ${page.refresh}`);
    }
    page.forms.forEach((form, index) => {
      const fields =
        form.fields
          .map(
            (field) =>
              `${field.name} (${field.type}${field.disabled ? ", disabilitato" : ""})`,
          )
          .join(", ") || "nessuno";
      const warnings =
        form.warnings.length > 0
          ? ` · avvisi: ${form.warnings.join(", ")}`
          : "";
      this.lines.push(
        `  Form ${index + 1}: ${form.method} ${form.action} · campi: ${fields}${warnings}`,
      );
    });
    if (page.loginLinks.length > 0) {
      this.lines.push(`  Link di accesso: ${page.loginLinks.join(", ")}`);
    }
  }

  async #get(url: URL): Promise<Response> {
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
    return await this.#fetch(url.href, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** Salva i cookie della risposta per la sua origine; restituisce i nomi mascherati. */
  #storeCookies(url: URL, response: Response): string {
    const jar = this.#cookies.get(url.origin) ?? new Map<string, string>();
    const names: string[] = [];
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      jar.set(name, value);
      this.secrets.push(value);
      names.push(describeName(name));
    }
    this.#cookies.set(url.origin, jar);
    return names.join(", ") || "nessuno";
  }
}

/** Traccia la catena di login a partire dalla pagina d'ingresso di Mywellness. */
export async function traceLogin(
  opts: TraceOptions = {},
): Promise<TraceResult> {
  const tracer = new Tracer(opts);
  const starts = opts.starts ?? [new URL(DEFAULT_START)];
  for (const [index, start] of starts.entries()) {
    tracer.lines.push(`Catena ${index + 1}: ${describeUrl(start)}`);
    tracer.secrets.push(...urlSecrets(start));
    await tracer.follow(start);
  }
  return {
    lines: tracer.lines,
    secrets: tracer.secrets.filter((secret) => secret !== ""),
    networkError: tracer.networkError,
  };
}

// Sotto questa lunghezza un valore (es. «true», «it») darebbe falsi positivi.
const MIN_SECRET_LENGTH = 8;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rete di sicurezza: sostituisce con <REDACTED> ogni valore visto (anche codificato per URL)
 * finito nel rapporto. Restituisce le righe e quante sostituzioni ha fatto, mai quali.
 */
export function redact(
  lines: string[],
  secrets: string[],
): { lines: string[]; count: number } {
  const variants = [
    ...new Set(
      secrets
        .filter((secret) => secret.length >= MIN_SECRET_LENGTH)
        .flatMap((secret) => [secret, encodeURIComponent(secret)]),
    ),
  ].sort((a, b) => b.length - a.length);
  if (variants.length === 0) return { lines, count: 0 };
  const pattern = new RegExp(variants.map(escapeRegExp).join("|"), "gi");
  let count = 0;
  return {
    lines: lines.map((line) =>
      line.replace(pattern, () => {
        count++;
        return "<REDACTED>";
      }),
    ),
    count,
  };
}

const USAGE =
  "Uso: npx tsx scripts/trace-mywellness-login.ts [--allow-host HOST.technogym.com|HOST.mywellness.com]... [--start URL_HTTPS]...";
// Solo sottodomini dei due domini del flusso: niente host arbitrari per errore di battitura.
const EXTRA_HOST = /^(?:[a-z0-9-]+\.)+(?:technogym|mywellness)\.com$/;

export type MainDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  out?: (line: string) => void;
  err?: (line: string) => void;
};

/** Argomenti → host in più e partenze; `undefined` se non validi. */
function parseArgs(
  argv: string[],
): { hosts: string[]; starts: URL[] } | undefined {
  const hosts: string[] = [];
  const starts: URL[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[++i];
    if (arg === "--allow-host" && value !== undefined) {
      if (!EXTRA_HOST.test(value.toLowerCase())) return undefined;
      hosts.push(value.toLowerCase());
    } else if (arg === "--start" && value !== undefined) {
      const start = URL.parse(value);
      if (start === null) return undefined;
      starts.push(start);
    } else {
      return undefined;
    }
  }
  const allowed = new Set([...HOSTS, ...hosts]);
  const valid = starts.every(
    (start) =>
      start.protocol === "https:" &&
      allowed.has(start.host) &&
      start.username === "" &&
      start.password === "",
  );
  return valid ? { hosts, starts } : undefined;
}

/**
 * Exit code (docs/buone-pratiche.md § 8): 0 rapporto stampato, 64 argomenti errati,
 * 69 errore di rete (il rapporto fin lì viene stampato comunque).
 */
export async function main(
  argv: string[],
  deps: MainDeps = {},
): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const args = parseArgs(argv);
  if (args === undefined) {
    err(USAGE);
    return 64;
  }
  const opts: TraceOptions = { hosts: args.hosts };
  if (args.starts.length > 0) opts.starts = args.starts;
  if (deps.fetch !== undefined) opts.fetch = deps.fetch;
  if (deps.sleep !== undefined) opts.sleep = deps.sleep;
  const result = await traceLogin(opts);
  const { lines, count } = redact(result.lines, result.secrets);
  for (const line of lines) out(line);
  if (count > 0) out(`Valori oscurati: ${count}`);
  out(
    "Fine: nel rapporto ci sono solo origini, percorsi con gli id mascherati, status, nomi e tipi; nessuna query, cookie, token o valore.",
  );
  return result.networkError ? 69 : 0;
}

// Solo se eseguito come script, non quando un test importa il modulo.
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    // Mai il messaggio né lo stack: potrebbero contenere un URL completo.
    console.error(
      `Errore inatteso: ${error instanceof Error ? error.name : "sconosciuto"}`,
    );
    process.exitCode = 70;
  }
}
