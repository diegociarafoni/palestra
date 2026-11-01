import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  analyzePage,
  describeUrl,
  findLeaks,
  main,
  type TraceOptions,
  traceLogin,
} from "../../scripts/trace-mywellness-login";
import { setupMswServer } from "../msw";

const server = setupMswServer();
const MW = "https://www.mywellness.com";
const TG = "https://www.technogym.com";

/** fetch di Node che registra origine e percorso delle richieste (MSW intercetta comunque). */
function recordingFetch(contacted: string[]): typeof fetch {
  return (input, init) => {
    const url = new URL(String(input));
    contacted.push(url.origin + url.pathname);
    return fetch(input, init);
  };
}

// Pagina di login sintetica: valori e token sono inventati e non devono uscire dall'analisi.
const LOGIN_PAGE = `<!doctype html><html><head>
<script src="/static/app.js"></script><script>window.cfg = {};</script>
</head><body>
<noscript>Abilita JavaScript</noscript>
<a href="/it/account/login?ReturnUrl=%2Fsegreto">Accedi</a>
<a href="https://www.mywellness.com/cloud/">Mywellness</a>
<a href="/it/prodotti">Prodotti</a>
<form method="post" action="/it/account/login?ReturnUrl=%2Fsegreto">
  <input type="hidden" name="__RequestVerificationToken" value="csrf-segreto-1">
  <input type="hidden" name="returnUrl" value="/valore-segreto?a=1&amp;b=2">
  <input type="email" name="Email" value="">
  <input type="password" name="Password">
  <input type="checkbox" name="RememberMe" value="true">
  <button type="submit" name="action" value="login">Accedi</button>
</form>
<form action="/newsletter"><input name="mail" type="text"></form>
<div class="g-recaptcha" data-sitekey="chiave-segreta"></div>
</body></html>`;

describe("trace-mywellness-login", () => {
  it("trace: describes a url with origin and masked path only", () => {
    const url = new URL(
      "https://utente:segreto@account.example.com:8443/it/conto/11111111-2222-4333-8444-555555555555/sessione;jsessionid=ABC123/1234567/abcdefABCDEF0123456789xyz?token=t0k&x=1#frammento",
    );

    expect(describeUrl(url)).toBe(
      "https://account.example.com:8443/it/conto/<id>/sessione;<param>/<id>/<id>",
    );
  });

  it("trace: analyzes forms, captcha, scripts and login links by name only", () => {
    const report = analyzePage(
      LOGIN_PAGE,
      new URL("https://www.technogym.com/it/"),
    );

    expect(report).toEqual({
      forms: [
        {
          method: "POST",
          action: "https://www.technogym.com/it/account/login",
          fields: [
            { name: "__RequestVerificationToken", type: "hidden" },
            { name: "returnUrl", type: "hidden" },
            { name: "Email", type: "email" },
            { name: "Password", type: "password" },
            { name: "RememberMe", type: "checkbox" },
            { name: "action", type: "submit" },
          ],
        },
        {
          method: "GET",
          action: "https://www.technogym.com/newsletter",
          fields: [{ name: "mail", type: "text" }],
        },
      ],
      captcha: ["recaptcha"],
      scripts: 2,
      noscript: true,
      loginLinks: [
        "https://www.technogym.com/it/account/login",
        "https://www.mywellness.com/cloud/",
      ],
    });
    expect(JSON.stringify(report)).not.toMatch(/segret/);
  });

  it("trace: anonymous run follows listed hosts only and describes the final pages", async () => {
    server.use(
      http.get(
        `${MW}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: `${TG}/it/?ReturnUrl=segreto-q` },
          }),
      ),
      http.get(`${TG}/it/`, () =>
        HttpResponse.html(LOGIN_PAGE, {
          headers: { "Set-Cookie": "tg=cookie-segreto; path=/" },
        }),
      ),
      http.get(
        `${MW}/`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: "https://login.altro.example/x/1234" },
          }),
      ),
    );
    const contacted: string[] = [];

    const result = await traceLogin({
      fetch: recordingFetch(contacted),
      sleep: async () => {},
    });

    expect(result.lines).toEqual([
      "Catena 1: https://www.mywellness.com/cloud/User/Login",
      "  1. GET https://www.mywellness.com/cloud/User/Login → 302, cookie impostati 0, verso https://www.technogym.com/it/",
      "  2. GET https://www.technogym.com/it/ → 200 text/html, cookie impostati 1",
      "  Pagina: form 2 (con password 1) · captcha: recaptcha · script 2 · noscript: sì",
      "  Form 1: POST https://www.technogym.com/it/account/login · campi: __RequestVerificationToken (hidden), returnUrl (hidden), Email (email), Password (password), RememberMe (checkbox), action (submit)",
      "  Form 2: GET https://www.technogym.com/newsletter · campi: mail (text)",
      "  Link di accesso: https://www.technogym.com/it/account/login, https://www.mywellness.com/cloud/",
      "Catena 2: https://www.mywellness.com/",
      "  1. GET https://www.mywellness.com/ → 302, cookie impostati 0, verso https://login.altro.example/x/<id>",
      "  Fermo: https://login.altro.example non è nell'elenco degli host (aggiungerlo con --allow-host solo dopo averlo verificato)",
    ]);
    expect(
      contacted.filter((url) => url.startsWith("https://login.altro.example")),
    ).toEqual([]);
    expect(result.lines.join("\n")).not.toMatch(/segret/);
  });

  it("trace: login posts only to the form action, keeps cookies per origin and prints no values", async () => {
    const page = LOGIN_PAGE.replace(
      /<div class="g-recaptcha"[^>]*><\/div>/,
      "",
    );
    const posts: { url: string; body: string }[] = [];
    // Il Cookie si legge dalla richiesta del client: MSW aggiunge il proprio.
    const sent: { method: string; url: string; cookie: string | null }[] = [];
    server.use(
      http.get(
        `${MW}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: `${TG}/it/account/login?ReturnUrl=segreto-q` },
          }),
      ),
      http.get(`${TG}/it/account/login`, () =>
        HttpResponse.html(page, {
          headers: { "Set-Cookie": "tgpre=cookie-segreto-pre; path=/" },
        }),
      ),
      http.post(`${TG}/it/account/login`, async ({ request }) => {
        posts.push({ url: request.url, body: await request.text() });
        return new HttpResponse(null, {
          status: 302,
          headers: [
            ["Location", `${MW}/cloud/Account/Callback?code=segreto-code`],
            ["Set-Cookie", "tgauth=cookie-segreto-tg; path=/"],
          ],
        });
      }),
      http.get(
        `${MW}/cloud/Account/Callback`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: [
              ["Location", "/cloud/"],
              ["Set-Cookie", "mwauth=cookie-segreto-mw; path=/"],
            ],
          }),
      ),
      http.get(`${MW}/cloud/`, () => HttpResponse.html("<html>ok</html>")),
      http.get(`${MW}/cloud/Training`, () => {
        return HttpResponse.html(
          '<script>EU.currentUser = JSON.parse(\'{\\"id\\":\\"segreto-id\\"}\');</script>',
        );
      }),
    );

    const result = await traceLogin({
      login: {
        email: "utente.prova@example.com",
        password: "password-segreta",
      },
      starts: [new URL(`${MW}/cloud/User/Login`)],
      fetch: (input, init) => {
        const url = new URL(String(input));
        sent.push({
          method: init?.method ?? "GET",
          url: url.origin + url.pathname,
          cookie: new Headers(init?.headers).get("cookie"),
        });
        return fetch(input, init);
      },
      sleep: async () => {},
    });

    // Un solo POST, all'URL esatto dell'action del form.
    expect(posts).toEqual([
      {
        url: `${TG}/it/account/login?ReturnUrl=%2Fsegreto`,
        body: new URLSearchParams([
          ["__RequestVerificationToken", "csrf-segreto-1"],
          ["returnUrl", "/valore-segreto?a=1&b=2"],
          ["Email", "utente.prova@example.com"],
          ["Password", "password-segreta"],
          ["action", "login"],
        ]).toString(),
      },
    ]);
    // Ogni origine riceve solo i propri cookie.
    expect(sent).toEqual([
      { method: "GET", url: `${MW}/cloud/User/Login`, cookie: null },
      { method: "GET", url: `${TG}/it/account/login`, cookie: null },
      {
        method: "POST",
        url: `${TG}/it/account/login`,
        cookie: "tgpre=cookie-segreto-pre",
      },
      { method: "GET", url: `${MW}/cloud/Account/Callback`, cookie: null },
      {
        method: "GET",
        url: `${MW}/cloud/`,
        cookie: "mwauth=cookie-segreto-mw",
      },
      {
        method: "GET",
        url: `${MW}/cloud/Training`,
        cookie: "mwauth=cookie-segreto-mw",
      },
    ]);
    expect(result.lines).toEqual([
      "Catena 1: https://www.mywellness.com/cloud/User/Login",
      "  1. GET https://www.mywellness.com/cloud/User/Login → 302, cookie impostati 0, verso https://www.technogym.com/it/account/login",
      "  2. GET https://www.technogym.com/it/account/login → 200 text/html, cookie impostati 1",
      "  Pagina: form 2 (con password 1) · captcha: nessuno · script 2 · noscript: sì",
      "  Form 1: POST https://www.technogym.com/it/account/login · campi: __RequestVerificationToken (hidden), returnUrl (hidden), Email (email), Password (password), RememberMe (checkbox), action (submit)",
      "  Form 2: GET https://www.technogym.com/newsletter · campi: mail (text)",
      "  Link di accesso: https://www.technogym.com/it/account/login, https://www.mywellness.com/cloud/",
      "Login: form 1 di https://www.technogym.com/it/account/login · campi inviati: __RequestVerificationToken, returnUrl, Email, Password, action",
      "  1. POST https://www.technogym.com/it/account/login → 302, cookie impostati 1, verso https://www.mywellness.com/cloud/Account/Callback",
      "  2. GET https://www.mywellness.com/cloud/Account/Callback → 302, cookie impostati 1, verso https://www.mywellness.com/cloud/",
      "  3. GET https://www.mywellness.com/cloud/ → 200 text/html, cookie impostati 0",
      "  Pagina: form 0 (con password 0) · captcha: nessuno · script 0 · noscript: no",
      "Verifica: https://www.mywellness.com/cloud/Training",
      "  1. GET https://www.mywellness.com/cloud/Training → 200 text/html, cookie impostati 0",
      "  Pagina: form 0 (con password 0) · captcha: nessuno · script 1 · noscript: no",
      "  Utente corrente: sì · form di login: no",
    ]);
    expect(result.lines.join("\n")).not.toMatch(/segret|utente\.prova/);
    expect(result.secrets.map((s) => s.kind).sort()).toEqual([
      "campo nascosto",
      "campo nascosto",
      "cookie",
      "cookie",
      "cookie",
      "e-mail",
      "parte locale dell'e-mail",
      "password",
    ]);
  });

  it("trace: no login post when the login page shows a captcha", async () => {
    let posts = 0;
    server.use(
      http.get(`${TG}/it/account/login`, () => HttpResponse.html(LOGIN_PAGE)),
      http.post(`${TG}/it/account/login`, () => {
        posts++;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const result = await traceLogin({
      login: {
        email: "utente.prova@example.com",
        password: "password-segreta",
      },
      starts: [new URL(`${TG}/it/account/login`)],
      sleep: async () => {},
    });

    expect(posts).toBe(0);
    expect(result.lines.at(-1)).toBe(
      "Login non eseguito: captcha sulla pagina del form (recaptcha)",
    );
  });

  it("trace: a 307 after the login post is not followed", async () => {
    const page = LOGIN_PAGE.replace(
      /<div class="g-recaptcha"[^>]*><\/div>/,
      "",
    );
    const contacted: string[] = [];
    server.use(
      http.get(`${TG}/it/account/login`, () => HttpResponse.html(page)),
      http.post(
        `${TG}/it/account/login`,
        () =>
          new HttpResponse(null, {
            status: 307,
            headers: { Location: `${MW}/cloud/raccolta` },
          }),
      ),
      http.get(`${MW}/cloud/Training`, () =>
        HttpResponse.html("<html></html>"),
      ),
    );

    const result = await traceLogin({
      login: {
        email: "utente.prova@example.com",
        password: "password-segreta",
      },
      starts: [new URL(`${TG}/it/account/login`)],
      fetch: recordingFetch(contacted),
      sleep: async () => {},
    });

    // Nessuna richiesta verso la destinazione del 307: la password non la raggiunge.
    expect(contacted).toEqual([
      `${TG}/it/account/login`,
      `${TG}/it/account/login`,
      `${MW}/cloud/Training`,
    ]);
    expect(result.lines).toContain(
      "  Fermo: 307 dopo il POST, il form non viene reinviato",
    );
  });

  it("trace: leak check names line and kind only, ignoring short cookie and hidden values", () => {
    const lines = [
      "Catena 1: https://www.mywellness.com/",
      "  campo con csrf-valore-lungo-01 dentro",
      "  utente: Utente.Prova e password-segreta",
      "  valori corti: true e 1",
    ];

    const leaks = findLeaks(lines, [
      { kind: "campo nascosto", value: "csrf-valore-lungo-01" },
      { kind: "campo nascosto", value: "true" },
      { kind: "cookie", value: "1" },
      { kind: "e-mail", value: "utente.prova@example.com" },
      { kind: "parte locale dell'e-mail", value: "utente.prova" },
      { kind: "password", value: "password-segreta" },
    ]);

    expect(leaks).toEqual([
      "riga 2: campo nascosto",
      "riga 3: parte locale dell'e-mail",
      "riga 3: password",
    ]);
  });

  it("trace: path segments with the e-mail local part are masked", async () => {
    server.use(
      http.get(
        `${MW}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { Location: `${TG}/it/Utente.Prova/home` },
          }),
      ),
      http.get(`${TG}/it/Utente.Prova/home`, () =>
        HttpResponse.html("<html></html>"),
      ),
    );

    const result = await traceLogin({
      login: {
        email: "utente.prova@example.com",
        password: "password-segreta",
      },
      starts: [new URL(`${MW}/cloud/User/Login`)],
      sleep: async () => {},
    });

    expect(result.lines.slice(0, 3)).toEqual([
      "Catena 1: https://www.mywellness.com/cloud/User/Login",
      "  1. GET https://www.mywellness.com/cloud/User/Login → 302, cookie impostati 0, verso https://www.technogym.com/it/<id>/home",
      "  2. GET https://www.technogym.com/it/<id>/home → 200 text/html, cookie impostati 0",
    ]);
    expect(findLeaks(result.lines, result.secrets)).toEqual([]);
  });

  describe("main", () => {
    function run(
      argv: string[],
      env: Record<string, string> = {},
      lines = ["riga"],
    ) {
      const out: string[] = [];
      const err: string[] = [];
      const calls: TraceOptions[] = [];
      return main(argv, env, {
        trace: async (opts) => {
          calls.push(opts);
          return {
            lines,
            secrets: [{ kind: "password", value: "password-segreta" }],
          };
        },
        out: (line) => out.push(line),
        err: (line) => err.push(line),
      }).then((code) => ({ code, out, err, calls }));
    }

    it("trace main: unknown argument exits 64 without tracing", async () => {
      const { code, err, calls } = await run(["--boh"]);

      expect(code).toBe(64);
      expect(err).toEqual([
        "Uso: npx tsx scripts/trace-mywellness-login.ts [--login] [--allow-host HOST]... [--start URL_HTTPS]...",
      ]);
      expect(calls).toEqual([]);
    });

    it("trace main: --login without credentials exits 78 naming the variables", async () => {
      const { code, err, calls } = await run(["--login"]);

      expect(code).toBe(78);
      expect(err).toEqual([
        "Variabili d'ambiente mancanti: MYWELLNESS_EMAIL, MYWELLNESS_PASSWORD",
      ]);
      expect(calls).toEqual([]);
    });

    it("trace main: passes options and prints the report", async () => {
      const { code, out, calls } = await run(
        [
          "--login",
          "--allow-host",
          "account.technogym.com",
          "--start",
          "https://www.technogym.com/it/login",
        ],
        {
          MYWELLNESS_EMAIL: "utente.prova@example.com",
          MYWELLNESS_PASSWORD: "x",
        },
      );

      expect(code).toBe(0);
      expect(calls).toEqual([
        {
          login: { email: "utente.prova@example.com", password: "x" },
          allowHosts: ["account.technogym.com"],
          starts: [new URL("https://www.technogym.com/it/login")],
        },
      ]);
      expect(out).toEqual([
        "riga",
        "Fine: nel rapporto non ci sono query, cookie, token né valori dei campi.",
      ]);
    });

    it("trace main: a report with a seen value is not printed and exits 65", async () => {
      const { code, out, err } = await run([], {}, [
        "Catena 1",
        "  contiene password-segreta",
      ]);

      expect(code).toBe(65);
      expect(out).toEqual([]);
      expect(err).toEqual([
        "Rapporto non stampato: contiene valori da non pubblicare",
        "riga 2: password",
      ]);
    });

    it("trace main: a non-https start or a malformed host exits 64", async () => {
      for (const argv of [
        ["--start", "http://www.technogym.com/"],
        ["--allow-host", "host/percorso"],
        ["--allow-host"],
      ]) {
        expect((await run(argv)).code).toBe(64);
      }
    });
  });
});
