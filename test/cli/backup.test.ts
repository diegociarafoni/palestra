import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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
  vi,
} from "vitest";
import { main } from "../../src/cli/backup";
import {
  AuthError,
  ParseError,
  SyncError,
  TransientError,
} from "../../src/errors";

// Valori fittizi: nessun test tocca wrangler o R2 (export finto, upload finto o MSW).
const ENV = {
  CLOUDFLARE_API_TOKEN: "test-token",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "test-key-id",
  R2_SECRET_ACCESS_KEY: "test-secret",
};
const SQL = "CREATE TABLE prova(x);\n";

/** Export e upload finti: l'export scrive davvero il file nel percorso ricevuto. */
function fakes(
  opts: {
    content?: string;
    exitCode?: number;
    uploadError?: Error;
    now?: string;
  } = {},
) {
  const exports: string[] = [];
  const uploads: { key: string; body: string; bytes: number }[] = [];
  const deps = {
    exportDb: async (output: string) => {
      exports.push(output);
      if (opts.content !== undefined) writeFileSync(output, opts.content);
      return opts.exitCode ?? 0;
    },
    upload: async (key: string, body: Uint8Array) => {
      uploads.push({
        key,
        body: new TextDecoder().decode(body),
        bytes: body.length,
      });
      if (opts.uploadError) throw opts.uploadError;
    },
    now: () => new Date(opts.now ?? "2026-11-02T03:00:00Z"),
  };
  return { deps, exports, uploads };
}

// Solo per l'upload predefinito: nessuna richiesta reale verso R2.
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

let stderr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

describe("backup", () => {
  it("backup: exit 78 without r2 keys", async () => {
    const { deps, exports, uploads } = fakes({ content: SQL });
    const code = await main(
      [],
      {
        CLOUDFLARE_API_TOKEN: ENV.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: ENV.CLOUDFLARE_ACCOUNT_ID,
      },
      deps,
    );
    expect(code).toBe(78);
    expect(exports).toEqual([]);
    expect(uploads).toEqual([]);
    const output = stderr.mock.calls.flat().join("\n");
    expect(output).toContain("R2_ACCESS_KEY_ID");
    expect(output).toContain("R2_SECRET_ACCESS_KEY");
    expect(output).not.toContain(ENV.CLOUDFLARE_API_TOKEN);
    expect(output).not.toContain(ENV.CLOUDFLARE_ACCOUNT_ID);
  });

  it("backup: uploads and deletes local file", async () => {
    const stdout = vi.spyOn(console, "log");
    const { deps, exports, uploads } = fakes({ content: SQL });
    const code = await main([], ENV, deps);
    expect(code).toBe(0);
    expect(uploads).toEqual([
      { key: "palestra-2026-11-02.sql", body: SQL, bytes: 23 },
    ]);
    expect(exports).toHaveLength(1);
    const [file = ""] = exports;
    expect(basename(file)).toBe("palestra-2026-11-02.sql");
    expect(basename(dirname(file))).toMatch(/^palestra-backup-/);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(dirname(file))).toBe(false);
    expect(stderr.mock.calls).toEqual([
      ["Backup caricato: palestra-2026-11-02.sql (23 byte)"],
    ]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("backup: file name uses the rome date", async () => {
    const { deps, uploads } = fakes({
      content: SQL,
      now: "2026-11-01T23:30:00Z",
    });
    expect(await main([], ENV, deps)).toBe(0);
    expect(uploads.map((u) => u.key)).toEqual(["palestra-2026-11-02.sql"]);
  });

  it("backup: deletes local file when upload fails", async () => {
    const { deps, exports, uploads } = fakes({
      content: SQL,
      uploadError: new AuthError("R2: accesso negato (HTTP 403)"),
    });
    expect(await main([], ENV, deps)).toBe(78);
    expect(uploads).toHaveLength(1);
    const [file = ""] = exports;
    expect(existsSync(file)).toBe(false);
    expect(existsSync(dirname(file))).toBe(false);
    expect(stderr.mock.calls).toEqual([
      ["Backup non riuscito: R2: accesso negato (HTTP 403)"],
    ]);
  });

  it.each([
    { error: new TransientError("R2: HTTP 503"), code: 75 },
    { error: new ParseError("R2: risposta inattesa"), code: 65 },
    { error: new SyncError("R2: HTTP 404"), code: 69 },
  ])(
    "backup: exit $code when upload raises $error.name",
    async ({ error, code }) => {
      const { deps } = fakes({ content: SQL, uploadError: error });
      expect(await main([], ENV, deps)).toBe(code);
      expect(stderr.mock.calls).toEqual([
        [`Backup non riuscito: ${error.message}`],
      ]);
    },
  );

  it("backup: exit 69 when wrangler export fails", async () => {
    const { deps, exports, uploads } = fakes({ exitCode: 1 });
    expect(await main([], ENV, deps)).toBe(69);
    expect(uploads).toEqual([]);
    const [file = ""] = exports;
    expect(existsSync(dirname(file))).toBe(false);
    expect(stderr.mock.calls).toEqual([
      ["Export D1 non riuscito (wrangler exit 1)"],
    ]);
  });

  it.each([
    { label: "empty file", content: "" },
    { label: "no file", content: undefined },
  ])("backup: exit 69 when export is empty ($label)", async ({ content }) => {
    const { deps, exports, uploads } = fakes({ content });
    expect(await main([], ENV, deps)).toBe(69);
    expect(uploads).toEqual([]);
    const [file = ""] = exports;
    expect(existsSync(dirname(file))).toBe(false);
    expect(stderr.mock.calls).toEqual([["Export D1 vuoto"]]);
  });

  it("backup: exit 64 with arguments", async () => {
    const { deps, exports, uploads } = fakes({ content: SQL });
    expect(await main(["--month", "2026-11"], ENV, deps)).toBe(64);
    expect(exports).toEqual([]);
    expect(uploads).toEqual([]);
    expect(stderr.mock.calls).toEqual([
      ["Uso: npm run backup (nessun argomento)"],
    ]);
  });

  it("backup: default upload puts the file in the eu bucket", async () => {
    const requests: { authorization: string | null; body: string }[] = [];
    server.use(
      http.put(
        `https://${ENV.CLOUDFLARE_ACCOUNT_ID}.eu.r2.cloudflarestorage.com/palestra-backup/palestra-2026-11-02.sql`,
        async ({ request }) => {
          requests.push({
            authorization: request.headers.get("authorization"),
            body: await request.text(),
          });
          return new HttpResponse(null, { status: 200 });
        },
      ),
    );
    const { deps } = fakes({ content: SQL });
    const code = await main([], ENV, {
      exportDb: deps.exportDb,
      now: deps.now,
    });
    expect(code).toBe(0);
    expect(requests).toEqual([
      {
        authorization: expect.stringMatching(
          /^AWS4-HMAC-SHA256 Credential=test-key-id\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
        ),
        body: SQL,
      },
    ]);
  });

  it("backup: direct run exits 78 without env", () => {
    // Come `npm run backup` (tsx), con un ambiente senza credenziali: wrangler non parte.
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", join(import.meta.dirname, "../../src/cli/backup.ts")],
      { env: { PATH: process.env.PATH }, encoding: "utf8" },
    );
    expect(result.status).toBe(78);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CLOUDFLARE_API_TOKEN");
  });
});
