import { inspect } from "node:util";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  ParseError,
  SyncError,
  TransientError,
} from "../../src/errors";
import { MywellnessClient } from "../../src/mywellness/client";
import { fixture, setupMswServer } from "../msw";

const SITE = "https://www.mywellness.com";
const SERVICES = "https://services.mywellness.com";
// Credenziali inventate; id e token sono quelli di login_ok.html.
const EMAIL = "utente@example.com";
const PASSWORD = "password-di-prova";
const USER_ID = "11111111-2222-4333-8444-555555555555";

const server = setupMswServer();
afterEach(() => {
  vi.useRealTimers();
});

type ClientOptions = ConstructorParameters<typeof MywellnessClient>[0];

function newClient(opts: Partial<ClientOptions> = {}): MywellnessClient {
  return new MywellnessClient({
    email: EMAIL,
    password: PASSWORD,
    minIntervalMs: 0,
    sleep: async () => {},
    ...opts,
  });
}

/** Login: pagina del form, POST con redirect, pagina Training; restituisce i POST ricevuti. */
function useLogin(trainingPage = fixture("login_ok.html")) {
  const posted: { type: string | null; form: string[][] }[] = [];
  server.use(
    http.get(`${SITE}/cloud/User/Login`, () =>
      HttpResponse.html(fixture("login_form.html"), {
        headers: { "Set-Cookie": "SessionCookie=s1; path=/; HttpOnly" },
      }),
    ),
    http.post(`${SITE}/cloud/User/Login`, async ({ request }) => {
      posted.push({
        type: request.headers.get("content-type"),
        form: [...new URLSearchParams(await request.text())],
      });
      return new HttpResponse(null, {
        status: 302,
        headers: [
          ["Location", "/cloud/"],
          ["Set-Cookie", "AuthCookie=a2; path=/; HttpOnly"],
        ],
      });
    }),
    http.get(`${SITE}/cloud/`, () => HttpResponse.html("<html></html>")),
    http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(trainingPage)),
  );
  return posted;
}

describe("client", () => {
  it("client: login sets user id", async () => {
    const posted = useLogin();
    // Il Cookie si legge dalla richiesta del client: MSW aggiunge il proprio.
    const sent: { method: string; url: string; cookie: string | null }[] = [];
    const client = newClient({
      fetch: (input, init) => {
        sent.push({
          method: init?.method ?? "GET",
          url: String(input),
          cookie: new Headers(init?.headers).get("cookie"),
        });
        return fetch(input, init);
      },
    });

    await client.login();

    expect(client.userId).toBe(USER_ID);
    expect(posted).toEqual([
      {
        type: "application/x-www-form-urlencoded",
        form: [
          ["UserBinder.MifareId", ""],
          ["UserBinder.IsFromLogin", "True"],
          ["UserBinder.ForceJoinFacility", ""],
          ["UserBinder.Username", EMAIL],
          ["UserBinder.Password", PASSWORD],
          ["UserBinder.KeepMeLogged", "true"],
        ],
      },
    ]);
    const cookies = "SessionCookie=s1; AuthCookie=a2";
    expect(sent).toEqual([
      { method: "GET", url: `${SITE}/cloud/User/Login`, cookie: null },
      {
        method: "POST",
        url: `${SITE}/cloud/User/Login`,
        cookie: "SessionCookie=s1",
      },
      { method: "GET", url: `${SITE}/cloud/`, cookie: cookies },
      { method: "GET", url: `${SITE}/cloud/Training`, cookie: cookies },
    ]);
  });

  it("client: login failure", async () => {
    useLogin(fixture("login_form.html"));

    const error = await newClient()
      .login()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as Error).message).toBe("Login Mywellness fallito");
    expect(inspect(error)).not.toContain(PASSWORD);
    expect(inspect(error)).not.toContain(EMAIL);
  });

  it("client: lists session ids", async () => {
    useLogin();
    const ranges: (string | null)[][] = [];
    server.use(
      http.get(
        `${SITE}/cloud/Training/LastPerformedWorkoutSession`,
        ({ request }) => {
          const query = new URL(request.url).searchParams;
          ranges.push([query.get("fromDate"), query.get("toDate")]);
          return HttpResponse.html(
            query.get("fromDate") === "19/11/2026"
              ? fixture("last_sessions.html")
              : "<html><body></body></html>",
          );
        },
      ),
    );
    const client = newClient({ today: () => "2026-12-03" });
    await client.login();

    const ids = await client.listSessionIds();

    expect(ids).toEqual(["900000003", "900000002", "900000001"]);
    // Default: da oggi meno 14 giorni a oggi, una richiesta per mese di calendario.
    expect(ranges).toEqual([
      ["19/11/2026", "30/11/2026"],
      ["01/12/2026", "03/12/2026"],
    ]);
  });

  it("client: retries once on 502", async () => {
    useLogin();
    const requests: { url: string; accept: string | null }[] = [];
    server.use(
      http.get(
        `${SERVICES}/Training/User/${USER_ID}/GetPerformedWorkoutSessionByIdCr`,
        ({ request }) => {
          requests.push({
            url: request.url,
            accept: request.headers.get("accept"),
          });
          return requests.length === 1
            ? new HttpResponse(null, { status: 502 })
            : HttpResponse.json({ data: { physicalActivities: [] } });
        },
      ),
    );
    const sleeps: number[] = [];
    const client = newClient({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.login();

    const session = await client.getSession("900000003");

    expect(session).toEqual({ data: { physicalActivities: [] } });
    const expected = {
      url: `${SERVICES}/Training/User/${USER_ID}/GetPerformedWorkoutSessionByIdCr?IdCr=900000003&token=synthetic-token-0001&AppId=ec1d38d7-d359-48d0-a60c-d8c0b8fb9df9&_c=it-IT`,
      accept: "application/json",
    };
    expect(requests).toEqual([expected, expected]);
    expect(sleeps).toEqual([2000]); // attesa prima del secondo tentativo
  });

  it("client: no retry on 401", async () => {
    let posts = 0;
    server.use(
      http.get(`${SITE}/cloud/User/Login`, () =>
        HttpResponse.html(fixture("login_form.html")),
      ),
      http.post(`${SITE}/cloud/User/Login`, () => {
        posts++;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const error = await newClient()
      .login()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect(posts).toBe(1);
  });

  it("client: list after expired session raises AuthError", async () => {
    useLogin();
    // Sessione scaduta: il sito risponde 200 con il form di login.
    server.use(
      http.get(`${SITE}/cloud/Training/LastPerformedWorkoutSession`, () =>
        HttpResponse.html(fixture("login_form.html")),
      ),
    );
    const client = newClient({ today: () => "2026-11-20" });
    await client.login();

    const error = await client.listSessionIds().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as Error).message).toBe("Login Mywellness fallito");
  });

  it("client: getSession invalid json raises ParseError", async () => {
    useLogin();
    server.use(
      http.get(
        `${SERVICES}/Training/User/${USER_ID}/GetPerformedWorkoutSessionByIdCr`,
        () => HttpResponse.text("<html>pagina di errore</html>"),
      ),
    );
    const client = newClient();
    await client.login();

    const error = await client.getSession("900000003").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ParseError);
    // Niente corpo della risposta nell'errore, nemmeno nella cause.
    expect(inspect(error)).not.toContain("pagina di errore");
  });

  it("client: strength detail 404 is not retried", async () => {
    useLogin();
    let calls = 0;
    server.use(
      http.get(`${SITE}/cloud/Training/PerformedExerciseDetailById/`, () => {
        calls++;
        return new HttpResponse(null, { status: 404 });
      }),
    );
    const client = newClient();
    await client.login();

    const error = await client
      .getStrengthDetailHtml(
        "aaaaaaaa-0000-4000-8000-000000000001",
        "2026-11-26",
      )
      .catch((e: unknown) => e);

    // SyncError fino al merge del Task 6, poi UpstreamError.
    expect(error).toBeInstanceOf(SyncError);
    for (const subclass of [AuthError, ParseError, TransientError]) {
      expect(error).not.toBeInstanceOf(subclass);
    }
    expect((error as Error).message).toBe("Mywellness: HTTP 404");
    expect(calls).toBe(1);
  });

  it("client: cardio timeseries 429 gives TransientError after 2 retries", async () => {
    useLogin();
    let calls = 0;
    server.use(
      http.get(`${SERVICES}/Training/CardioLog/:analyticsId/Details`, () => {
        calls++;
        // Il primo tentativo fallisce in rete: anche quello si ritenta.
        return calls === 1
          ? HttpResponse.error()
          : new HttpResponse(null, { status: 429 });
      }),
    );
    const sleeps: number[] = [];
    const client = newClient({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.login();

    const error = await client
      .getCardioTimeseries(
        "analytics-0001",
        "ffffffff-0000-4000-8000-000000000002",
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransientError);
    expect((error as Error).message).toBe(
      "Mywellness: HTTP 429 dopo 3 tentativi",
    );
    expect(calls).toBe(3);
    expect(sleeps).toEqual([2000, 4000]);
  });

  it("client: strength detail and cardio timeseries succeed", async () => {
    useLogin();
    const queries: Record<string, string>[] = [];
    const paths: string[] = [];
    server.use(
      http.get(
        `${SITE}/cloud/Training/PerformedExerciseDetailById/`,
        ({ request }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return HttpResponse.html("<table><tr><th>Serie</th></tr></table>");
        },
      ),
      http.get(
        `${SERVICES}/Training/CardioLog/:analyticsId/Details`,
        ({ request }) => {
          const url = new URL(request.url);
          paths.push(url.pathname);
          queries.push(Object.fromEntries(url.searchParams));
          return HttpResponse.json({ data: { analitics: { samples: [] } } });
        },
      ),
    );
    const client = newClient();
    await client.login();

    const html = await client.getStrengthDetailHtml(
      "aaaaaaaa-0000-4000-8000-000000000001",
      "2026-11-26",
    );
    const series = await client.getCardioTimeseries(
      "analytics-0001",
      "ffffffff-0000-4000-8000-000000000002",
    );

    expect(html).toBe("<table><tr><th>Serie</th></tr></table>");
    expect(series).toEqual({ data: { analitics: { samples: [] } } });
    expect(paths).toEqual(["/Training/CardioLog/analytics-0001/Details"]);
    expect(queries).toEqual([
      {
        performedPhysicalActivityId: "aaaaaaaa-0000-4000-8000-000000000001",
        day: "2026-11-26",
      },
      {
        facilityId: "ffffffff-0000-4000-8000-000000000002",
        token: "synthetic-token-0001",
        AppId: "ec1d38d7-d359-48d0-a60c-d8c0b8fb9df9",
        _c: "it-IT",
      },
    ]);
  });

  it("client: waits min interval between requests", async () => {
    // Orologio fermo: l'attesa è l'intervallo intero, senza tempo trascorso.
    vi.useFakeTimers({ toFake: ["Date"], now: 0 });
    useLogin();
    const sleeps: number[] = [];
    const client = newClient({
      minIntervalMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await client.login();

    // Quattro richieste del login, un'attesa prima di ognuna dopo la prima.
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });
});
