import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/check-access";
import { setupMswServer } from "../msw";

// Valori fittizi: hostname della dashboard, dominio pages.dev del progetto e team di Access
// inventati, nessuna rete (MSW).
const HOST = "dashboard.example.com";
const PAGES_DEV = "progetto-di-prova.pages.dev";
const ENV = { DASHBOARD_HOSTNAME: HOST, PAGES_HOSTNAME: PAGES_DEV };
const LOGIN = `https://esempio.cloudflareaccess.com/cdn-cgi/access/login/${HOST}?kid=aud-di-prova&redirect_url=%2F`;

/** Risposta di Access a una richiesta senza sessione: redirect alla pagina di login del team. */
const toAccessLogin = () =>
  new HttpResponse(null, { status: 302, headers: { Location: LOGIN } });

const server = setupMswServer();

let stderr: ReturnType<typeof vi.spyOn>;
let stdout: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
  stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
  // pages.dev dietro Access in ogni test, salvo quelli che lo cambiano con `server.use`.
  server.use(
    http.get(`https://${PAGES_DEV}/`, toAccessLogin),
    http.get(`https://${PAGES_DEV}/api/measures`, toAccessLogin),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Tutto ciò che la CLI ha scritto, su stderr e stdout. */
function output(): string {
  return [...stderr.mock.calls, ...stdout.mock.calls].flat().join("\n");
}

describe("check-access", () => {
  it("check-access: ok when / and /api/measures redirect to cloudflareaccess.com", async () => {
    server.use(
      http.get(`https://${HOST}/`, toAccessLogin),
      http.get(`https://${HOST}/api/measures`, toAccessLogin),
    );
    expect(await main([], ENV)).toBe(0);
    expect(stderr.mock.calls).toEqual([
      [
        "Access attivo: / e /api/measures reindirizzano al login di Access, anche su pages.dev",
      ],
    ]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("check-access: exit 78 when / answers 200 (access not active)", async () => {
    server.use(
      http.get(`https://${HOST}/`, () => HttpResponse.text("<!doctype html>")),
      http.get(`https://${HOST}/api/measures`, toAccessLogin),
    );
    expect(await main([], ENV)).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [
        "Access non attivo su /: risposta 200, atteso un redirect al login di Access (*.cloudflareaccess.com)",
      ],
    ]);
  });

  it("check-access: exit 78 when /api/measures answers 200", async () => {
    server.use(
      http.get(`https://${HOST}/`, toAccessLogin),
      http.get(`https://${HOST}/api/measures`, () =>
        HttpResponse.json({ measures: [] }),
      ),
    );
    expect(await main([], ENV)).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [
        "Access non attivo su /api/measures: risposta 200, atteso un redirect al login di Access (*.cloudflareaccess.com)",
      ],
    ]);
  });

  it.each([
    { argv: [], path: "/" },
    { argv: [], path: "/api/measures" },
    { argv: ["--after-deploy"], path: "/" },
    { argv: ["--after-deploy"], path: "/api/measures" },
  ])(
    "check-access: $argv exit 78 when pages.dev $path answers 200",
    async ({ argv, path }) => {
      const xhrHeaders: string[] = [];
      server.events.on("request:start", ({ request }) => {
        xhrHeaders.push(request.headers.get("x-requested-with") ?? "-");
      });
      server.use(
        http.get(`https://${HOST}/`, toAccessLogin),
        http.get(`https://${HOST}/api/measures`, toAccessLogin),
        http.get(`https://${PAGES_DEV}${path}`, () =>
          HttpResponse.text("<!doctype html>"),
        ),
      );
      expect(await main(argv, ENV)).toBe(78);
      server.events.removeAllListeners();
      expect(stderr.mock.calls).toEqual([
        [
          `Access non attivo su pages.dev${path}: risposta 200, atteso un redirect al login di Access (*.cloudflareaccess.com)`,
        ],
      ]);
      expect(xhrHeaders).not.toContain("XMLHttpRequest");
      expect(output()).not.toContain(HOST);
    },
  );

  it("check-access: exit 78 when pages.dev redirects to another host", async () => {
    server.use(
      http.get(`https://${HOST}/`, toAccessLogin),
      http.get(`https://${HOST}/api/measures`, toAccessLogin),
      http.get(
        `https://${PAGES_DEV}/`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: `https://${HOST}/` },
          }),
      ),
    );
    expect(await main([], ENV)).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [
        "Access non attivo su pages.dev/: risposta 302, atteso un redirect al login di Access (*.cloudflareaccess.com)",
      ],
    ]);
    expect(output()).not.toContain(HOST);
  });

  // Le applicazioni Access di uno stesso account condividono il team: un login di un altro team
  // vuol dire che quel dominio non è protetto da questo account (per esempio un PAGES_HOSTNAME
  // sbagliato che punta al progetto di qualcun altro).
  const OTHER_TEAM_LOGIN = `https://altro-team.cloudflareaccess.com/cdn-cgi/access/login/${PAGES_DEV}?kid=aud-altrui`;
  it.each([
    { argv: [], host: PAGES_DEV, label: "pages.dev", path: "/" },
    { argv: [], host: PAGES_DEV, label: "pages.dev", path: "/api/measures" },
    {
      argv: ["--after-deploy"],
      host: PAGES_DEV,
      label: "pages.dev",
      path: "/",
    },
    {
      argv: ["--after-deploy"],
      host: PAGES_DEV,
      label: "pages.dev",
      path: "/api/measures",
    },
    { argv: [], host: HOST, label: "", path: "/api/measures" },
  ])(
    "check-access: $argv exit 78 when $path on $host redirects to another Access team",
    async ({ argv, host, label, path }) => {
      // Prima la risposta del caso: a parità di percorso vince il primo handler.
      server.use(
        http.get(
          `https://${host}${path}`,
          () =>
            new HttpResponse(null, {
              status: 302,
              headers: { Location: OTHER_TEAM_LOGIN },
            }),
        ),
        http.get(`https://${HOST}/`, toAccessLogin),
        http.get(`https://${HOST}/api/measures`, toAccessLogin),
      );
      expect(await main(argv, ENV)).toBe(78);
      expect(stderr.mock.calls).toEqual([
        [
          `Access su ${label}${path}: il redirect porta al login di un team Access diverso da quello di / (atteso lo stesso team dell'account: docs/dashboard.md, «Se il deploy fallisce»)`,
        ],
      ]);
      for (const name of [HOST, PAGES_DEV, "altro-team", "esempio"]) {
        expect(output()).not.toContain(name);
      }
    },
  );

  it("check-access: exit 75 when pages.dev does not answer", async () => {
    server.use(
      http.get(`https://${HOST}/`, toAccessLogin),
      http.get(`https://${HOST}/api/measures`, toAccessLogin),
      http.get(`https://${PAGES_DEV}/`, () => HttpResponse.error()),
    );
    expect(await main([], ENV)).toBe(75);
    expect(stderr.mock.calls).toEqual([
      [
        "Richiesta a pages.dev/ non riuscita: errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS)",
      ],
    ]);
  });

  it.each([
    { label: "another host", location: "https://login.example.net/accedi" },
    {
      label: "a look-alike host",
      location: "https://falsocloudflareaccess.com/cdn-cgi/access/login",
    },
    { label: "plain http", location: LOGIN.replace("https:", "http:") },
    { label: "a relative path", location: "/cdn-cgi/access/login" },
    // L'host vero è dopo la `@`: le credenziali nell'URL non contano.
    {
      label: "a userinfo trick",
      location: "https://esempio.cloudflareaccess.com@login.example.net/",
    },
    {
      label: "a longer host",
      location: "https://esempio.cloudflareaccess.com.example.net/",
    },
    {
      label: "a host without the dot",
      location: "https://evilcloudflareaccess.com/",
    },
    {
      label: "a protocol-relative url",
      location: "//login.example.net/accedi",
    },
  ])("check-access: exit 78 on a redirect to $label", async ({ location }) => {
    server.use(
      http.get(
        `https://${HOST}/`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: location },
          }),
      ),
      http.get(`https://${HOST}/api/measures`, toAccessLogin),
    );
    expect(await main([], ENV)).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [
        "Access non attivo su /: risposta 302, atteso un redirect al login di Access (*.cloudflareaccess.com)",
      ],
    ]);
    expect(output()).not.toContain(location);
  });

  it("check-access: exit 78 on a 200 that carries a login location", async () => {
    server.use(
      http.get(
        `https://${HOST}/`,
        () =>
          new HttpResponse(null, { status: 200, headers: { Location: LOGIN } }),
      ),
      http.get(`https://${HOST}/api/measures`, toAccessLogin),
    );
    expect(await main([], ENV)).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [
        "Access non attivo su /: risposta 200, atteso un redirect al login di Access (*.cloudflareaccess.com)",
      ],
    ]);
  });

  /** Access come da documentazione: con `X-Requested-With` e senza sessione risponde 401. */
  const apiAnswering = (xhrStatus: number) =>
    http.get(`https://${HOST}/api/measures`, ({ request }) => {
      if (request.headers.get("cookie") !== null) {
        return HttpResponse.text("richiesta con cookie", { status: 500 });
      }
      if (request.headers.get("x-requested-with") !== "XMLHttpRequest") {
        return toAccessLogin();
      }
      return xhrStatus === 302
        ? toAccessLogin()
        : new HttpResponse(null, { status: xhrStatus });
    });

  it("check-access: --after-deploy also wants 401 for an xhr request", async () => {
    server.use(http.get(`https://${HOST}/`, toAccessLogin), apiAnswering(401));
    expect(await main(["--after-deploy"], ENV)).toBe(0);
    expect(stderr.mock.calls).toEqual([
      [
        "Access attivo: / e /api/measures reindirizzano al login di Access, anche su pages.dev; /api/measures con X-Requested-With risponde 401",
      ],
    ]);
  });

  it.each([{ xhrStatus: 302 }, { xhrStatus: 200 }, { xhrStatus: 403 }])(
    "check-access: --after-deploy exit 78 when the xhr request answers $xhrStatus",
    async ({ xhrStatus }) => {
      server.use(
        http.get(`https://${HOST}/`, toAccessLogin),
        apiAnswering(xhrStatus),
      );
      expect(await main(["--after-deploy"], ENV)).toBe(78);
      expect(stderr.mock.calls).toEqual([
        [
          `GET /api/measures con X-Requested-With: risposta ${xhrStatus}, attesa 401. Il deploy è avvenuto e i dati restano protetti, ma con la sessione scaduta la dashboard mostrerà un errore invece di ricaricarsi (docs/dashboard.md, «Se il deploy fallisce»)`,
        ],
      ]);
      expect(output()).not.toContain(HOST);
    },
  );

  it("check-access: --after-deploy re-checks the redirects before the xhr request", async () => {
    const xhrHeaders: string[] = [];
    server.events.on("request:start", ({ request }) => {
      xhrHeaders.push(request.headers.get("x-requested-with") ?? "-");
    });
    server.use(
      http.get(`https://${HOST}/`, () => HttpResponse.text("<!doctype html>")),
      apiAnswering(401),
    );
    expect(await main(["--after-deploy"], ENV)).toBe(78);
    server.events.removeAllListeners();
    expect(stderr.mock.calls).toEqual([
      [
        "Access non attivo su /: risposta 200, atteso un redirect al login di Access (*.cloudflareaccess.com)",
      ],
    ]);
    expect(xhrHeaders).not.toContain("XMLHttpRequest");
  });

  it("check-access: without --after-deploy no xhr request is made", async () => {
    const requests: string[] = [];
    server.events.on("request:start", ({ request }) => {
      requests.push(request.headers.get("x-requested-with") ?? "-");
    });
    server.use(http.get(`https://${HOST}/`, toAccessLogin), apiAnswering(302));
    expect(await main([], ENV)).toBe(0);
    server.events.removeAllListeners();
    expect(requests).toEqual(["-", "-", "-", "-"]);
  });

  it.each([{ argv: ["--after"] }, { argv: ["--after-deploy", "extra"] }])(
    "check-access: exit 64 with arguments $argv",
    async ({ argv }) => {
      expect(await main(argv, ENV)).toBe(64);
      expect(stderr.mock.calls).toEqual([
        ["Uso: check-access [--after-deploy]"],
      ]);
    },
  );

  it.each<{ label: string; env: Record<string, string> }>([
    { label: "missing", env: { PAGES_HOSTNAME: PAGES_DEV } },
    // GitHub Actions passa un segreto non definito come stringa vuota.
    { label: "empty", env: { ...ENV, DASHBOARD_HOSTNAME: "" } },
    { label: "a url", env: { ...ENV, DASHBOARD_HOSTNAME: `https://${HOST}` } },
    {
      label: "with a path",
      env: { ...ENV, DASHBOARD_HOSTNAME: `${HOST}/api` },
    },
    {
      label: "with a trailing slash",
      env: { ...ENV, DASHBOARD_HOSTNAME: `${HOST}/` },
    },
    {
      label: "with a port",
      env: { ...ENV, DASHBOARD_HOSTNAME: `${HOST}:8443` },
    },
    {
      label: "with http://",
      env: { ...ENV, DASHBOARD_HOSTNAME: `http://${HOST}` },
    },
    { label: "with spaces", env: { ...ENV, DASHBOARD_HOSTNAME: ` ${HOST}\n` } },
  ])(
    "check-access: exit 78 when DASHBOARD_HOSTNAME is $label",
    async ({ env }) => {
      // Nessun handler per l'host: una sua richiesta farebbe fallire il test (onUnhandledRequest).
      expect(await main([], env)).toBe(78);
      expect(stderr.mock.calls).toEqual([
        [
          "DASHBOARD_HOSTNAME mancante o non valido: serve il solo nome host, senza https://, percorso o spazi",
        ],
      ]);
      expect(output()).not.toContain(HOST);
    },
  );

  it.each<{ label: string; env: Record<string, string> }>([
    { label: "missing", env: { DASHBOARD_HOSTNAME: HOST } },
    { label: "empty", env: { ...ENV, PAGES_HOSTNAME: "" } },
    { label: "a url", env: { ...ENV, PAGES_HOSTNAME: `https://${PAGES_DEV}` } },
    {
      label: "with a trailing slash",
      env: { ...ENV, PAGES_HOSTNAME: `${PAGES_DEV}/` },
    },
    {
      label: "with spaces",
      env: { ...ENV, PAGES_HOSTNAME: ` ${PAGES_DEV}\n` },
    },
    {
      label: "not on pages.dev",
      env: { ...ENV, PAGES_HOSTNAME: "progetto-di-prova.example.net" },
    },
    { label: "pages.dev itself", env: { ...ENV, PAGES_HOSTNAME: "pages.dev" } },
    {
      label: "a look-alike",
      env: { ...ENV, PAGES_HOSTNAME: `${PAGES_DEV}.example.net` },
    },
    {
      label: "without the dot",
      env: { ...ENV, PAGES_HOSTNAME: "progetto-di-provapages.dev" },
    },
    // Un alias di anteprima passa dall'applicazione Access delle anteprime, non da quella di
    // produzione: il controllo non direbbe nulla sul dominio di produzione.
    {
      label: "a preview alias",
      env: { ...ENV, PAGES_HOSTNAME: `abc123.${PAGES_DEV}` },
    },
  ])("check-access: exit 78 when PAGES_HOSTNAME is $label", async ({ env }) => {
    // Nessun handler per l'host della dashboard: nessuna richiesta deve partire.
    expect(await main([], env)).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [
        "PAGES_HOSTNAME mancante o non valido: serve il solo nome host <sottodominio>.pages.dev del progetto, senza https://, percorso o spazi",
      ],
    ]);
    expect(output()).not.toContain("progetto-di-prova");
    expect(output()).not.toContain(HOST);
  });

  it("check-access: exit 75 on a network error, without printing it", async () => {
    // Come l'errore di undici con un DNS che non risponde: messaggio e causa nominano l'host.
    const failingFetch = async (): Promise<Response> => {
      throw new TypeError(`fetch failed for ${HOST}`, {
        cause: new Error(`getaddrinfo ENOTFOUND ${HOST}`),
      });
    };
    expect(await main([], ENV, { fetch: failingFetch })).toBe(75);
    expect(stderr.mock.calls).toEqual([
      [
        "Richiesta a / non riuscita: errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS)",
      ],
    ]);
    expect(output()).not.toContain(HOST);
  });

  it.each([{ name: "TimeoutError" }, { name: "AbortError" }])(
    "check-access: exit 75 when fetch rejects with $name",
    async ({ name }) => {
      const abortedFetch = async (): Promise<Response> => {
        throw new DOMException(`richiesta a ${HOST} interrotta`, name);
      };
      expect(await main([], ENV, { fetch: abortedFetch })).toBe(75);
      expect(stderr.mock.calls).toEqual([
        [
          "Richiesta a / non riuscita: errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS)",
        ],
      ]);
      expect(output()).not.toContain(HOST);
    },
  );

  it("check-access: every request has a 15 s timeout of its own", async () => {
    // Un segnale nuovo, non scaduto, per ogni chiamata: ogni richiesta deve avere il suo.
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => new AbortController().signal);
    const signals: (AbortSignal | null | undefined)[] = [];
    // Risponde come Access: 401 alla richiesta con X-Requested-With, altrimenti il redirect.
    const accessLikeFetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      signals.push(init?.signal);
      const xhr = new Headers(init?.headers).get("x-requested-with");
      return xhr === "XMLHttpRequest"
        ? new Response(null, { status: 401 })
        : toAccessLogin();
    };
    expect(
      await main(["--after-deploy"], ENV, { fetch: accessLikeFetch }),
    ).toBe(0);
    // 2 percorsi × 2 host, più la richiesta con X-Requested-With.
    expect(timeout.mock.calls).toEqual([
      [15_000],
      [15_000],
      [15_000],
      [15_000],
      [15_000],
    ]);
    expect(signals).toEqual(timeout.mock.results.map((r) => r.value));
    expect(new Set(signals).size).toBe(5);
  });

  it("check-access: exit 75 when a request times out", async () => {
    // Il segnale scaduto sostituisce l'attesa vera: fetch fallisce come al timeout di 15 s.
    const expired = AbortSignal.abort(
      new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      ),
    );
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(expired);
    const signals: (AbortSignal | null | undefined)[] = [];
    // Come fetch: con un segnale già scaduto rifiuta con il suo motivo.
    const honouringFetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      signals.push(init?.signal);
      if (init?.signal?.aborted) throw init.signal.reason;
      return toAccessLogin();
    };
    expect(await main([], ENV, { fetch: honouringFetch })).toBe(75);
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(signals).toEqual([expired]);
    expect(stderr.mock.calls).toEqual([
      [
        "Richiesta a / non riuscita: errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS)",
      ],
    ]);
  });

  it("check-access: exit 70 on an unexpected error, printing only its name", async () => {
    // Il messaggio potrebbe contenere l'URL: nel log pubblico va solo il nome dell'errore.
    const buggyFetch = async (): Promise<Response> => {
      throw new RangeError(`valore inatteso per https://${HOST}/`);
    };
    expect(await main([], ENV, { fetch: buggyFetch })).toBe(70);
    expect(stderr.mock.calls).toEqual([
      ["Controllo di Access non riuscito: errore inatteso (RangeError)"],
    ]);
    expect(output()).not.toContain(HOST);
  });

  it("check-access: a TypeError without a cause is not a network error (exit 70)", async () => {
    // Un errore di programmazione nel fetch iniettato: undici, per la rete, mette sempre la causa.
    const buggyFetch = async (): Promise<Response> => {
      throw new TypeError(`undefined is not a function (https://${HOST}/)`);
    };
    expect(await main([], ENV, { fetch: buggyFetch })).toBe(70);
    expect(stderr.mock.calls).toEqual([
      ["Controllo di Access non riuscito: errore inatteso (TypeError)"],
    ]);
    expect(output()).not.toContain(HOST);
  });

  it("check-access: exit 75 when the request errors (MSW network error)", async () => {
    server.use(
      http.get(`https://${HOST}/`, toAccessLogin),
      http.get(`https://${HOST}/api/measures`, () => HttpResponse.error()),
    );
    expect(await main([], ENV)).toBe(75);
    expect(stderr.mock.calls).toEqual([
      [
        "Richiesta a /api/measures non riuscita: errore di rete o timeout (rilanciare; se si ripete, controllare dominio e DNS)",
      ],
    ]);
  });

  it.each<{ label: string; headers: Record<string, string> }>([
    // `new URL` lo rifiuta: il suo errore riporterebbe input e base, cioè l'hostname.
    { label: "an unparseable location", headers: { Location: "https://[" } },
    { label: "no location", headers: {} },
  ])("check-access: exit 78 on a redirect with $label", async ({ headers }) => {
    server.use(
      http.get(
        `https://${HOST}/`,
        () => new HttpResponse(null, { status: 302, headers }),
      ),
      http.get(`https://${HOST}/api/measures`, toAccessLogin),
    );
    expect(await main([], ENV)).toBe(78);
    expect(stderr.mock.calls).toEqual([
      [
        "Access non attivo su /: risposta 302, atteso un redirect al login di Access (*.cloudflareaccess.com)",
      ],
    ]);
  });
});
