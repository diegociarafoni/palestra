import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  analyzePage,
  describeName,
  describeUrl,
  main,
  redact,
  type TraceOptions,
  traceLogin,
} from "../../scripts/trace-mywellness-login";
import { setupMswServer } from "../msw";

const server = setupMswServer();
const MW = "https://www.mywellness.com";
const TG = "https://www.technogym.com";
const FINE =
  "Fine: nel rapporto ci sono solo origini, percorsi con gli id mascherati, status, nomi e tipi; nessuna query, cookie, token o valore.";

describe("trace-mywellness-login: masking", () => {
  it("trace: keeps only origin and word-like path segments", () => {
    const url = new URL(
      "https://utente:segreto@www.technogym.com:8443/it-IT/account/login.aspx;jsessionid=ABC123/(S(abcdef123))/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln/aHR0cHM6Ly94LmV4YW1wbGUvP2U9bWFyaW9AZXhhbXBsZS5jb20=/AbCdEfGhIjKlMnOpQrSt/Xk9mPq2Lw8Rt5Vb3Nc7Z/11111111-2222-4333-8444-555555555555/mario%40rossi/2026/abcdefghijklmnopqrstuvwxyzabcdefghijklmno/v2/User/Login?token=t0k&x=1#frammento",
    );

    expect(describeUrl(url)).toBe(
      "https://www.technogym.com:8443/it-IT/account/login.aspx;<param>/<id>/<id>/<id>/<id>/<id>/<id>/<id>/<id>/<id>/v2/User/Login",
    );
  });

  it("trace: masks token-like parts of field and cookie names", () => {
    expect(
      [
        "__RequestVerificationToken",
        "ctl00$MainContent$Login1$UserName",
        ".AspNetCore.Antiforgery.9fXoN5jHCXs",
        "user[email]",
        "Input.Email",
        "g-recaptcha-response",
        "a1b2c3d4e5f6",
        "mario%40rossi",
      ].map(describeName),
    ).toEqual([
      "__RequestVerificationToken",
      "ctl00$MainContent$Login1$UserName",
      ".AspNetCore.Antiforgery.<id>",
      "user[email]",
      "Input.Email",
      "g-recaptcha-response",
      "<id>",
      "<id>",
    ]);
  });
});

// Pagina di login sintetica: valori, token e chiavi sono inventati e non devono uscire.
const LOGIN_PAGE = `<!doctype html><html><head>
<base href="/it-IT/">
<meta name="csrf-token" content="meta-segreto-1234">
<meta http-equiv="refresh" content="5; url=https://www.mywellness.com/cloud/Ritorno/(S(x1y2z3))?sid=segreto-q">
<script src="/static/app.js"></script>
<script>var t = '<form action="/in-script"><input name="nascosto"></form>'; window.location.href = "/altrove";</script>
</head><body>
<noscript>Abilita JavaScript</noscript>
<!-- <form action="/commento"><input name="commentato"></form> -->
<template><form action="/modello"><input name="modello"></form></template>
<a href="account/login?ReturnUrl=%2Fsegreto">Accedi</a>
<a href="https://pronext.mywellness.com/auth/login">Pro</a>
<a href="/it-IT/prodotti">Prodotti</a>
<a href="javascript:void(0)">Vuoto</a>
<form id="accesso" method="post" action="account/login?ReturnUrl=%2Fsegreto">
  <input type="hidden" name="__RequestVerificationToken" value="csrf-segreto-1">
  <input type="hidden" name="a1b2c3d4e5f6" value="x">
  <input type="email" name="Email" value="">
  <input type="password" name="Password">
  <input type="text" name="Legacy" disabled>
  <select name="Lingua"><option value="it">it</option></select>
  <input type="te st" name="Strano">
  <button type="submit" formaction="/altro" formmethod="get">Accedi</button>
</form>
<input form="accesso" type="hidden" name="Esterno" value="esterno-segreto">
<form><input name="q" type="search"></form>
<form action="http://[segreto" method="put"><textarea name="z"></textarea></form>
<div class="g-recaptcha" data-sitekey="chiave-segreta-1"></div>
<script src="https://www.google.com/recaptcha/enterprise.js"></script>
</body></html>`;

describe("trace-mywellness-login: page analysis", () => {
  it("trace: analyzes forms like a browser and reports names, never values", () => {
    const { report, secrets } = analyzePage(
      LOGIN_PAGE,
      new URL("https://www.technogym.com/it-IT/home"),
    );

    expect(report).toEqual({
      forms: [
        {
          method: "POST",
          action: "https://www.technogym.com/it-IT/account/login",
          fields: [
            {
              name: "__RequestVerificationToken",
              type: "hidden",
              disabled: false,
            },
            { name: "<id>", type: "hidden", disabled: false },
            { name: "Email", type: "email", disabled: false },
            { name: "Password", type: "password", disabled: false },
            { name: "Legacy", type: "text", disabled: true },
            { name: "Lingua", type: "select", disabled: false },
            { name: "Strano", type: "<tipo>", disabled: false },
          ],
          warnings: ["pulsante con formaction", "pulsante con formmethod"],
        },
        {
          method: "GET",
          action: "la pagina stessa",
          fields: [{ name: "q", type: "search", disabled: false }],
          warnings: [],
        },
        {
          method: "<metodo>",
          action: "action non valida",
          fields: [{ name: "z", type: "textarea", disabled: false }],
          warnings: [],
        },
      ],
      warnings: [
        "<base href> presente",
        "campi fuori dai form (attributo form)",
      ],
      protection: ["reCAPTCHA"],
      scripts: 3,
      noscript: true,
      scriptRedirect: true,
      csrfMeta: ["csrf-token"],
      refresh: "https://www.mywellness.com/cloud/Ritorno/<id>",
      loginLinks: [
        "https://www.technogym.com/it-IT/account/login",
        "https://pronext.mywellness.com/auth/login",
      ],
    });
    expect(JSON.stringify(report)).not.toMatch(/segret|chiave/);
    expect(secrets).toEqual(
      expect.arrayContaining([
        "csrf-segreto-1",
        "esterno-segreto",
        "meta-segreto-1234",
        "/segreto",
        "segreto-q",
      ]),
    );
  });

  it("trace: recognizes captcha and anti-bot challenges by their markers", () => {
    const cases: [string, string[]][] = [
      [
        '<script src="https://www.google.com/recaptcha/enterprise.js"></script>',
        ["reCAPTCHA"],
      ],
      [
        '<script src="https://js.hcaptcha.com/1/api.js"></script>',
        ["hCaptcha"],
      ],
      ['<div class="cf-turnstile"></div>', ["Cloudflare Turnstile"]],
      ["<script>window._cf_chl_opt={};</script>", ["sfida Cloudflare"]],
      [
        '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/x.js"></script>',
        ["sfida Cloudflare"],
      ],
      [
        '<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>',
        ["DataDome"],
      ],
      ['<div id="px-captcha"></div>', ["PerimeterX"]],
      ['<script src="/_Incapsula_Resource?x=1"></script>', ["Imperva"]],
      [
        '<script src="https://x.token.awswaf.com/challenge.js"></script>',
        ["AWS WAF"],
      ],
      [
        '<script src="/_sec/cp_challenge/ak-challenge-4-3.js"></script>',
        ["Akamai"],
      ],
      [
        '<script src="https://client-api.arkoselabs.com/v2/api.js"></script>',
        ["Arkose"],
      ],
      ['<div class="frc-captcha"></div>', ["Friendly Captcha"]],
      ['<img src="/Captcha/Image">', ["captcha non identificato"]],
      ["<p>Benvenuto</p>", []],
    ];

    for (const [html, expected] of cases) {
      expect(
        analyzePage(html, new URL("https://www.technogym.com/")).report
          .protection,
        html,
      ).toEqual(expected);
    }
  });

  it("trace: reports a refresh to the same page, ignores unrelated meta and caps the links", () => {
    const links = Array.from(
      { length: 12 },
      (_, i) => `<a href="/account/voce-${"abcdefghijkl"[i]}">x</a>`,
    ).join("");
    const { report } = analyzePage(
      `<meta http-equiv="Refresh" content="5"><meta name="google-site-verification" content="verifica-segreta">${links}`,
      new URL("https://www.technogym.com/"),
    );

    expect(report.refresh).toBe("la pagina stessa");
    expect(report.csrfMeta).toEqual([]);
    expect(report.loginLinks).toEqual([
      "https://www.technogym.com/account/voce-a",
      "https://www.technogym.com/account/voce-b",
      "https://www.technogym.com/account/voce-c",
      "https://www.technogym.com/account/voce-d",
      "https://www.technogym.com/account/voce-e",
      "https://www.technogym.com/account/voce-f",
      "https://www.technogym.com/account/voce-g",
      "https://www.technogym.com/account/voce-h",
      "https://www.technogym.com/account/voce-i",
      "https://www.technogym.com/account/voce-j",
      "(altri 2)",
    ]);
    expect(
      analyzePage(
        '<meta http-equiv="refresh" content="0; url=http://[segreto">',
        new URL("https://www.technogym.com/"),
      ).report.refresh,
    ).toBe("destinazione non valida");
  });
});

type Sent = { url: string; cookie: string | null };

/** fetch di Node che registra URL e Cookie inviati dal client (MSW aggiunge i propri). */
function recordingFetch(sent: Sent[]): typeof fetch {
  return (input, init) => {
    const url = new URL(String(input));
    sent.push({
      url: url.origin + url.pathname,
      cookie: new Headers(init?.headers).get("cookie"),
    });
    return fetch(input, init);
  };
}

const noSleep = async () => {};

function run(argv: string[], opts: Pick<TraceOptions, "fetch"> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, {
    fetch: opts.fetch,
    sleep: noSleep,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return code.then((exit) => ({ exit, out, err }));
}

const SIMPLE_LOGIN = `<html><head>
<meta name="__RequestVerificationToken" content="meta-segreto-1">
<script src="/app.js"></script></head><body>
<form method="post" action="/it-IT/account/login?ReturnUrl=segreto-q">
<input type="hidden" name="__RequestVerificationToken" value="csrf-segreto-1">
<input type="email" name="Email"><input type="password" name="Password">
<button type="submit">Accedi</button></form>
<a href="/it-IT/account/register">Registrati</a></body></html>`;

describe("trace-mywellness-login: chain", () => {
  it("trace: follows the default chain on listed hosts and prints names only", async () => {
    server.use(
      http.get(
        `${MW}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: [
              ["Location", `${TG}/it-IT/account/login?ReturnUrl=segreto-q`],
              ["Set-Cookie", "ASP.NET_SessionId=cookie-segreto-mw; path=/"],
            ],
          }),
      ),
      http.get(`${TG}/it-IT/account/login`, () =>
        HttpResponse.html(SIMPLE_LOGIN, {
          headers: { "Set-Cookie": "XSRF-TOKEN=cookie-segreto-tg; path=/" },
        }),
      ),
    );
    const sent: Sent[] = [];

    const { exit, out, err } = await run([], { fetch: recordingFetch(sent) });

    expect(out).toEqual([
      "Catena 1: https://www.mywellness.com/cloud/User/Login",
      "  1. GET https://www.mywellness.com/cloud/User/Login → 302 · cookie: ASP.NET_SessionId · verso https://www.technogym.com/it-IT/account/login",
      "  2. GET https://www.technogym.com/it-IT/account/login → 200 text/html · cookie: XSRF-TOKEN",
      "  Protezione: nessun segno",
      "  Pagina: form 1 · script 1 · noscript: no · redirect da script: no",
      "  Meta anti-CSRF: __RequestVerificationToken",
      "  Form 1: POST https://www.technogym.com/it-IT/account/login · campi: __RequestVerificationToken (hidden), Email (email), Password (password)",
      "  Link di accesso: https://www.technogym.com/it-IT/account/register",
      FINE,
    ]);
    expect(exit).toBe(0);
    expect(err).toEqual([]);
    expect(sent.map((request) => request.url)).toEqual([
      "https://www.mywellness.com/cloud/User/Login",
      "https://www.technogym.com/it-IT/account/login",
    ]);
  });

  it("trace: sends each cookie back only to the origin that set it", async () => {
    server.use(
      http.get(
        `${MW}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: [
              ["Location", `${TG}/it-IT/`],
              ["Set-Cookie", "mw=cookie-segreto-mw; path=/"],
            ],
          }),
      ),
      http.get(
        `${TG}/it-IT/`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: [
              ["Location", `${MW}/cloud/`],
              ["Set-Cookie", "tg=cookie-segreto-tg; path=/"],
            ],
          }),
      ),
      http.get(`${MW}/cloud/`, () => HttpResponse.text("ok")),
    );
    const sent: Sent[] = [];

    await traceLogin({ fetch: recordingFetch(sent), sleep: noSleep });

    expect(sent).toEqual([
      { url: "https://www.mywellness.com/cloud/User/Login", cookie: null },
      { url: "https://www.technogym.com/it-IT/", cookie: null },
      {
        url: "https://www.mywellness.com/cloud/",
        cookie: "mw=cookie-segreto-mw",
      },
    ]);
  });

  it("trace: stops before off-list, non-HTTPS or invalid destinations without contacting them", async () => {
    const redirect = (location: string) => () =>
      new HttpResponse(null, { status: 302, headers: { Location: location } });
    server.use(
      http.get(`${MW}/a`, redirect("https://login.altro.example/x/1234")),
      http.get(`${MW}/b`, redirect("http://www.technogym.com/y")),
      http.get(`${MW}/c`, redirect("data:text/html,segreto")),
      http.get(`${MW}/d`, redirect("http://[segreto")),
      http.get(
        `${MW}/e`,
        redirect("https://utente:segreto@www.technogym.com/z"),
      ),
    );
    const sent: Sent[] = [];

    const result = await traceLogin({
      starts: ["a", "b", "c", "d", "e"].map((path) => new URL(`${MW}/${path}`)),
      fetch: recordingFetch(sent),
      sleep: noSleep,
    });

    expect(result.lines).toEqual([
      "Catena 1: https://www.mywellness.com/a",
      "  1. GET https://www.mywellness.com/a → 302 · cookie: nessuno · verso https://login.altro.example/x/<id>",
      "  Fermo: https://login.altro.example non è nell'elenco degli host",
      "Catena 2: https://www.mywellness.com/b",
      "  1. GET https://www.mywellness.com/b → 302 · cookie: nessuno · verso http://www.technogym.com/y",
      "  Fermo: http: non è HTTPS",
      "Catena 3: https://www.mywellness.com/c",
      "  1. GET https://www.mywellness.com/c → 302 · cookie: nessuno · verso schema data: non ammesso",
      "  Fermo: data: non è HTTPS",
      "Catena 4: https://www.mywellness.com/d",
      "  1. GET https://www.mywellness.com/d → 302 · cookie: nessuno · destinazione non valida",
      "Catena 5: https://www.mywellness.com/e",
      "  1. GET https://www.mywellness.com/e → 302 · cookie: nessuno · verso https://www.technogym.com/z",
      "  Fermo: l'URL contiene credenziali",
    ]);
    expect(result.networkError).toBe(false);
    expect(sent.map((request) => request.url)).toEqual([
      "https://www.mywellness.com/a",
      "https://www.mywellness.com/b",
      "https://www.mywellness.com/c",
      "https://www.mywellness.com/d",
      "https://www.mywellness.com/e",
    ]);
  });

  it("trace: reports 401, 403 challenges, 429 and 5xx once, without retrying", async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${TG}/bloccato`, () => {
        calls.push("bloccato");
        return HttpResponse.html(
          "<html><script>window._cf_chl_opt={cRay:'segreto'};</script></html>",
          {
            status: 403,
            headers: { "cf-mitigated": "challenge", Server: "cloudflare" },
          },
        );
      }),
      http.get(`${MW}/negato`, () => {
        calls.push("negato");
        return new HttpResponse(null, { status: 401 });
      }),
      http.get(`${MW}/limite`, () => {
        calls.push("limite");
        return HttpResponse.text("troppe richieste", { status: 429 });
      }),
      http.get(`${MW}/guasto`, () => {
        calls.push("guasto");
        return new HttpResponse(null, { status: 503 });
      }),
    );

    const result = await traceLogin({
      starts: [
        new URL(`${TG}/bloccato`),
        new URL(`${MW}/negato`),
        new URL(`${MW}/limite`),
        new URL(`${MW}/guasto`),
      ],
      sleep: noSleep,
    });

    expect(result.lines).toEqual([
      "Catena 1: https://www.technogym.com/bloccato",
      "  1. GET https://www.technogym.com/bloccato → 403 text/html · cookie: nessuno",
      "  Protezione: sfida Cloudflare (cf-mitigated), blocco Cloudflare, sfida Cloudflare",
      "  Pagina: form 0 · script 1 · noscript: no · redirect da script: no",
      "Catena 2: https://www.mywellness.com/negato",
      "  1. GET https://www.mywellness.com/negato → 401 senza tipo · cookie: nessuno",
      "  Protezione: nessun segno",
      "Catena 3: https://www.mywellness.com/limite",
      "  1. GET https://www.mywellness.com/limite → 429 text/plain · cookie: nessuno",
      "  Protezione: nessun segno",
      "Catena 4: https://www.mywellness.com/guasto",
      "  1. GET https://www.mywellness.com/guasto → 503 senza tipo · cookie: nessuno",
      "  Protezione: nessun segno",
    ]);
    expect(calls).toEqual(["bloccato", "negato", "limite", "guasto"]);
  });

  it("trace: stops after ten redirects and on a 3xx without Location", async () => {
    server.use(
      http.get(
        `${MW}/giro`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: "/giro" },
          }),
      ),
      http.get(`${MW}/vuoto`, () => new HttpResponse(null, { status: 302 })),
    );

    const result = await traceLogin({
      starts: [new URL(`${MW}/giro`), new URL(`${MW}/vuoto`)],
      sleep: noSleep,
    });

    const hop = (n: number) =>
      `  ${n}. GET https://www.mywellness.com/giro → 302 · cookie: nessuno · verso https://www.mywellness.com/giro`;
    expect(result.lines).toEqual([
      "Catena 1: https://www.mywellness.com/giro",
      hop(1),
      hop(2),
      hop(3),
      hop(4),
      hop(5),
      hop(6),
      hop(7),
      hop(8),
      hop(9),
      hop(10),
      "  Fermo: più di 10 redirect",
      "Catena 2: https://www.mywellness.com/vuoto",
      "  1. GET https://www.mywellness.com/vuoto → 302 senza tipo · cookie: nessuno",
      "  Protezione: nessun segno",
    ]);
  });

  it("trace: recognizes anti-bot headers and odd content types", async () => {
    const respond = (status: number, headers: Record<string, string>) => () =>
      new HttpResponse(null, { status, headers });
    server.use(
      http.get(`${MW}/h1`, respond(403, { "x-datadome": "protected" })),
      http.get(`${MW}/h2`, respond(405, { "x-amzn-waf-action": "captcha" })),
      http.get(`${MW}/h3`, respond(200, { "x-iinfo": "1-2-3" })),
      http.get(`${MW}/h4`, respond(403, { Server: "AkamaiGHost" })),
      http.get(`${MW}/h5`, respond(200, { Server: "cloudflare" })),
      http.get(`${MW}/h6`, respond(200, { "Content-Type": "segreto strano" })),
    );

    const result = await traceLogin({
      starts: ["h1", "h2", "h3", "h4", "h5", "h6"].map(
        (path) => new URL(`${MW}/${path}?q=valore-query-segreto`),
      ),
      sleep: noSleep,
    });

    expect(result.lines.filter((line) => line.startsWith("  "))).toEqual([
      "  1. GET https://www.mywellness.com/h1 → 403 senza tipo · cookie: nessuno",
      "  Protezione: DataDome",
      "  1. GET https://www.mywellness.com/h2 → 405 senza tipo · cookie: nessuno",
      "  Protezione: AWS WAF",
      "  1. GET https://www.mywellness.com/h3 → 200 senza tipo · cookie: nessuno",
      "  Protezione: Imperva",
      "  1. GET https://www.mywellness.com/h4 → 403 senza tipo · cookie: nessuno",
      "  Protezione: blocco Akamai",
      "  1. GET https://www.mywellness.com/h5 → 200 senza tipo · cookie: nessuno",
      "  Protezione: nessun segno",
      "  1. GET https://www.mywellness.com/h6 → 200 <tipo> · cookie: nessuno",
      "  Protezione: nessun segno",
    ]);
    expect(result.secrets).toContain("valore-query-segreto");
  });

  it("trace: names a network error without its message, also when it is not an Error", async () => {
    const result = await traceLogin({
      fetch: async () => {
        throw "errore segreto";
      },
      sleep: noSleep,
    });

    expect(result.lines).toEqual([
      "Catena 1: https://www.mywellness.com/cloud/User/Login",
      "  1. GET https://www.mywellness.com/cloud/User/Login → errore di rete (errore)",
    ]);
    expect(result.networkError).toBe(true);
  });

  it("trace: waits between requests", async () => {
    server.use(
      http.get(
        `${MW}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: "/fine" },
          }),
      ),
      http.get(`${MW}/fine`, () => HttpResponse.text("ok")),
    );
    const waits: number[] = [];

    await traceLogin({
      sleep: async (ms) => {
        waits.push(ms);
      },
      minIntervalMs: 1000,
    });

    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(900);
    expect(waits[0]).toBeLessThanOrEqual(1000);
  });
});

describe("trace-mywellness-login: report and exit codes", () => {
  it("trace: redacts seen values, also URL-encoded, and counts them", () => {
    expect(
      redact(
        [
          "verso https://www.technogym.com/valoresegreto/login",
          "nome: valore%20segreto",
          "corto: abc",
        ],
        ["valoresegreto", "valore segreto", "abc"],
      ),
    ).toEqual({
      lines: [
        "verso https://www.technogym.com/<REDACTED>/login",
        "nome: <REDACTED>",
        "corto: abc",
      ],
      count: 2,
    });
  });

  it("trace: prints the redaction count when a seen value reaches the report", async () => {
    server.use(
      http.get(
        `${MW}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: [
              ["Location", `${TG}/valoresegreto/login`],
              ["Set-Cookie", "sid=valoresegreto; path=/"],
            ],
          }),
      ),
      http.get(`${TG}/valoresegreto/login`, () => HttpResponse.text("ok")),
    );

    const { exit, out } = await run([]);

    expect(out).toEqual([
      "Catena 1: https://www.mywellness.com/cloud/User/Login",
      "  1. GET https://www.mywellness.com/cloud/User/Login → 302 · cookie: sid · verso https://www.technogym.com/<REDACTED>/login",
      "  2. GET https://www.technogym.com/<REDACTED>/login → 200 text/plain · cookie: nessuno",
      "  Protezione: nessun segno",
      "Valori oscurati: 2",
      FINE,
    ]);
    expect(exit).toBe(0);
  });

  it("trace: a network error prints the report and exits 69", async () => {
    const failing: typeof fetch = async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("getaddrinfo segreto"), {
          code: "ENOTFOUND",
        }),
      });
    };

    const { exit, out } = await run([], { fetch: failing });

    expect(out).toEqual([
      "Catena 1: https://www.mywellness.com/cloud/User/Login",
      "  1. GET https://www.mywellness.com/cloud/User/Login → errore di rete (TypeError, ENOTFOUND)",
      FINE,
    ]);
    expect(exit).toBe(69);
  });

  it("trace: rejects bad arguments with 64 before any request", async () => {
    for (const argv of [
      ["--login"],
      ["--allow-host"],
      ["--allow-host", "evil.example"],
      ["--allow-host", "technogym.com.evil.example"],
      ["--start", "http://www.mywellness.com/cloud/User/Login"],
      ["--start", "https://altro.example/login"],
      ["--start", "non-un-url"],
      ["--start", "https://utente:segreto@www.mywellness.com/cloud/User/Login"],
    ]) {
      const { exit, out, err } = await run(argv);
      expect(exit, argv.join(" ")).toBe(64);
      expect(out).toEqual([]);
      expect(err).toEqual([
        "Uso: npx tsx scripts/trace-mywellness-login.ts [--allow-host HOST.technogym.com|HOST.mywellness.com]... [--start URL_HTTPS]...",
      ]);
    }
  });

  it("trace: --allow-host admits a verified subdomain as host and start", async () => {
    server.use(
      http.get("https://accounts.technogym.com/it-IT/login", () =>
        HttpResponse.text("ok"),
      ),
    );

    const { exit, out } = await run([
      "--allow-host",
      "accounts.technogym.com",
      "--start",
      "https://accounts.technogym.com/it-IT/login",
    ]);

    expect(out).toEqual([
      "Catena 1: https://accounts.technogym.com/it-IT/login",
      "  1. GET https://accounts.technogym.com/it-IT/login → 200 text/plain · cookie: nessuno",
      "  Protezione: nessun segno",
      FINE,
    ]);
    expect(exit).toBe(0);
  });
});
