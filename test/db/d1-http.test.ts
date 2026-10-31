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

const QUERY_URL =
  "https://api.cloudflare.com/client/v4/accounts/acc-test/d1/database/db-test/query";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function testDb() {
  return createD1HttpDb({
    accountId: "acc-test",
    databaseId: "db-test",
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

  it("d1-http: retries 503 then succeeds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const requests: { auth: string | null; body: unknown }[] = [];
    server.use(
      http.post(QUERY_URL, async ({ request }) => {
        requests.push({
          auth: request.headers.get("authorization"),
          body: await request.json(),
        });
        return requests.length === 1
          ? new HttpResponse(null, { status: 503 })
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
      body: {
        sql: "SELECT ?1, ?2, ?3, ?4, ?5",
        params: ["sess-001", 2, 1, 0, null],
      },
    };
    expect(requests).toEqual([sent, sent]);
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
  });

  it("d1-http: 429 on every attempt raises TransientError after 3 calls", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const calls = respondWith(() => new HttpResponse(null, { status: 429 }));
    const pending = testDb()
      .prepare("SELECT 1")
      .all()
      .catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toBeInstanceOf(TransientError);
    expect(calls.count).toBe(3);
  });

  it("d1-http: network failure raises TransientError with cause", async () => {
    const failure = new TypeError("fetch failed");
    let calls = 0;
    const db = createD1HttpDb({
      accountId: "acc-test",
      databaseId: "db-test",
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
      reply: () => HttpResponse.text("not json"),
      cause: SyntaxError,
    },
    {
      label: "unexpected object",
      reply: () => HttpResponse.json({ unexpected: true }),
      cause: ZodError,
    },
    {
      label: "results not an array",
      reply: () =>
        HttpResponse.json({
          success: true,
          result: [{ results: "x", success: true }],
        }),
      cause: ZodError,
    },
    {
      label: "missing statement result",
      reply: () => HttpResponse.json({ success: true, result: [] }),
      cause: ZodError,
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
      expect((error as Error).cause).toBeInstanceOf(cause);
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
});
