import { inspect } from "node:util";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ZodError } from "zod";
import { createD1HttpDb } from "../../src/db/d1-http";
import {
  AuthError,
  ParseError,
  SyncError,
  TransientError,
} from "../../src/errors";

// Identificativi fittizi nel formato reale (esadecimale / UUID).
const ACCOUNT_ID = "00000000000000000000000000000000";
const DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function testDb() {
  return createD1HttpDb({
    accountId: ACCOUNT_ID,
    databaseId: DATABASE_ID,
    token: "test-token",
  });
}

/** Corpo di una risposta riuscita: un elemento di `result` per istruzione. */
function okBody(rows: Record<string, unknown>[][]) {
  return {
    success: true,
    errors: [],
    messages: [],
    result: rows.map((results) => ({
      results,
      success: true,
      meta: { changes: 1, duration: 0.5, last_row_id: 7, rows_read: 2 },
    })),
  };
}

/** Registra l'handler e conta le richieste ricevute. */
function respondWith(reply: (call: number) => Response) {
  const calls = { count: 0 };
  server.use(
    http.post(QUERY_URL, () => {
      calls.count++;
      return reply(calls.count);
    }),
  );
  return calls;
}

describe("d1-http", () => {
  it("d1-http: 403 raises AuthError", async () => {
    const calls = respondWith(() => new HttpResponse(null, { status: 403 }));
    const error = await testDb()
      .prepare("SELECT 1")
      .all()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as Error).name).toBe("AuthError");
    expect(calls.count).toBe(1);
  });

  it("d1-http: 401 raises AuthError without retry", async () => {
    const calls = respondWith(() => new HttpResponse(null, { status: 401 }));
    await expect(testDb().prepare("SELECT 1").all()).rejects.toBeInstanceOf(
      AuthError,
    );
    expect(calls.count).toBe(1);
  });

  it.each([500, 502, 503])(
    "d1-http: retries %i then succeeds",
    async (status) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "Date"], now: 0 });
      const requests: {
        auth: string | null;
        type: string | null;
        body: unknown;
      }[] = [];
      server.use(
        http.post(QUERY_URL, async ({ request }) => {
          requests.push({
            auth: request.headers.get("authorization"),
            type: request.headers.get("content-type"),
            body: await request.json(),
          });
          return requests.length === 1
            ? new HttpResponse(null, { status })
            : HttpResponse.json(okBody([[{ id: "sess-001" }]]));
        }),
      );
      const pending = testDb()
        .prepare("SELECT ?1, ?2, ?3, ?4, ?5")
        .bind("sess-001", 2, true, false, null)
        .all();
      await vi.runAllTimersAsync();
      const result = await pending;

      const sent = {
        auth: "Bearer test-token",
        type: "application/json",
        body: {
          sql: "SELECT ?1, ?2, ?3, ?4, ?5",
          params: ["sess-001", 2, 1, 0, null],
        },
      };
      expect(requests).toEqual([sent, sent]);
      expect(Date.now()).toBe(500); // attesa prima del secondo tentativo
      expect(result).toEqual({
        success: true,
        results: [{ id: "sess-001" }],
        meta: {
          changed_db: false,
          changes: 1,
          duration: 0.5,
          last_row_id: 7,
          rows_read: 2,
          rows_written: 0,
          size_after: 0,
        },
      });
    },
  );

  it("d1-http: 429 on every attempt raises TransientError after 3 calls", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"], now: 0 });
    const calls = respondWith(() => new HttpResponse(null, { status: 429 }));
    const pending = testDb()
      .prepare("SELECT 1")
      .all()
      .catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(TransientError);
    expect(calls.count).toBe(3);
    expect(Date.now()).toBe(1500); // attese di 500 e 1000 ms
  });

  it("d1-http: network failure raises TransientError with cause", async () => {
    const failure = new TypeError("fetch failed");
    let calls = 0;
    const db = createD1HttpDb({
      accountId: ACCOUNT_ID,
      databaseId: DATABASE_ID,
      token: "test-token",
      fetch: async () => {
        calls++;
        throw failure;
      },
    });
    const error = await db
      .prepare("SELECT 1")
      .all()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as Error).cause).toBe(failure);
    expect(calls).toBe(1);
  });

  it.each([400, 200])(
    "d1-http: sql error (HTTP %i) raises SyncError with codes only",
    async (status) => {
      respondWith(() =>
        HttpResponse.json(
          {
            success: false,
            errors: [{ code: 7500, message: 'near "SELEC": syntax error' }],
            messages: [],
            result: [],
          },
          { status },
        ),
      );
      const error = await testDb()
        .prepare("SELEC ?1")
        .bind("secret-param")
        .all()
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SyncError);
      for (const subclass of [AuthError, ParseError, TransientError]) {
        expect(error).not.toBeInstanceOf(subclass);
      }
      const message = (error as Error).message;
      expect(message).toContain(`HTTP ${status}`);
      expect(message).toContain("7500");
      for (const leaked of ["syntax", "SELEC", "secret-param", "test-token"]) {
        expect(message).not.toContain(leaked);
      }
    },
  );

  it("d1-http: non-JSON 404 raises SyncError without the body", async () => {
    respondWith(() =>
      HttpResponse.text("<html>route not found</html>", { status: 404 }),
    );
    const error = await testDb()
      .prepare("SELECT 1")
      .all()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect(error).not.toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain("HTTP 404");
    expect((error as Error).message).not.toContain("route not found");
  });

  it.each([
    {
      label: "not JSON",
      // Il SyntaxError cita il corpo ("not json" is not valid JSON): niente cause.
      reply: () => HttpResponse.text("not json"),
      cause: undefined,
    },
    {
      label: "unexpected object",
      reply: () => HttpResponse.json({ unexpected: true }),
      cause: expect.any(ZodError),
    },
    {
      label: "results not an array",
      reply: () =>
        HttpResponse.json({
          success: true,
          result: [{ results: "x", success: true }],
        }),
      cause: expect.any(ZodError),
    },
    {
      label: "missing statement result",
      reply: () => HttpResponse.json({ success: true, result: [] }),
      cause: expect.any(ZodError),
    },
    {
      label: "statement not successful",
      reply: () =>
        HttpResponse.json({
          success: true,
          result: [{ results: [], success: false }],
        }),
      cause: expect.any(ZodError),
    },
  ])(
    "d1-http: invalid body raises ParseError ($label)",
    async ({ reply, cause }) => {
      respondWith(reply);
      const error = await testDb()
        .prepare("SELECT 1")
        .all()
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).cause).toEqual(cause);
      expect(inspect(error)).not.toContain("not json");
    },
  );

  it("d1-http: batch sends one request and maps results in order", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(QUERY_URL, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(okBody([[{ n: 1 }], [{ n: 2 }, { n: 3 }]]));
      }),
    );
    const db = testDb();
    const results = await db.batch([
      db.prepare("SELECT ?1").bind("a"),
      db.prepare("SELECT 2"),
    ]);
    expect(bodies).toEqual([
      {
        batch: [
          { sql: "SELECT ?1", params: ["a"] },
          { sql: "SELECT 2", params: [] },
        ],
      },
    ]);
    expect(results.map((r) => r.results)).toEqual([
      [{ n: 1 }],
      [{ n: 2 }, { n: 3 }],
    ]);
  });

  it("d1-http: batch rejects statements from another db", async () => {
    const calls = respondWith(() => HttpResponse.json(okBody([[]])));
    const other = testDb().prepare("SELECT 1");
    await expect(testDb().batch([other])).rejects.toBeInstanceOf(TypeError);
    expect(calls.count).toBe(0);
  });

  it("d1-http: run and first read the statement result", async () => {
    server.use(
      http.post(QUERY_URL, async ({ request }) => {
        const { sql } = (await request.json()) as { sql: string };
        const rows =
          sql === "SELECT rows"
            ? [
                { a: 1, b: "x" },
                { a: 2, b: "y" },
              ]
            : [];
        return HttpResponse.json(okBody([rows]));
      }),
    );
    const db = testDb();
    const rows = db.prepare("SELECT rows");
    const none = db.prepare("SELECT none");
    expect((await rows.run()).results).toEqual([
      { a: 1, b: "x" },
      { a: 2, b: "y" },
    ]);
    expect(await rows.first()).toEqual({ a: 1, b: "x" });
    expect(await rows.first("b")).toBe("x");
    expect(await none.first()).toBeNull();
    expect(await none.first("b")).toBeNull();
    await expect(rows.first("missing")).rejects.toThrow("missing");
  });

  it("d1-http: raw is not supported", async () => {
    const calls = respondWith(() => HttpResponse.json(okBody([[{ a: 1 }]])));
    await expect(testDb().prepare("SELECT 1").raw()).rejects.toThrow(
      "raw() non supportato",
    );
    expect(calls.count).toBe(0);
  });

  it.each([
    { label: "undefined", value: undefined },
    { label: "ArrayBuffer", value: new ArrayBuffer(1) },
    { label: "object", value: { a: 1 } },
  ])("d1-http: bind rejects $label", ({ value }) => {
    const statement = testDb().prepare("SELECT ?1");
    expect(() => statement.bind(value)).toThrow(TypeError);
  });

  it("d1-http: token with newline raises AuthError before any request", () => {
    const calls = respondWith(() => HttpResponse.json(okBody([[]])));
    const token = "secret-part\nsecond-part";
    let error: unknown;
    try {
      createD1HttpDb({
        accountId: ACCOUNT_ID,
        databaseId: DATABASE_ID,
        token,
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AuthError);
    expect((error as Error).cause).toBeUndefined();
    expect(inspect(error)).not.toContain("secret-part");
    expect(inspect(error)).not.toContain("second-part");
    expect(calls.count).toBe(0);
  });

  it.each([
    { label: "account id", accountId: "acc/../x", databaseId: DATABASE_ID },
    { label: "database id", accountId: ACCOUNT_ID, databaseId: "db?x=1" },
  ])(
    "d1-http: invalid $label raises AuthError before any request",
    ({ accountId, databaseId }) => {
      const calls = respondWith(() => HttpResponse.json(okBody([[]])));
      expect(() =>
        createD1HttpDb({ accountId, databaseId, token: "test-token" }),
      ).toThrow(AuthError);
      expect(calls.count).toBe(0);
    },
  );

  it("d1-http: body read failure on 2xx raises TransientError", async () => {
    const calls = respondWith(
      () =>
        new HttpResponse(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new TextEncoder().encode('{"success":'));
              controller.error(new Error("connessione interrotta"));
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const error = await testDb()
      .prepare("SELECT 1")
      .all()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as Error).cause).toBeDefined();
    expect(calls.count).toBe(1);
  });

  it("d1-http: batch with fewer results than statements raises ParseError", async () => {
    respondWith(() => HttpResponse.json(okBody([[{ n: 1 }]])));
    const db = testDb();
    await expect(
      db.batch([db.prepare("SELECT 1"), db.prepare("SELECT 2")]),
    ).rejects.toBeInstanceOf(ParseError);
  });

  it("d1-http: empty batch rejects without a request", async () => {
    // Come il binding ("No SQL statements detected"): nessuna chiamata HTTP.
    const calls = respondWith(() => HttpResponse.json(okBody([])));
    await expect(testDb().batch([])).rejects.toThrow("batch vuoto");
    expect(calls.count).toBe(0);
  });

  it("d1-http: retried response body is cancelled", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    // fetch iniettato con Response nativa: MSW duplica il corpo (tee) e
    // nasconderebbe la cancellazione alla sorgente.
    let cancelled = false;
    let calls = 0;
    const db = createD1HttpDb({
      accountId: ACCOUNT_ID,
      databaseId: DATABASE_ID,
      token: "test-token",
      fetch: async () => {
        calls++;
        if (calls > 1) return new Response(JSON.stringify(okBody([[]])));
        const body = new ReadableStream({
          cancel() {
            cancelled = true;
          },
        });
        return new Response(body, { status: 503 });
      },
    });
    const pending = db.prepare("SELECT 1").all();
    await vi.runAllTimersAsync();
    await pending;
    expect(calls).toBe(2);
    expect(cancelled).toBe(true);
  });
});
