import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import { main, readCurrentUser } from "../scripts/probe-mywellness";
import { ParseError } from "../src/errors";

// Valori inventati e pagine sintetiche: nessuna richiesta reale verso Mywellness.
const SITE = "https://www.mywellness.com";
const SERVICES = "https://services.mywellness.com";
const API = "https://api.mywellness.com";
const APP_ID = "ec1d38d7-d359-48d0-a60c-d8c0b8fb9df9";
const USER_ID = "3f2a9c1e-7b4d-4e8a-9c6f-1d2e3f4a5b6c";
const TOKEN = "tok-di-prova-0123456789";
const EMAIL = "mario.rossi@example.com";
const PASSWORD = "Prova&Segreta+1";
const LOGIN_FORM =
  '<form action="/cloud/User/Login" method="post"><input name="UserBinder.Username"></form>';

// Pagina di allenamento dopo un login riuscito: profilo nel formato `JSON.parse('...')`.
const TRAINING = String.raw`<script>EU.currentUser = JSON.parse('{\"id\":\"${USER_ID}\",\"token\":\"${TOKEN}\",\"culture\":\"it-IT\",\"firstName\":\"Mario\",\"lastName\":\"Rossi\",\"email\":\"${EMAIL}\",\"phones\":[\"+39 000 0000000\"],\"facility\":{\"facilityUrl\":\"palestra-di-prova\",\"name\":\"Palestra di prova\"},\"weight\":81.5}');</script>`;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let dir: string;
let outDir: string;
let sleeps: number[];
let stdout: MockInstance;
let stderr: MockInstance;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "probe-"));
  outDir = join(dir, "probe_out");
  sleeps = [];
  stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
  stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const deps = () => ({
  outDir,
  sleep: async (ms: number) => {
    sleeps.push(ms);
  },
});

describe("probe", () => {
  it("probe: readCurrentUser decodes the profile like the client", () => {
    // Tutto il payload, senza zod: lo usano il probe e il rapporto della forma.
    expect(
      readCurrentUser(
        String.raw`<script>EU.currentUser = JSON.parse('{\"id\":\"u-1\",\"firstName\":\"Mario\",\"note\":\"l\'ok\"}');</script>`,
      ),
    ).toEqual({ id: "u-1", firstName: "Mario", note: "l'ok" });
    // Virgolette non escapate, come accetta il client.
    expect(
      readCurrentUser(`EU.currentUser = JSON.parse('{"id":"u-2"}')`),
    ).toEqual({ id: "u-2" });
    expect(readCurrentUser("<p>pagina diversa</p>")).toBeUndefined();
    let error: unknown;
    try {
      readCurrentUser("EU.currentUser = JSON.parse('{rotto')");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toBe(
      "Mywellness: utente corrente non interpretabile",
    );
    // Niente cause: il SyntaxError citerebbe il payload, che contiene dati personali.
    expect((error as Error).cause).toBeUndefined();
  });

  it("probe: exit 78 without credentials", async () => {
    const code = await main([], { MYWELLNESS_EMAIL: EMAIL }, deps());
    expect(code).toBe(78);
    expect(stderr.mock.calls).toEqual([
      ["Variabili d'ambiente mancanti: MYWELLNESS_PASSWORD"],
    ]);
    expect(stdout).not.toHaveBeenCalled();
    expect(existsSync(outDir)).toBe(false);
  });

  it("probe: exit 78 when mywellness rejects the login", async () => {
    const posts: { body: string; contentType: string | null }[] = [];
    server.use(
      http.get(
        `${SITE}/cloud/User/Login`,
        () =>
          new HttpResponse(LOGIN_FORM, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Set-Cookie": "_mwappseu=c00k1e-di-prova; path=/; HttpOnly",
            },
          }),
      ),
      http.post(`${SITE}/cloud/User/Login`, async ({ request }) => {
        posts.push({
          body: await request.text(),
          contentType: request.headers.get("content-type"),
        });
        return HttpResponse.html(LOGIN_FORM);
      }),
      // Credenziali rifiutate: la pagina di allenamento è di nuovo il modulo di login.
      http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(LOGIN_FORM)),
    );
    // Cookie inviati dal probe, letti prima di MSW (che aggiunge i propri dal suo archivio).
    const cookies: (string | null)[] = [];
    const recordingFetch: typeof fetch = (input, init) => {
      cookies.push(new Headers(init?.headers).get("cookie"));
      return fetch(input, init);
    };
    const code = await main(
      [],
      { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
      { ...deps(), fetch: recordingFetch },
    );
    expect(code).toBe(78);
    expect(posts).toEqual([
      {
        body: "UserBinder.MifareId=&UserBinder.IsFromLogin=True&UserBinder.ForceJoinFacility=&UserBinder.Username=mario.rossi%40example.com&UserBinder.Password=Prova%26Segreta%2B1&UserBinder.KeepMeLogged=true",
        contentType: "application/x-www-form-urlencoded",
      },
    ]);
    expect(cookies).toEqual([
      null,
      "_mwappseu=c00k1e-di-prova",
      "_mwappseu=c00k1e-di-prova",
    ]);
    expect(stdout.mock.calls).toEqual([
      ["login form: HTTP 200, 88 byte"],
      ["login: HTTP 200, 88 byte"],
      ["training: HTTP 200, 88 byte"],
    ]);
    expect(stderr.mock.calls).toEqual([["Login Mywellness fallito"]]);
    const output = [...stdout.mock.calls, ...stderr.mock.calls]
      .flat()
      .join("\n");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain("Prova%26Segreta%2B1");
    expect(output).not.toContain(EMAIL);
    // Almeno 1 s tra una richiesta e l'altra; nessun login_ok.html senza login.
    expect(sleeps).toEqual([1000, 1000]);
    expect(readdirSync(outDir)).toEqual(["login_form.html"]);
  });

  it("probe: exit 64 with --days 0", async () => {
    expect(
      await main(
        ["--days", "0"],
        { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
        deps(),
      ),
    ).toBe(64);
    expect(stderr.mock.calls).toEqual([
      [
        "Uso: MYWELLNESS_EMAIL=… MYWELLNESS_PASSWORD=… npx tsx scripts/probe-mywellness.ts [--days N] (N da 1 a 365)",
      ],
    ]);
    expect(stdout).not.toHaveBeenCalled();
    expect(existsSync(outDir)).toBe(false);
  });

  it("probe: exit 65 when the profile has no token", async () => {
    server.use(
      http.get(`${SITE}/cloud/User/Login`, () => HttpResponse.html(LOGIN_FORM)),
      http.post(`${SITE}/cloud/User/Login`, () =>
        HttpResponse.html("<p>ok</p>"),
      ),
      http.get(`${SITE}/cloud/Training`, () =>
        HttpResponse.html(
          String.raw`<script>EU.currentUser = JSON.parse('{\"id\":\"${USER_ID}\",\"culture\":\"it-IT\"}');</script>`,
        ),
      ),
    );
    expect(
      await main(
        [],
        { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
        deps(),
      ),
    ).toBe(65);
    expect(stderr.mock.calls).toEqual([
      ["training: EU.currentUser senza id o token"],
    ]);
  });

  it("probe: notes a period without strength sessions", async () => {
    const cardioOnly = JSON.stringify({
      data: {
        startedOn: "2026-11-02 08:00:00 +01:00",
        physicalActivities: [
          {
            isCardio: true,
            performedPhysicalActivity: {
              id: "aaaaaaaa-0000-4000-8000-000000000003",
            },
          },
        ],
      },
    });
    server.use(
      http.get(`${SITE}/cloud/User/Login`, () => HttpResponse.html(LOGIN_FORM)),
      http.post(`${SITE}/cloud/User/Login`, () =>
        HttpResponse.html("<p>ok</p>"),
      ),
      http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(TRAINING)),
      http.get(`${SITE}/cloud/Training/LastPerformedWorkoutSession`, () =>
        HttpResponse.html(
          '<div><input type="hidden" name="hdSessionIdCR" value="111"><span class="date">20261102</span></div>',
        ),
      ),
      http.get(
        `${SERVICES}/Training/User/:userId/GetPerformedWorkoutSessionByIdCr`,
        () => HttpResponse.text(cardioOnly),
      ),
      http.post(
        `${SERVICES}/:facility/biometrics/user/:id/lastbiometricsmeasurements`,
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.post(
        `${API}/:facility/biometrics/user/:id/lastbiometricsmeasurements`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    expect(
      await main(
        ["--days", "1"],
        { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
        { ...deps(), now: () => new Date("2026-11-02T10:00:00Z") },
      ),
    ).toBe(0);
    expect(stderr.mock.calls).toContainEqual([
      "Nota: nessuna seduta con esercizi non cardio: niente session_strength.json",
    ]);
    expect(readdirSync(outDir)).not.toContain("session_strength.json");
  });

  it("probe: names itself in the User-Agent of every request", async () => {
    server.use(
      http.get(`${SITE}/cloud/User/Login`, () => HttpResponse.html(LOGIN_FORM)),
      http.post(`${SITE}/cloud/User/Login`, () =>
        HttpResponse.html(LOGIN_FORM),
      ),
      http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(LOGIN_FORM)),
    );
    const agents: (string | null)[] = [];
    const recordingFetch: typeof fetch = (input, init) => {
      agents.push(new Headers(init?.headers).get("user-agent"));
      return fetch(input, init);
    };
    expect(
      await main(
        [],
        { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
        { ...deps(), fetch: recordingFetch },
      ),
    ).toBe(78);
    expect(agents).toEqual([
      "palestra-probe/0.1.0",
      "palestra-probe/0.1.0",
      "palestra-probe/0.1.0",
    ]);
  });

  it("probe: a request without an answer in 30 s is a transient error", async () => {
    // Il segnale di AbortSignal.timeout scade dopo 30 s: qui il fetch fallisce come farebbe allora.
    const signals: (AbortSignal | null | undefined)[] = [];
    const timingOut: typeof fetch = async (_input, init) => {
      signals.push(init?.signal);
      throw new DOMException("signal timed out", "TimeoutError");
    };
    expect(
      await main(
        [],
        { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
        { ...deps(), fetch: timingOut },
      ),
    ).toBe(75);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(stderr.mock.calls).toEqual([["login form: errore di rete"]]);
  });

  it("probe: saves the raw bodies and picks strength, cardio and biometrics", async () => {
    const training = TRAINING;
    // In elenco la seduta di forza più vecchia (333) viene prima: conta startedOn.
    const list = [
      '<div><input type="hidden" name="hdSessionIdCR" value="333"><span class="date">20261020</span></div>',
      '<div><input type="hidden" name="hdSessionIdCR" value="111"><span class="date">20261029</span></div>',
      '<div><input value="222" name="hdSessionIdCR" type="hidden"><span class="date">20261027</span></div>',
      '<input type="hidden" name="altro" value="999">',
    ].join("");
    // Seduta 111: cardio con analyticsId, un esercizio di forza, uno non eseguito.
    const strength = JSON.stringify({
      data: {
        startedOn: "2026-10-29 18:30:00 +01:00",
        physicalActivities: [
          {
            isCardio: true,
            analyticsId: "5001",
            performedPhysicalActivity: {
              id: "aaaaaaaa-0000-4000-8000-000000000001",
              facilityId: "ffffffff-0000-4000-8000-000000000001",
            },
          },
          {
            isCardio: false,
            performedPhysicalActivity: {
              id: "aaaaaaaa-0000-4000-8000-000000000002",
              facilityId: "ffffffff-0000-4000-8000-000000000001",
            },
          },
          { isCardio: false, performedPhysicalActivity: null },
        ],
      },
    });
    const olderStrength = JSON.stringify({
      data: {
        startedOn: "2026-10-20 10:00:00 +02:00",
        physicalActivities: [
          {
            isCardio: false,
            performedPhysicalActivity: {
              id: "aaaaaaaa-0000-4000-8000-000000000004",
            },
          },
        ],
      },
    });
    const cardioOnly = JSON.stringify({
      data: {
        startedOn: "2026-10-27 18:00:00 +01:00",
        physicalActivities: [
          {
            isCardio: true,
            performedPhysicalActivity: {
              id: "aaaaaaaa-0000-4000-8000-000000000003",
              analiticsId: 6001,
            },
          },
        ],
      },
    });
    server.use(
      http.get(
        `${SITE}/cloud/User/Login`,
        () =>
          new HttpResponse(LOGIN_FORM, {
            headers: [
              ["Content-Type", "text/html"],
              ["Set-Cookie", "ASP.NET_SessionId=s3ss10n-di-prova-0123; path=/"],
              ["Set-Cookie", "culture=it-IT; path=/"],
            ],
          }),
      ),
      http.post(
        `${SITE}/cloud/User/Login`,
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: {
              Location: "/cloud/",
              "Set-Cookie": "_mwappseu=c00k1e-di-prova-lungo-0123; path=/",
            },
          }),
      ),
      http.get(`${SITE}/cloud/`, () => HttpResponse.html("<p>home</p>")),
      http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(training)),
      // Un mese di calendario per richiesta: le sedute sono tutte in ottobre.
      http.get(
        `${SITE}/cloud/Training/LastPerformedWorkoutSession`,
        ({ request }) =>
          HttpResponse.html(
            new URL(request.url).searchParams.get("fromDate") === "26/10/2026"
              ? list
              : "<p>nessuna seduta</p>",
          ),
      ),
      http.get(
        `${SERVICES}/Training/User/:userId/GetPerformedWorkoutSessionByIdCr`,
        ({ request }) =>
          HttpResponse.text(
            { "111": strength, "222": cardioOnly, "333": olderStrength }[
              new URL(request.url).searchParams.get("IdCr") ?? ""
            ] ?? "",
          ),
      ),
      http.get(`${SITE}/cloud/Training/PerformedExerciseDetailById/`, () =>
        HttpResponse.html("<table><tr><th>Serie</th></tr></table>"),
      ),
      http.get(`${SERVICES}/Training/CardioLog/:id/Details`, () =>
        HttpResponse.text('{"data":{"analitics":{"samples":[]}}}'),
      ),
      http.post(
        `${SERVICES}/:facility/biometrics/user/:id/lastbiometricsmeasurements`,
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.post(
        `${API}/:facility/biometrics/user/:id/lastbiometricsmeasurements`,
        () => HttpResponse.text('{"data":{"lastMeasurements":[]}}'),
      ),
    );
    const requests: string[] = [];
    const recordingFetch: typeof fetch = (input, init) => {
      requests.push(`${init?.method} ${String(input)}`);
      return fetch(input, init);
    };
    const code = await main(
      ["--days", "7"],
      { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
      {
        ...deps(),
        fetch: recordingFetch,
        now: () => new Date("2026-11-02T10:00:00Z"),
      },
    );
    expect(code).toBe(0);
    const auth = `token=${TOKEN}&AppId=${APP_ID}&_c=it-IT`;
    expect(requests).toEqual([
      `GET ${SITE}/cloud/User/Login`,
      `POST ${SITE}/cloud/User/Login`,
      `GET ${SITE}/cloud/`,
      `GET ${SITE}/cloud/Training`,
      `GET ${SITE}/cloud/Training/LastPerformedWorkoutSession?fromDate=01%2F11%2F2026&toDate=02%2F11%2F2026`,
      `GET ${SITE}/cloud/Training/LastPerformedWorkoutSession?fromDate=26%2F10%2F2026&toDate=31%2F10%2F2026`,
      `GET ${SERVICES}/Training/User/${USER_ID}/GetPerformedWorkoutSessionByIdCr?IdCr=333&${auth}`,
      `GET ${SERVICES}/Training/User/${USER_ID}/GetPerformedWorkoutSessionByIdCr?IdCr=111&${auth}`,
      `GET ${SERVICES}/Training/User/${USER_ID}/GetPerformedWorkoutSessionByIdCr?IdCr=222&${auth}`,
      `GET ${SITE}/cloud/Training/PerformedExerciseDetailById/?performedPhysicalActivityId=aaaaaaaa-0000-4000-8000-000000000002&day=2026-10-29`,
      `GET ${SERVICES}/Training/CardioLog/5001/Details?facilityId=ffffffff-0000-4000-8000-000000000001&${auth}`,
      `POST ${SERVICES}/palestra-di-prova/biometrics/user/${USER_ID}/lastbiometricsmeasurements`,
      `POST ${API}/palestra-di-prova/biometrics/user/${USER_ID}/lastbiometricsmeasurements`,
    ]);
    expect(readdirSync(outDir).sort()).toEqual([
      "biometrics.json",
      "cardio_timeseries.json",
      "identities.json",
      "last_sessions.html",
      "last_sessions_2.html",
      "login_form.html",
      "login_ok.html",
      "session_1.json",
      "session_2.json",
      "session_3.json",
      "session_cardio_only.json",
      "session_strength.json",
      "strength_detail.html",
    ]);
    // probe_out/ e i suoi file restano privati (solo il proprietario).
    expect(statSync(outDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(outDir, "session_strength.json")).mode & 0o777).toBe(
      0o600,
    );
    expect(statSync(join(outDir, "identities.json")).mode & 0o777).toBe(0o600);
    const saved = (name: string) => readFileSync(join(outDir, name), "utf8");
    expect(saved("session_strength.json")).toBe(strength);
    expect(saved("session_cardio_only.json")).toBe(cardioOnly);
    expect(saved("login_ok.html")).toBe(training);
    expect(JSON.parse(saved("identities.json"))).toEqual([
      EMAIL,
      USER_ID,
      TOKEN,
      "3f2a9c1e7b4d4e8a9c6f1d2e3f4a5b6c",
      "Mario",
      "Rossi",
      "+39 000 0000000",
      "390000000000",
      "Palestra di prova",
      "s3ss10n-di-prova-0123",
      "c00k1e-di-prova-lungo-0123",
    ]);
    const lines = stdout.mock.calls.flat().map(String);
    expect(lines.map((line) => line.replace(/, \d+ byte$/, ""))).toEqual([
      "login form: HTTP 200",
      "login: HTTP 302",
      "login (redirect 1): HTTP 200",
      "training: HTTP 200",
      "sessions 1: HTTP 200",
      "sessions 2: HTTP 200",
      "session 1: HTTP 200",
      "session 2: HTTP 200",
      "session 3: HTTP 200",
      "strength detail 1: HTTP 200",
      "cardio timeseries 1: HTTP 200",
      "biometrics services: HTTP 404",
      "biometrics api: HTTP 200",
      `13 file scritti in ${outDir}`,
    ]);
    // Nei log mai id, token, date, nomi, e-mail o password.
    const logs = lines.slice(0, -1).join("\n");
    for (const secret of [
      USER_ID,
      TOKEN,
      "111",
      "222",
      "333",
      "5001",
      "aaaaaaaa",
      "2026",
      "Mario",
      EMAIL,
      PASSWORD,
      "palestra-di-prova",
    ]) {
      expect(logs).not.toContain(secret);
    }
    expect(stderr).not.toHaveBeenCalled();
    expect(sleeps).toEqual(Array(12).fill(1000));
  });

  it.each([
    {
      label: "host esterno",
      location: "https://evil.example.com/cloud/",
      message: "login: redirect verso un host non consentito",
      leak: "evil.example.com",
    },
    {
      label: "downgrade a http",
      location: "http://www.mywellness.com/cloud/",
      message: "login: redirect verso un host non consentito",
      leak: "http://www.mywellness.com",
    },
    {
      label: "Location malformato",
      location: "http://[",
      message: "login: redirect non valido",
      leak: "http://[",
    },
  ])(
    "probe: refuses a redirect ($label)",
    async ({ location, message, leak }) => {
      server.use(
        http.get(`${SITE}/cloud/User/Login`, () =>
          HttpResponse.html(LOGIN_FORM),
        ),
        http.post(
          `${SITE}/cloud/User/Login`,
          () =>
            new HttpResponse(null, {
              status: 302,
              headers: { Location: location },
            }),
        ),
      );
      const code = await main(
        [],
        { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
        deps(),
      );
      expect(code).toBe(69);
      expect(stderr.mock.calls).toEqual([[message]]);
      // Mai l'URL del redirect rifiutato nei log.
      expect(stderr.mock.calls.flat().join("\n")).not.toContain(leak);
      // Si ferma prima di seguire il redirect: solo il modulo di login su disco.
      expect(readdirSync(outDir)).toEqual(["login_form.html"]);
    },
  );

  it.each([
    {
      label: "HTTP 503",
      reply: () => new HttpResponse(null, { status: 503 }),
      code: 75,
      message: "sessions 1: HTTP 503",
    },
    {
      label: "HTTP 429",
      reply: () => new HttpResponse(null, { status: 429 }),
      code: 75,
      message: "sessions 1: HTTP 429",
    },
    {
      label: "HTTP 403",
      reply: () => new HttpResponse(null, { status: 403 }),
      code: 78,
      message: "sessions 1: accesso negato (HTTP 403)",
    },
    {
      label: "HTTP 404",
      reply: () => new HttpResponse(null, { status: 404 }),
      code: 69,
      message: "sessions 1: HTTP 404",
    },
    {
      label: "network error",
      reply: () => HttpResponse.error(),
      code: 75,
      message: "sessions 1: errore di rete",
    },
  ])(
    "probe: exit $code when the session list fails ($label)",
    async ({ reply, code, message }) => {
      server.use(
        http.get(`${SITE}/cloud/User/Login`, () =>
          HttpResponse.html(LOGIN_FORM),
        ),
        http.post(`${SITE}/cloud/User/Login`, () =>
          HttpResponse.html("<p>ok</p>"),
        ),
        http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(TRAINING)),
        http.get(`${SITE}/cloud/Training/LastPerformedWorkoutSession`, reply),
      );
      expect(
        await main(
          [],
          { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
          deps(),
        ),
      ).toBe(code);
      expect(stderr.mock.calls).toEqual([[message]]);
      // Le identità si scrivono anche dopo un errore: servono al controllo del rapporto della forma.
      expect(readdirSync(outDir).sort()).toEqual([
        "identities.json",
        "login_form.html",
        "login_ok.html",
      ]);
    },
  );

  it("probe: tightens the modes of an existing probe_out and its files", async () => {
    // Lasciati da un'esecuzione precedente leggibili da tutti: mode di mkdir e writeFile
    // vale solo per ciò che si crea.
    mkdirSync(outDir);
    chmodSync(outDir, 0o755);
    for (const name of ["login_form.html", "identities.json"]) {
      writeFileSync(join(outDir, name), "vecchio");
      chmodSync(join(outDir, name), 0o644);
    }
    server.use(
      http.get(`${SITE}/cloud/User/Login`, () => HttpResponse.html(LOGIN_FORM)),
      http.post(`${SITE}/cloud/User/Login`, () =>
        HttpResponse.html("<p>ok</p>"),
      ),
      http.get(`${SITE}/cloud/Training`, () => HttpResponse.html(TRAINING)),
      http.get(
        `${SITE}/cloud/Training/LastPerformedWorkoutSession`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    expect(
      await main(
        [],
        { MYWELLNESS_EMAIL: EMAIL, MYWELLNESS_PASSWORD: PASSWORD },
        deps(),
      ),
    ).toBe(75);
    expect(statSync(outDir).mode & 0o777).toBe(0o700);
    for (const name of [
      "login_form.html",
      "login_ok.html",
      "identities.json",
    ]) {
      expect(statSync(join(outDir, name)).mode & 0o777).toBe(0o600);
    }
  });
});
