import { z } from "zod";
import { romeDate } from "../domain/dates";
import {
  AuthError,
  ParseError,
  SyncError,
  TransientError,
  UpstreamError,
} from "../errors";
import { VERSION } from "../index";

// Costante pubblica dell'app web, inviata come parametro `AppId` ai servizi.
const APP_ID = "ec1d38d7-d359-48d0-a60c-d8c0b8fb9df9";
const USER_AGENT = `palestra-sync/${VERSION}`;
const LOGIN_FAILED = "Login Mywellness fallito";
const RETRY_DELAYS_MS = [2000, 4000];
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 14;

// La pagina Training contiene `EU.currentUser = JSON.parse('<stringa JS>')`.
const CURRENT_USER_PATTERN =
  /EU\.currentUser\s*=\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/;
const INPUT_TAG_PATTERN = /<input\b[^>]*>/gi;
const SESSION_INPUT_PATTERN = /\sname\s*=\s*["']hdSessionIdCR["']/i;
const VALUE_PATTERN = /\svalue\s*=\s*["']([^"']*)["']/i;
const LOGIN_FORM_PATTERN = /\sname\s*=\s*["']UserBinder\.Password["']/i;

// Il payload contiene anche dati personali: zod tiene solo questi campi.
const CurrentUserSchema = z.object({
  id: z.string().min(1),
  // ASCII stampabile, senza spazi: il token va in un URL e nel comando `::add-mask::`.
  token: z.string().regex(/^[\x21-\x7e]+$/),
  culture: z.string().min(1).default("en-GB"),
});
type CurrentUser = z.infer<typeof CurrentUserSchema>;

const SessionIdsSchema = z.array(z.string().regex(/^\d+$/));

/** Passo della sync, citato negli errori di redirect. */
type Step = "login" | "elenco" | "dettaglio";

export type MywellnessClientOptions = {
  email: string;
  password: string;
  baseUrl?: string;
  servicesUrl?: string;
  minIntervalMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Data di oggi (`YYYY-MM-DD`, Europe/Rome). */
  today?: () => string;
};

/**
 * Payload di `EU.currentUser` di una pagina Training, decodificato ma non validato;
 * `undefined` se la pagina non lo contiene. Contiene dati personali: mai stamparlo.
 * Lo usano anche il probe e il rapporto della forma (scripts/).
 */
export function readCurrentUser(page: string): unknown {
  const literal = CURRENT_USER_PATTERN.exec(page)?.[1];
  if (literal === undefined) return undefined;
  try {
    // Stringa JS tra apici singoli → stringa JSON (`"` escapato o no) → oggetto.
    const json = literal.replace(/\\.|"/g, (token) =>
      token === '"' ? '\\"' : token === "\\'" ? "'" : token,
    );
    return JSON.parse(JSON.parse(`"${json}"`));
  } catch {
    // Niente cause: il SyntaxError cita il payload, che contiene dati personali.
    throw new ParseError("Mywellness: utente corrente non interpretabile");
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Data di calendario `YYYY-MM-DD` come istante UTC a mezzanotte. */
function parseDay(day: string): Date {
  const date = new Date(`${day}T00:00:00Z`);
  if (
    !DAY_PATTERN.test(day) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  ) {
    throw new SyncError("Mywellness: data non valida (atteso AAAA-MM-GG)");
  }
  return date;
}

/** `DD/MM/YYYY`, il formato dei parametri dell'elenco sedute. */
function formatQueryDay(date: Date): string {
  const [year, month, day] = date.toISOString().slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** Intervalli `[inizio, fine]` dell'intervallo dato, uno per mese di calendario. */
function monthRanges(since: Date, until: Date): [Date, Date][] {
  const ranges: [Date, Date][] = [];
  let start = since;
  while (start <= until) {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    ranges.push([start, monthEnd < until ? monthEnd : until]);
    start = new Date(Date.UTC(year, month + 1, 1));
  }
  return ranges;
}

// Libera la connessione di una risposta di cui non si legge il corpo.
function discard(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

// Leggere il corpo è ancora rete (connessione interrotta, timeout): errore transitorio.
// Niente cause, come per gli errori di rete in `#exchange`.
async function readText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    throw new TransientError("Mywellness: lettura della risposta non riuscita");
  }
}

/**
 * Client dell'API privata di Mywellness (docs/mywellness-api.md § 2): un login per
 * esecuzione, cookie gestiti a mano, almeno `minIntervalMs` tra due richieste.
 * Le chiamate vanno fatte in sequenza. Nessun log: credenziali, token e corpi delle
 * risposte non escono mai dal client.
 */
export class MywellnessClient {
  readonly #email: string;
  readonly #password: string;
  readonly #site: URL;
  readonly #services: URL;
  readonly #minIntervalMs: number;
  readonly #fetch: typeof fetch | undefined;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #today: () => string;
  readonly #cookies = new Map<string, string>();
  #lastRequestAt = Number.NEGATIVE_INFINITY;
  #user: CurrentUser | undefined;

  constructor(opts: MywellnessClientOptions) {
    this.#email = opts.email;
    this.#password = opts.password;
    this.#site = new URL(opts.baseUrl ?? "https://www.mywellness.com");
    this.#services = new URL(
      opts.servicesUrl ?? "https://services.mywellness.com",
    );
    this.#minIntervalMs = opts.minIntervalMs ?? 1000;
    this.#fetch = opts.fetch;
    this.#sleep = opts.sleep ?? defaultSleep;
    this.#today = opts.today ?? (() => romeDate(new Date().toISOString()));
  }

  async login(): Promise<void> {
    const form = new URLSearchParams([
      ["UserBinder.MifareId", ""],
      ["UserBinder.IsFromLogin", "True"],
      ["UserBinder.ForceJoinFacility", ""],
      ["UserBinder.Username", this.#email],
      ["UserBinder.Password", this.#password],
      ["UserBinder.KeepMeLogged", "true"],
    ]);
    let page: string;
    try {
      discard(await this.#request(this.#siteUrl("/cloud/User/Login"), "login"));
      discard(
        await this.#request(this.#siteUrl("/cloud/User/Login"), "login", {
          form,
        }),
      );
      page = await readText(
        await this.#request(this.#siteUrl("/cloud/Training"), "login"),
      );
    } catch (error) {
      // 401/403 in un passo qualunque del login: credenziali rifiutate.
      if (error instanceof AuthError) {
        throw new AuthError(LOGIN_FAILED, { cause: error });
      }
      throw error;
    }
    // Di nuovo il form di login: credenziali rifiutate.
    if (LOGIN_FORM_PATTERN.test(page)) throw new AuthError(LOGIN_FAILED);
    const payload = readCurrentUser(page);
    // Né utente né form: la pagina è cambiata.
    if (payload === undefined) {
      throw new ParseError("Mywellness: utente corrente assente");
    }
    const user = CurrentUserSchema.safeParse(payload);
    if (!user.success) {
      throw new ParseError("Mywellness: utente corrente inatteso", {
        cause: user.error,
      });
    }
    this.#user = user.data;
  }

  get userId(): string {
    return this.#requireUser().id;
  }

  /** Token di sessione: solo per mascherarlo nei log delle Actions (`::add-mask::`). */
  get token(): string {
    return this.#requireUser().token;
  }

  /**
   * Id delle sedute tra `since` e `until` (`YYYY-MM-DD`, inclusi), senza duplicati: mese per
   * mese da `since` a `until` e, in ogni mese, nell'ordine della pagina. Nessun ordinamento
   * per data: chi chiama riordina per `started_at`.
   */
  async listSessionIds(
    opts: { since?: string; until?: string } = {},
  ): Promise<string[]> {
    this.#requireUser();
    const until = parseDay(opts.until ?? this.#today());
    const since =
      opts.since === undefined
        ? new Date(until.getTime() - DEFAULT_RANGE_DAYS * DAY_MS)
        : parseDay(opts.since);
    if (since > until) {
      throw new SyncError(
        "Mywellness: intervallo di date non valido (since dopo until)",
      );
    }
    const ids = new Set<string>();
    for (const [from, to] of monthRanges(since, until)) {
      const url = this.#siteUrl("/cloud/Training/LastPerformedWorkoutSession", {
        fromDate: formatQueryDay(from),
        toDate: formatQueryDay(to),
      });
      const html = await this.#readSitePage(url, "elenco");
      const values: string[] = [];
      for (const [tag] of html.matchAll(INPUT_TAG_PATTERN)) {
        if (!SESSION_INPUT_PATTERN.test(tag)) continue;
        values.push(VALUE_PATTERN.exec(tag)?.[1] ?? "");
      }
      const parsed = SessionIdsSchema.safeParse(values);
      if (!parsed.success) {
        throw new ParseError("Mywellness: id seduta non numerico", {
          cause: parsed.error,
        });
      }
      for (const id of parsed.data) ids.add(id);
    }
    return [...ids];
  }

  /** Dettaglio JSON di una seduta (servizi). */
  async getSession(id: string): Promise<unknown> {
    const user = this.#requireUser();
    const path = `/Training/User/${encodeURIComponent(user.id)}/GetPerformedWorkoutSessionByIdCr`;
    return this.#getJson(path, { IdCr: id });
  }

  /** Pagina HTML con le serie di un esercizio di forza (`day` = `YYYY-MM-DD`). */
  async getStrengthDetailHtml(
    activityId: string,
    day: string,
  ): Promise<string> {
    this.#requireUser();
    const url = this.#siteUrl("/cloud/Training/PerformedExerciseDetailById/", {
      performedPhysicalActivityId: activityId,
      day,
    });
    return this.#readSitePage(url, "dettaglio");
  }

  /** Serie temporale JSON di un esercizio cardio (servizi). */
  async getCardioTimeseries(
    analyticsId: string,
    facilityId: string,
  ): Promise<unknown> {
    const path = `/Training/CardioLog/${encodeURIComponent(analyticsId)}/Details`;
    return this.#getJson(path, { facilityId });
  }

  #requireUser(): CurrentUser {
    if (this.#user === undefined) {
      throw new SyncError("Mywellness: login non eseguito");
    }
    return this.#user;
  }

  /** Pagina HTML del sito; il form di login al posto dei dati è una sessione scaduta. */
  async #readSitePage(url: URL, step: Step): Promise<string> {
    const html = await readText(await this.#request(url, step));
    if (LOGIN_FORM_PATTERN.test(html)) throw new AuthError(LOGIN_FAILED);
    return html;
  }

  #siteUrl(path: string, params: Record<string, string> = {}): URL {
    const url = new URL(path, this.#site);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url;
  }

  async #getJson(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const user = this.#requireUser();
    const url = new URL(path, this.#services);
    const query = {
      ...params,
      token: user.token,
      AppId: APP_ID,
      _c: user.culture,
    };
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    const text = await readText(
      await this.#request(url, "dettaglio", { accept: "application/json" }),
    );
    try {
      return JSON.parse(text);
    } catch {
      // Niente cause: il SyntaxError cita il corpo della risposta.
      throw new ParseError("Mywellness: risposta non JSON");
    }
  }

  /** Richiesta con redirect seguiti a mano, per raccogliere i cookie di ogni passo. */
  async #request(
    url: URL,
    step: Step,
    opts: { form?: URLSearchParams; accept?: string } = {},
  ): Promise<Response> {
    let current = url;
    let form = opts.form;
    for (let hop = 0; ; hop++) {
      const site = current.origin === this.#site.origin;
      const headers = new Headers({ "User-Agent": USER_AGENT });
      if (opts.accept !== undefined) headers.set("Accept", opts.accept);
      if (form !== undefined) {
        headers.set("Content-Type", "application/x-www-form-urlencoded");
      }
      if (site && this.#cookies.size > 0) {
        headers.set("Cookie", this.#cookieHeader());
      }
      const response = await this.#exchange(current, {
        method: form === undefined ? "GET" : "POST",
        headers,
        body: form?.toString(),
      });
      if (site) this.#storeCookies(response);
      const location = response.headers.get("location");
      if (!REDIRECT_STATUSES.has(response.status) || location === null) {
        if (!response.ok) {
          discard(response);
          throw new UpstreamError(`Mywellness: HTTP ${response.status}`);
        }
        return response;
      }
      discard(response);
      // Della destinazione mai percorso né query: possono contenere parametri di sessione.
      if (hop === MAX_REDIRECTS) {
        throw new SyncError("Mywellness: troppi redirect");
      }
      const next = URL.parse(location, current.href);
      // Cookie e corpo del form restano sullo stesso dominio.
      if (next === null || next.origin !== current.origin) {
        const target =
          next === null
            ? "destinazione non valida"
            : `verso ${next.protocol}//${next.host}`;
        throw new SyncError(
          `Mywellness: redirect non ammesso (passo ${step}, HTTP ${response.status}, ${target})`,
        );
      }
      // Come fetch: 307/308 ripetono metodo e corpo, gli altri diventano GET.
      if (response.status !== 307 && response.status !== 308) form = undefined;
      current = next;
    }
  }

  /**
   * Un passo HTTP: limite di frequenza e, solo per le GET, retry su 429 e 5xx. Nessun retry su
   * 401/403, su errore di rete o timeout, né per un POST: il POST di login, con e-mail e
   * password, parte una volta sola.
   */
  async #exchange(url: URL, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const delay = RETRY_DELAYS_MS[attempt];
      await this.#throttle();
      let response: Response;
      try {
        response = await (this.#fetch ?? fetch)(url.toString(), {
          ...init,
          redirect: "manual",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Niente cause: l'errore di fetch potrebbe citare l'URL, che ai servizi porta il token.
        throw new TransientError("Mywellness: richiesta non riuscita (rete)");
      }
      if (response.status === 401 || response.status === 403) {
        discard(response);
        throw new AuthError(
          `Mywellness: accesso negato (HTTP ${response.status})`,
        );
      }
      if (response.status === 429 || response.status >= 500) {
        discard(response);
        if (init.method === "POST") {
          throw new TransientError(
            `Mywellness: HTTP ${response.status} (POST non ripetuto)`,
          );
        }
        if (delay === undefined) {
          throw new TransientError(
            `Mywellness: HTTP ${response.status} dopo ${attempt + 1} tentativi`,
          );
        }
        await this.#sleep(delay);
        continue;
      }
      return response;
    }
  }

  async #throttle(): Promise<void> {
    const wait = this.#lastRequestAt + this.#minIntervalMs - Date.now();
    if (wait > 0) await this.#sleep(wait);
    this.#lastRequestAt = Date.now();
  }

  #storeCookies(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      this.#cookies.set(
        pair.slice(0, separator).trim(),
        pair.slice(separator + 1).trim(),
      );
    }
  }

  #cookieHeader(): string {
    return [...this.#cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}
