// Controllo che Cloudflare Access protegga la dashboard (workflow publish.yml, docs/dashboard.md,
// «Pubblicazione»): `/` e `/api/measures` devono rispondere con un redirect verso la pagina di
// login di Access (`https://<team>.cloudflareaccess.com/…`), sia sull'hostname della dashboard sia
// sul dominio `<sottodominio>.pages.dev` del progetto, dove si apre anche il deploy di produzione.
// Con `--after-deploy`, in più, `GET /api/measures` sull'hostname con `X-Requested-With:
// XMLHttpRequest` e senza cookie deve rispondere 401.
// Uso: DASHBOARD_HOSTNAME=<nome host> PAGES_HOSTNAME=<sottodominio>.pages.dev \
//        npx --no -- tsx src/cli/check-access.ts [--after-deploy]
// Su stderr solo percorsi, stati HTTP ed esito: mai i due host, gli URL o il Location (il log
// delle Actions è pubblico).
// Exit code (docs/buone-pratiche.md § 8, `exitCodeFor`): 0 ok · 64 argomenti · 70 errore inatteso
// (solo il nome) · 75 errore di rete o timeout (rilanciare) · 78 DASHBOARD_HOSTNAME o
// PAGES_HOSTNAME mancante o non valido, Access non attivo o non come previsto.
import { pathToFileURL } from "node:url";
import { exitCodeFor, TransientError } from "../errors";

const PATHS = ["/", "/api/measures"] as const;
// Timeout di ogni richiesta: quelli di undici per intestazioni e corpo (300 s) supererebbero il
// timeout del passo nel workflow, e il 75 promesso per il timeout non arriverebbe mai.
const TIMEOUT_MS = 15_000;
// Solo un nome host (etichette DNS separate da punti): niente schema, percorso, porta o spazi.
const HOSTNAME =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
// Il dominio di produzione del progetto: una sola etichetta prima di `.pages.dev`. Un alias di
// anteprima (`<hash>.<sottodominio>.pages.dev`) passa da un'altra applicazione Access.
const PAGES_HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.pages\.dev$/i;

/** Vero se la risposta è un redirect verso il login di Access (`https://*.cloudflareaccess.com`). */
function redirectsToAccess(response: Response, url: string): boolean {
  if (response.status < 300 || response.status > 399) return false;
  const location = response.headers.get("location");
  if (location === null) return false;
  // `URL.parse` e non `new URL`: l'errore di `new URL` riporta input e base, cioè l'hostname.
  const target = URL.parse(location, url);
  return (
    target?.protocol === "https:" &&
    target.hostname.endsWith(".cloudflareaccess.com")
  );
}

/**
 * Errori che fetch lancia per la rete, per un abort o per il timeout del segnale. Per la rete
 * undici lancia un `TypeError` con la causa («fetch failed»); un `TypeError` senza causa è un
 * errore di programmazione.
 */
function isNetworkError(error: unknown): boolean {
  return (
    (error instanceof TypeError && error.cause !== undefined) ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

/** Un host da controllare e il nome con cui compare nei messaggi (mai l'hostname dell'utente). */
type Target = { host: string; label: string };

/**
 * GET senza cookie e senza seguire i redirect. Un errore di rete diventa `TransientError`, con
 * l'errore di fetch come causa: il messaggio nomina solo percorso e `pages.dev`, la causa l'host.
 */
async function get(
  fetchFn: typeof fetch,
  target: Target,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  try {
    // `manual`: il redirect di Access è proprio la risposta da controllare, non va seguito.
    return await fetchFn(`https://${target.host}${path}`, {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    throw new TransientError(
      `Richiesta a ${target.label}${path} non riuscita: errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS)`,
      { cause: error },
    );
  }
}

/** I controlli, con l'exit code del primo che non passa. */
async function check(
  fetchFn: typeof fetch,
  host: string,
  pagesHost: string,
  afterDeploy: boolean,
): Promise<number> {
  const dashboard: Target = { host, label: "" };
  // Il deploy di produzione si apre anche da pages.dev, che l'applicazione Access dell'hostname
  // non copre (docs/dashboard.md, «Configurazione», passo 6).
  const targets: Target[] = [
    dashboard,
    { host: pagesHost, label: "pages.dev" },
  ];
  // Solo percorsi e stati nei messaggi: l'hostname e il Location (che lo contiene) mai.
  for (const target of targets) {
    for (const path of PATHS) {
      const response = await get(fetchFn, target, path);
      if (!redirectsToAccess(response, `https://${target.host}${path}`)) {
        console.error(
          `Access non attivo su ${target.label}${path}: risposta ${response.status}, atteso un redirect al login di Access (*.cloudflareaccess.com)`,
        );
        return 78;
      }
    }
  }
  const active =
    "Access attivo: / e /api/measures reindirizzano al login di Access, anche su pages.dev";
  if (!afterDeploy) {
    console.error(active);
    return 0;
  }
  // Con questa intestazione e senza sessione Access risponde 401 invece del redirect: il
  // frontend ricarica la pagina (kb/decisioni/2026-11-01-sessione-access-scaduta.md).
  const xhr = await get(fetchFn, dashboard, "/api/measures", {
    "X-Requested-With": "XMLHttpRequest",
  });
  if (xhr.status !== 401) {
    console.error(
      `GET /api/measures con X-Requested-With: risposta ${xhr.status}, attesa 401. Il deploy è avvenuto e i dati restano protetti, ma con la sessione scaduta la dashboard mostrerà un errore invece di ricaricarsi (docs/dashboard.md, «Se il deploy fallisce»)`,
    );
    return 78;
  }
  console.error(`${active}; /api/measures con X-Requested-With risponde 401`);
  return 0;
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: Partial<{ fetch: typeof fetch }> = {},
): Promise<number> {
  const afterDeploy = argv.length === 1 && argv[0] === "--after-deploy";
  if (argv.length > 0 && !afterDeploy) {
    console.error("Uso: check-access [--after-deploy]");
    return 64;
  }
  const host = env.DASHBOARD_HOSTNAME;
  if (!host || !HOSTNAME.test(host)) {
    // Mai stampare il valore ricevuto.
    console.error(
      "DASHBOARD_HOSTNAME mancante o non valido: serve il solo nome host, senza https://, percorso o spazi",
    );
    return 78;
  }
  // Un Secret come l'hostname: il sottodominio pages.dev non va nel repository pubblico.
  const pagesHost = env.PAGES_HOSTNAME;
  if (!pagesHost || !PAGES_HOSTNAME.test(pagesHost)) {
    console.error(
      "PAGES_HOSTNAME mancante o non valido: serve il solo nome host <sottodominio>.pages.dev del progetto, senza https://, percorso o spazi",
    );
    return 78;
  }
  try {
    return await check(deps.fetch ?? fetch, host, pagesHost, afterDeploy);
  } catch (error) {
    // Solo il messaggio del TransientError, che non nomina l'host (la causa sì); di un errore
    // inatteso solo il nome, perché il suo messaggio può contenere l'URL.
    console.error(
      error instanceof TransientError
        ? error.message
        : `Controllo di Access non riuscito: errore inatteso (${error instanceof Error ? error.name : typeof error})`,
    );
    return exitCodeFor(error);
  }
}

// Eseguito con `npx tsx src/cli/check-access.ts`; importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
