// Controllo che Cloudflare Access protegga la dashboard (workflow publish.yml, docs/dashboard.md,
// «Pubblicazione»): `/` e `/api/measures` devono rispondere con un redirect verso la pagina di
// login di Access (`https://<team>.cloudflareaccess.com/…`). Con `--after-deploy`, in più,
// `GET /api/measures` con `X-Requested-With: XMLHttpRequest` e senza cookie deve rispondere 401.
// Uso: DASHBOARD_HOSTNAME=<nome host> npx --no -- tsx src/cli/check-access.ts [--after-deploy]
// Su stderr solo percorsi, stati HTTP ed esito: mai l'hostname, gli URL o il Location (il log
// delle Actions è pubblico).
// Exit code (docs/buone-pratiche.md § 8): 0 ok · 64 argomenti · 75 errore di rete o timeout
// (rilanciare) · 78 DASHBOARD_HOSTNAME mancante o non valido, Access non attivo o non come previsto.
import { pathToFileURL } from "node:url";

const PATHS = ["/", "/api/measures"] as const;
// Solo un nome host (etichette DNS separate da punti): niente schema, percorso, porta o spazi.
const HOSTNAME =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

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
  const fetchFn = deps.fetch ?? fetch;
  /** GET senza cookie e senza seguire i redirect; `null` se la richiesta non riesce. */
  const get = async (
    path: string,
    headers: Record<string, string> = {},
  ): Promise<Response | null> => {
    try {
      // `manual`: il redirect di Access è proprio la risposta da controllare, non va seguito.
      return await fetchFn(`https://${host}${path}`, {
        redirect: "manual",
        headers,
      });
    } catch {
      // Messaggio e causa dell'errore di fetch nominano l'host: non si stampano.
      console.error(
        `Richiesta a ${path} non riuscita: errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS)`,
      );
      return null;
    }
  };
  // Solo percorsi e stati nei messaggi: l'hostname e il Location (che lo contiene) mai.
  for (const path of PATHS) {
    const response = await get(path);
    if (response === null) return 75;
    if (!redirectsToAccess(response, `https://${host}${path}`)) {
      console.error(
        `Access non attivo su ${path}: risposta ${response.status}, atteso un redirect al login di Access (*.cloudflareaccess.com)`,
      );
      return 78;
    }
  }
  if (!afterDeploy) {
    console.error(
      "Access attivo: / e /api/measures reindirizzano al login di Access",
    );
    return 0;
  }
  // Con questa intestazione e senza sessione Access risponde 401 invece del redirect: il
  // frontend ricarica la pagina (kb/decisioni/2026-11-01-sessione-access-scaduta.md).
  const xhr = await get("/api/measures", {
    "X-Requested-With": "XMLHttpRequest",
  });
  if (xhr === null) return 75;
  if (xhr.status !== 401) {
    console.error(
      `GET /api/measures con X-Requested-With: risposta ${xhr.status}, attesa 401. Il deploy è avvenuto e i dati restano protetti, ma con la sessione scaduta la dashboard mostrerà un errore invece di ricaricarsi (docs/dashboard.md, «Se il deploy fallisce»)`,
    );
    return 78;
  }
  console.error(
    "Access attivo: / e /api/measures reindirizzano al login di Access; /api/measures con X-Requested-With risponde 401",
  );
  return 0;
}

// Eseguito con `npx tsx src/cli/check-access.ts`; importato dai test, non parte.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
