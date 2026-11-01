// Probe locale di Mywellness (Task 0): login con le credenziali dell'utente e salvataggio
// in probe_out/ (ignorato da git) dei soli corpi grezzi delle risposte, mai degli header,
// da cui scripts/shape-report.ts ricava il rapporto della forma. Endpoint e parametri:
// docs/mywellness-api.md (letti dal codice di gymexport, da verificare).
// Uso: MYWELLNESS_EMAIL=… MYWELLNESS_PASSWORD=… npx tsx scripts/probe-mywellness.ts [--days N]
// Un login per esecuzione, almeno 1 s tra due richieste. Su stdout una riga per richiesta
// (etichetta, stato HTTP, byte), su stderr le note; mai corpi, id, date, nomi o password.
// Exit code: 0 ok · 64 argomenti · 65 profilo non interpretabile · 69 risposta HTTP
// inattesa · 75 errore di rete, 429 o 5xx · 78 credenziali mancanti o rifiutate.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { romeDate } from "../src/domain/dates";
import {
  AuthError,
  exitCodeFor,
  ParseError,
  SyncError,
  TransientError,
  UpstreamError,
} from "../src/errors";
import { readCurrentUser } from "../src/mywellness/client";

const SITE = "https://www.mywellness.com";
const SERVICES = "https://services.mywellness.com";
const API = "https://api.mywellness.com";
// AppId pubblico del sito web (non è una credenziale).
const APP_ID = "ec1d38d7-d359-48d0-a60c-d8c0b8fb9df9";
const MIN_INTERVAL_MS = 1000;
const MAX_REDIRECTS = 10;
const MAX_SESSIONS = 10;
const MAX_DETAILS = 8;
// Una sola serie cardio: basta per la forma, e meno dati grezzi restano in probe_out.
const MAX_CARDIO = 1;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const DAY_MS = 86_400_000;
const USAGE =
  "Uso: MYWELLNESS_EMAIL=… MYWELLNESS_PASSWORD=… npx tsx scripts/probe-mywellness.ts [--days N] (N da 1 a 365)";

type Reply = { status: number; bytes: Uint8Array; text: string };

/** Client minimo: cookie gestiti a mano dagli header `set-cookie`, redirect seguiti a mano. */
class Http {
  private readonly cookies = new Map<string, string>();
  private sent = 0;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  /** Valori dei cookie ricevuti: finiscono in identities.json, mai nei log. */
  cookieValues(): string[] {
    return [...this.cookies.values()];
  }

  /** Una richiesta e i suoi redirect; restituisce l'ultima risposta, qualunque stato abbia. */
  async send(
    label: string,
    url: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<Reply> {
    let current = new URL(url);
    let method = init.method ?? "GET";
    let body = init.body;
    for (let hop = 0; ; hop++) {
      if (this.sent > 0) await this.sleep(MIN_INTERVAL_MS);
      this.sent++;
      const headers: Record<string, string> = { ...init.headers };
      if (body === undefined) delete headers["Content-Type"];
      const cookie = this.cookieHeader(current);
      if (cookie) headers.Cookie = cookie;
      const name = hop === 0 ? label : `${label} (redirect ${hop})`;
      let response: Response;
      let bytes: Uint8Array;
      try {
        response = await this.fetchFn(current, {
          method,
          headers,
          body,
          redirect: "manual",
        });
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        throw new TransientError(`${name}: errore di rete`, { cause: error });
      }
      this.storeCookies(response.headers.getSetCookie());
      console.log(`${name}: HTTP ${response.status}, ${bytes.byteLength} byte`);
      const location = response.headers.get("location");
      if (response.status < 300 || response.status > 399 || !location) {
        const text = new TextDecoder().decode(bytes);
        return { status: response.status, bytes, text };
      }
      if (hop === MAX_REDIRECTS) {
        throw new UpstreamError(`${label}: troppi redirect`);
      }
      current = this.nextUrl(label, location, current);
      if (response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = undefined;
      }
    }
  }

  /** Destinazione di un redirect, solo se è un host Mywellness in HTTPS; mai l'URL nel messaggio. */
  private nextUrl(label: string, location: string, base: URL): URL {
    let next: URL;
    try {
      next = new URL(location, base);
    } catch {
      throw new UpstreamError(`${label}: redirect non valido`);
    }
    const host = next.hostname;
    const sameSite =
      host === "mywellness.com" || host.endsWith(".mywellness.com");
    if (next.protocol !== "https:" || !sameSite) {
      throw new UpstreamError(
        `${label}: redirect verso un host non consentito`,
      );
    }
    return next;
  }

  private cookieHeader(url: URL): string {
    const host = url.hostname;
    if (host !== "mywellness.com" && !host.endsWith(".mywellness.com")) {
      return "";
    }
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private storeCookies(lines: string[]): void {
    for (const line of lines) {
      const pair = line.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "") this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
  }
}

/** Stati HTTP di un passo obbligatorio: errori di dominio come in docs/buone-pratiche.md § 8. */
function ensureOk(label: string, reply: Reply): Reply {
  const { status } = reply;
  if (status === 401 || status === 403) {
    throw new AuthError(`${label}: accesso negato (HTTP ${status})`);
  }
  if (status === 429 || status >= 500) {
    throw new TransientError(`${label}: HTTP ${status}`);
  }
  if (status < 200 || status > 299) {
    throw new UpstreamError(`${label}: HTTP ${status}`);
  }
  return reply;
}

const CurrentUser = z.looseObject({
  id: z.string(),
  token: z.string(),
  culture: z.string().optional(),
});

const AnyId = z.union([z.string(), z.number()]).nullish();
const Session = z.looseObject({
  data: z.looseObject({
    startedOn: z.string(),
    physicalActivities: z.array(
      z.looseObject({
        isCardio: z.boolean(),
        analyticsId: AnyId,
        performedPhysicalActivity: z
          .looseObject({
            id: z.string(),
            facilityId: z.string().nullish(),
            analiticsId: AnyId,
          })
          .nullish(),
      }),
    ),
  }),
});
type Activity = z.infer<typeof Session>["data"]["physicalActivities"][number];
type Probed = {
  bytes: Uint8Array;
  startedOn: string;
  activities: Activity[];
};

function note(message: string): void {
  console.error(`Nota: ${message}`);
}

function parseDays(argv: string[]): number | undefined {
  if (argv.length === 0) return DEFAULT_DAYS;
  const [flag, value = ""] = argv;
  if (argv.length !== 2 || flag !== "--days" || !/^\d+$/.test(value)) {
    return undefined;
  }
  const days = Number(value);
  return days >= 1 && days <= MAX_DAYS ? days : undefined;
}

function dmy(time: number): string {
  const [y, m, d] = new Date(time).toISOString().slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Gli ultimi `days` giorni fino a `today` (`YYYY-MM-DD`) divisi per mese di calendario,
 * dal più recente, come coppie `DD/MM/YYYY`: gymexport chiede un mese per chiamata.
 */
function monthRanges(today: string, days: number): [string, string][] {
  const start = Date.parse(`${today}T00:00:00Z`) - days * DAY_MS;
  const ranges: [string, string][] = [];
  for (let to = Date.parse(`${today}T00:00:00Z`); to >= start; ) {
    const date = new Date(to);
    const first = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    ranges.push([dmy(Math.max(first, start)), dmy(to)]);
    to = first - DAY_MS;
  }
  return ranges;
}

/** Valori di `<input name="hdSessionIdCR" value="…">`, senza duplicati, nell'ordine. */
function sessionIds(html: string): string[] {
  const ids: string[] = [];
  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    if (!/\bname\s*=\s*["']hdSessionIdCR["']/i.test(tag)) continue;
    const value = /\bvalue\s*=\s*["'](\d+)["']/i.exec(tag)?.[1];
    if (value) ids.push(value);
  }
  return [...new Set(ids)];
}

function startedAt(session: Probed): number {
  // "2026-03-01 15:17:08 +01:00" → "2026-03-01T15:17:08+01:00"
  const time = Date.parse(session.startedOn.replace(" ", "T").replace(" ", ""));
  return Number.isNaN(time) ? 0 : time;
}

function analyticsIdOf(activity: Activity): string {
  const id =
    activity.analyticsId ?? activity.performedPhysicalActivity?.analiticsId;
  return id === null || id === undefined ? "" : String(id);
}

// Chiavi del profilo il cui valore identifica: ogni forma di nome, contatto, indirizzo, tessera.
const IDENTITY_KEY =
  /name|surname|first|last|nick|mail|phone|mobile|cell|address|street|city|zip|postal|cap|fiscal|tax|card|badge|mifare|member|external|crm|picture|photo|avatar|birth/i;
const PHONE_KEY = /phone|mobile|cell/i;

/** Identità che il rapporto della forma non deve contenere: e-mail, id, token, dati anagrafici, cookie. */
function collectIdentities(
  email: string,
  user: unknown,
  profile: Profile,
  cookies: string[],
): string[] {
  const found = [email, profile.id, profile.token];
  // Lo userId compare anche senza trattini (es. nelle query): va tolto in entrambe le forme.
  if (profile.id.includes("-")) found.push(profile.id.replaceAll("-", ""));
  const visit = (value: unknown, key: string): void => {
    if (typeof value === "string" || typeof value === "number") {
      if (!IDENTITY_KEY.test(key)) return;
      const text = String(value);
      found.push(text);
      // I telefoni compaiono anche con le sole cifre (senza +, spazi o trattini).
      if (PHONE_KEY.test(key)) {
        const digits = text.replace(/\D/g, "");
        if (digits.length >= 6) found.push(digits);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
    } else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  };
  visit(user, "");
  // Cookie di sessione e di autenticazione; quelli brevi (lingua, flag) non identificano.
  found.push(...cookies.filter((value) => value.length >= 16));
  return [...new Set(found.filter((value) => value !== ""))];
}

/** Primo valore testuale di una chiave che contiene "facilityUrl", a qualunque profondità. */
function findFacilityUrl(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (/facilityurl/i.test(key) && typeof item === "string" && item !== "") {
      return item;
    }
    const nested = findFacilityUrl(item);
    if (nested) return nested;
  }
  return undefined;
}

function numbered(base: string, index: number, ext: string): string {
  return index === 0 ? `${base}${ext}` : `${base}_${index + 1}${ext}`;
}

type Saver = (name: string, bytes: Uint8Array) => Promise<void>;
type Profile = z.infer<typeof CurrentUser>;

/** Pagina del modulo (cookie), POST del modulo, pagina di allenamento con il profilo. */
async function login(
  http: Http,
  save: Saver,
  email: string,
  password: string,
): Promise<{ user: unknown; profile: Profile }> {
  const form = ensureOk(
    "login form",
    await http.send("login form", `${SITE}/cloud/User/Login`),
  );
  await save("login_form.html", form.bytes);
  ensureOk(
    "login",
    await http.send("login", `${SITE}/cloud/User/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "UserBinder.MifareId": "",
        "UserBinder.IsFromLogin": "True",
        "UserBinder.ForceJoinFacility": "",
        "UserBinder.Username": email,
        "UserBinder.Password": password,
        "UserBinder.KeepMeLogged": "true",
      }).toString(),
    }),
  );
  const training = ensureOk(
    "training",
    await http.send("training", `${SITE}/cloud/Training`),
  );
  // Credenziali rifiutate: il sito torna al modulo di login, senza profilo.
  const user = readCurrentUser(training.text);
  if (user === undefined) throw new AuthError("Login Mywellness fallito");
  const profile = CurrentUser.safeParse(user);
  if (!profile.success) {
    throw new ParseError("training: EU.currentUser senza id o token", {
      cause: profile.error,
    });
  }
  await save("login_ok.html", training.bytes);
  return { user, profile: profile.data };
}

/** Candidati in sola lettura (docs/mywellness-api.md): un fallimento è solo una nota. */
async function probeBiometrics(
  http: Http,
  save: Saver,
  user: unknown,
  profile: Profile,
): Promise<void> {
  const facilityUrl = findFacilityUrl(user);
  if (!facilityUrl) {
    note("nessun facilityUrl nel profilo: biometria non provata");
    return;
  }
  const path = `/${encodeURIComponent(facilityUrl)}/biometrics/user/${encodeURIComponent(profile.id)}/lastbiometricsmeasurements`;
  for (const [label, host] of [
    ["biometrics services", SERVICES],
    ["biometrics api", API],
  ] as const) {
    let reply: Reply;
    try {
      reply = await http.send(label, `${host}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ token: profile.token }),
      });
    } catch (error) {
      if (!(error instanceof SyncError)) throw error;
      note(error.message);
      continue;
    }
    if (reply.status === 200 && isJson(reply.text)) {
      await save("biometrics.json", reply.bytes);
      return;
    }
  }
  note("nessun candidato biometrico ha risposto 200 con JSON");
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

async function probe(
  http: Http,
  opts: {
    email: string;
    password: string;
    days: number;
    outDir: string;
    now: Date;
  },
): Promise<void> {
  // Permessi stretti: i corpi grezzi contengono dati personali e non escono da questo computer.
  // `mode` vale solo per ciò che si crea: chmod anche sulla cartella e sui file esistenti.
  await mkdir(opts.outDir, { recursive: true, mode: 0o700 });
  await chmod(opts.outDir, 0o700);
  const written = new Set<string>();
  const writePrivate = async (name: string, data: Uint8Array | string) => {
    const path = join(opts.outDir, name);
    await writeFile(path, data, { mode: 0o600 });
    await chmod(path, 0o600);
  };
  const save: Saver = async (name, bytes) => {
    await writePrivate(name, bytes);
    written.add(name);
  };

  // 1. Login.
  const { user, profile } = await login(http, save, opts.email, opts.password);
  const auth = {
    token: profile.token,
    AppId: APP_ID,
    _c: profile.culture ?? "en-GB",
  };
  const json = { headers: { Accept: "application/json" } };

  try {
    // 2. Elenco delle sedute degli ultimi `days` giorni (date di Roma), un mese per volta.
    const today = romeDate(opts.now.toISOString());
    const listed: string[] = [];
    for (const [i, [fromDate, toDate]] of monthRanges(
      today,
      opts.days,
    ).entries()) {
      const label = `sessions ${i + 1}`;
      const range = new URLSearchParams({ fromDate, toDate });
      const list = ensureOk(
        label,
        await http.send(
          label,
          `${SITE}/cloud/Training/LastPerformedWorkoutSession?${range}`,
        ),
      );
      await save(numbered("last_sessions", i, ".html"), list.bytes);
      listed.push(...sessionIds(list.text));
    }
    const ids = [...new Set(listed)].slice(0, MAX_SESSIONS);
    if (ids.length === 0) {
      note(
        `nessun id seduta (hdSessionIdCR) nelle pagine last_sessions: nessuna seduta negli ultimi ${opts.days} giorni (provare --days) o formato cambiato`,
      );
    }

    // 3. Dettaglio JSON di ogni seduta elencata.
    const sessions: Probed[] = [];
    for (const [i, id] of ids.entries()) {
      const label = `session ${i + 1}`;
      const query = new URLSearchParams({ IdCr: id, ...auth });
      const reply = ensureOk(
        label,
        await http.send(
          label,
          `${SERVICES}/Training/User/${encodeURIComponent(profile.id)}/GetPerformedWorkoutSessionByIdCr?${query}`,
          json,
        ),
      );
      // Nome per indice, mai l'IdCr: l'identificativo della seduta non entra in probe_out.
      await save(`session_${i + 1}.json`, reply.bytes);
      const session = Session.safeParse(
        isJson(reply.text) ? JSON.parse(reply.text) : undefined,
      );
      if (!session.success) {
        note(
          `${label}: formato inatteso, esclusa dalla scelta della seduta di forza e di quella solo cardio`,
        );
        continue;
      }
      sessions.push({
        bytes: reply.bytes,
        startedOn: session.data.data.startedOn,
        activities: session.data.data.physicalActivities,
      });
    }

    // 4. Seduta di forza più recente e seduta solo cardio più recente.
    const recent = [...sessions].sort((a, b) => startedAt(b) - startedAt(a));
    const strengthOf = (s: Probed) =>
      s.activities.filter((a) => !a.isCardio && a.performedPhysicalActivity);
    const cardioOf = (s: Probed) =>
      s.activities.filter((a) => a.isCardio && analyticsIdOf(a) !== "");
    const strength = recent.find((s) => strengthOf(s).length > 0);
    const cardioOnly = recent.find(
      (s) => s.activities.length > 0 && s.activities.every((a) => a.isCardio),
    );
    if (strength) {
      await save("session_strength.json", strength.bytes);
    } else {
      note(
        "nessuna seduta con esercizi non cardio: niente session_strength.json",
      );
    }
    if (cardioOnly) {
      await save("session_cardio_only.json", cardioOnly.bytes);
    } else {
      note("nessuna seduta solo cardio: niente session_cardio_only.json");
    }

    // 5. Dettaglio HTML (serie, ripetizioni, kg) degli esercizi non cardio.
    const day = strength && /^\d{4}-\d{2}-\d{2}/.exec(strength.startedOn)?.[0];
    if (strength && !day) {
      note("data della seduta di forza non riconosciuta: dettaglio senza day");
    }
    const exercises = strength ? strengthOf(strength) : [];
    for (const [i, activity] of exercises.slice(0, MAX_DETAILS).entries()) {
      const label = `strength detail ${i + 1}`;
      const query = new URLSearchParams({
        performedPhysicalActivityId:
          activity.performedPhysicalActivity?.id ?? "",
        ...(day ? { day } : {}),
      });
      const reply = ensureOk(
        label,
        await http.send(
          label,
          `${SITE}/cloud/Training/PerformedExerciseDetailById/?${query}`,
        ),
      );
      await save(numbered("strength_detail", i, ".html"), reply.bytes);
    }

    // 6. Serie temporali cardio: della seduta di forza se ne ha, altrimenti di quella cardio.
    const cardioSource = [strength, cardioOnly].find(
      (s) => s && cardioOf(s).length > 0,
    );
    if (!cardioSource) {
      note(
        "nessuna attività cardio con analyticsId: niente cardio_timeseries.json",
      );
    }
    const cardio = cardioSource ? cardioOf(cardioSource) : [];
    for (const [i, activity] of cardio.slice(0, MAX_CARDIO).entries()) {
      const label = `cardio timeseries ${i + 1}`;
      const facilityId = activity.performedPhysicalActivity?.facilityId;
      const query = new URLSearchParams({
        ...(facilityId ? { facilityId } : {}),
        ...auth,
      });
      const reply = ensureOk(
        label,
        await http.send(
          label,
          `${SERVICES}/Training/CardioLog/${encodeURIComponent(analyticsIdOf(activity))}/Details?${query}`,
          json,
        ),
      );
      await save(numbered("cardio_timeseries", i, ".json"), reply.bytes);
    }

    // 7. Misure biometriche.
    await probeBiometrics(http, save, user, profile);
  } finally {
    // Anche dopo un errore: il controllo finale del rapporto della forma ne ha bisogno.
    const identities = collectIdentities(
      opts.email,
      user,
      profile,
      http.cookieValues(),
    );
    await writePrivate("identities.json", JSON.stringify(identities, null, 2));
    console.log(`${written.size + 1} file scritti in ${opts.outDir}`);
  }
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: Partial<{
    fetch: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    outDir: string;
    now: () => Date;
  }> = {},
): Promise<number> {
  const days = parseDays(argv);
  if (days === undefined) {
    console.error(USAGE);
    return 64;
  }
  const { MYWELLNESS_EMAIL: email, MYWELLNESS_PASSWORD: password } = env;
  if (!email || !password) {
    // Solo i nomi delle variabili mancanti, mai i valori.
    const missing = ["MYWELLNESS_EMAIL", "MYWELLNESS_PASSWORD"].filter(
      (name) => !env[name],
    );
    console.error(`Variabili d'ambiente mancanti: ${missing.join(", ")}`);
    return 78;
  }
  const http = new Http(
    deps.fetch ?? globalThis.fetch,
    deps.sleep ?? ((ms) => delay(ms)),
  );
  try {
    await probe(http, {
      email,
      password,
      days,
      outDir: deps.outDir ?? "probe_out",
      now: deps.now?.() ?? new Date(),
    });
    return 0;
  } catch (error) {
    if (!(error instanceof SyncError)) throw error;
    // Solo il messaggio, mai la causa: potrebbe citare il contenuto di una risposta.
    console.error(error.message);
    return exitCodeFor(error);
  }
}

// Eseguito con `npx tsx scripts/probe-mywellness.ts`; importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
