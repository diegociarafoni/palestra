import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
  SyncError,
  TransientError,
  UpstreamError,
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
let fakeDir: string | undefined;
beforeEach(() => {
  stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  if (fakeDir) rmSync(fakeDir, { recursive: true, force: true });
  fakeDir = undefined;
});

/** Esegue la CLI come `npm run backup` (tsx), con l'ambiente indicato e nient'altro. */
function runCli(env: Record<string, string | undefined>) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", join(import.meta.dirname, "../../src/cli/backup.ts")],
    { env, encoding: "utf8" },
  );
}

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

  it("backup: exit 78 with an empty variable", async () => {
    // GitHub Actions passa un segreto non definito come stringa vuota.
    const { deps, exports, uploads } = fakes({ content: SQL });
    const code = await main([], { ...ENV, R2_SECRET_ACCESS_KEY: "" }, deps);
    expect(code).toBe(78);
    expect(exports).toEqual([]);
    expect(uploads).toEqual([]);
    expect(stderr.mock.calls).toEqual([
      ["Variabili d'ambiente mancanti: R2_SECRET_ACCESS_KEY"],
    ]);
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
    // Mai nella cartella di lavoro (il repository): sempre nella temp di sistema.
    expect(dirname(dirname(file))).toBe(tmpdir());
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
    { error: new UpstreamError("R2: HTTP 404"), code: 69 },
    // exitCodeFor condiviso (src/errors.ts): un SyncError non previsto dà 70.
    { error: new SyncError("imprevisto"), code: 70 },
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
    // Stessi valori del test di put-object (credenziali dell'AWS SigV4 test suite):
    // firma letterale, quindi anche un segreto o un istante sbagliati la cambiano.
    const objectUrl =
      "https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com/palestra-backup/palestra-2026-11-02.sql";
    const requests: {
      url: string;
      authorization: string | null;
      body: string;
    }[] = [];
    server.use(
      http.put(objectUrl, async ({ request }) => {
        requests.push({
          url: request.url,
          authorization: request.headers.get("authorization"),
          body: await request.text(),
        });
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const { deps } = fakes({ content: SQL, now: "2026-11-02T03:00:00Z" });
    const code = await main(
      [],
      {
        CLOUDFLARE_API_TOKEN: "test-token",
        CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
        R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
        R2_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      },
      { exportDb: deps.exportDb, now: deps.now },
    );
    expect(code).toBe(0);
    expect(requests).toEqual([
      {
        url: objectUrl,
        authorization:
          "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261102/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=2bbc901ccde0233bbd7a061337479044d1394a0df54613d02d39e02385664763",
        body: "CREATE TABLE prova(x);\n",
      },
    ]);
  });

  it("backup: default upload is signed with the clock at put time", async () => {
    // Nome del file dal primo istante (Roma: 2 novembre), firma dall'orologio letto al
    // momento della PUT: x-amz-date non resta indietro di tutta la durata dell'export.
    const requests: { url: string; date: string | null }[] = [];
    server.use(
      http.put(/.*/, ({ request }) => {
        requests.push({
          url: request.url,
          date: request.headers.get("x-amz-date"),
        });
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const clock = ["2026-11-01T23:30:00Z", "2026-11-02T03:00:00Z"];
    const { deps } = fakes({ content: SQL });
    const code = await main([], ENV, {
      exportDb: deps.exportDb,
      now: () => new Date(clock.shift() ?? "2099-01-01T00:00:00Z"),
    });
    expect(code).toBe(0);
    expect(requests).toEqual([
      {
        url: "https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com/palestra-backup/palestra-2026-11-02.sql",
        date: "20261102T030000Z",
      },
    ]);
  });

  it("backup: direct run exits 78 without env", () => {
    // Con un ambiente senza credenziali: wrangler non parte.
    const result = runCli({ PATH: process.env.PATH });
    expect(result.status).toBe(78);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CLOUDFLARE_API_TOKEN");
  });

  it("backup: wrangler output never reaches the logs and wrangler never sees the R2 keys", () => {
    // `npx` finto, primo nel PATH: registra gli argomenti e il proprio ambiente, scrive
    // l'export e stampa un link firmato su stdout e stderr, come wrangler.
    fakeDir = mkdtempSync(join(tmpdir(), "backup-fake-npx-"));
    const argsFile = join(fakeDir, "args.txt");
    const envFile = join(fakeDir, "env.txt");
    writeFileSync(
      join(fakeDir, "npx"),
      [
        "#!/bin/sh",
        `printf '%s\\n' "$@" > '${argsFile}'`,
        `printf '%s\\n' "\${WRANGLER_WRITE_LOGS-unset}" "\${WRANGLER_SEND_METRICS-unset}" "\${R2_ACCESS_KEY_ID-unset}" "\${R2_SECRET_ACCESS_KEY-unset}" > '${envFile}'`,
        'prev=""',
        'for a in "$@"; do',
        '  if [ "$prev" = "--output" ]; then printf \'CREATE TABLE t(x);\\n\' > "$a"; fi',
        '  prev="$a"',
        "done",
        "echo https://signed.invalid/xyz",
        "echo https://signed.invalid/xyz >&2",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    // Account id non valido: putObject fallisce con AuthError prima di qualunque rete.
    const result = runCli({
      PATH: `${fakeDir}:${process.env.PATH}`,
      TMPDIR: tmpdir(),
      CLOUDFLARE_API_TOKEN: "t",
      CLOUDFLARE_ACCOUNT_ID: "x/y",
      R2_ACCESS_KEY_ID: "k",
      R2_SECRET_ACCESS_KEY: "s",
    });
    expect(result.status).toBe(78);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Backup non riuscito: R2:");
    expect(result.stderr).not.toContain("signed.invalid");
    const args = readFileSync(argsFile, "utf8").split("\n").slice(0, -1);
    const output = args.at(-1) ?? "";
    expect(args).toEqual([
      "--no",
      "--",
      "wrangler",
      "d1",
      "export",
      "palestra",
      "--remote",
      "--skip-confirmation",
      "--output",
      output,
    ]);
    expect(dirname(dirname(output))).toBe(tmpdir());
    expect(basename(dirname(output))).toMatch(/^palestra-backup-.{6}$/);
    expect(basename(output)).toMatch(/^palestra-\d{4}-\d{2}-\d{2}\.sql$/);
    expect(existsSync(dirname(output))).toBe(false);
    // Wrangler scrive ogni riga di log, link firmato compreso, anche in un file su disco;
    // niente telemetria; le chiavi R2 servono solo all'upload, non a wrangler.
    expect(readFileSync(envFile, "utf8")).toBe("false\nfalse\nunset\nunset\n");
  });

  it("backup: exit 69 when npx cannot be started", () => {
    // PATH con una sola cartella vuota: spawn("npx") fallisce con ENOENT.
    fakeDir = mkdtempSync(join(tmpdir(), "backup-no-npx-"));
    const result = runCli({ ...ENV, PATH: fakeDir, TMPDIR: tmpdir() });
    expect(result.status).toBe(69);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Export D1 non riuscito (wrangler exit 127)\n");
  });
});
