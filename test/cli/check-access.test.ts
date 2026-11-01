import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/check-access";
import { setupMswServer } from "../msw";

// Valori fittizi: hostname della dashboard e team di Access inventati, nessuna rete (MSW).
const HOST = "dashboard.example.com";
const ENV = { DASHBOARD_HOSTNAME: HOST };
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
      ["Access attivo: / e /api/measures reindirizzano al login di Access"],
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
        "Access attivo: / e /api/measures reindirizzano al login di Access; /api/measures con X-Requested-With risponde 401",
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
    expect(requests).toEqual(["-", "-"]);
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

  it.each([
    { label: "missing", env: {} },
    // GitHub Actions passa un segreto non definito come stringa vuota.
    { label: "empty", env: { DASHBOARD_HOSTNAME: "" } },
    { label: "a url", env: { DASHBOARD_HOSTNAME: `https://${HOST}` } },
    { label: "with a path", env: { DASHBOARD_HOSTNAME: `${HOST}/api` } },
    { label: "with a trailing slash", env: { DASHBOARD_HOSTNAME: `${HOST}/` } },
    { label: "with a port", env: { DASHBOARD_HOSTNAME: `${HOST}:8443` } },
    { label: "with http://", env: { DASHBOARD_HOSTNAME: `http://${HOST}` } },
    { label: "with spaces", env: { DASHBOARD_HOSTNAME: ` ${HOST}\n` } },
  ])(
    "check-access: exit 78 when DASHBOARD_HOSTNAME is $label",
    async ({ env }) => {
      // Nessun handler: una richiesta qualsiasi farebbe fallire il test (onUnhandledRequest).
      expect(await main([], env)).toBe(78);
      expect(stderr.mock.calls).toEqual([
        [
          "DASHBOARD_HOSTNAME mancante o non valido: serve il solo nome host, senza https://, percorso o spazi",
        ],
      ]);
      expect(output()).not.toContain(HOST);
    },
  );

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
