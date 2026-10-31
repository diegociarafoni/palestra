import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MODULE = join(import.meta.dirname, "..", "..", "src", "cli", "wrangler.ts");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wrangler-fake-npx-"));
  // `npx` finto: registra argomenti e ambiente, stampa JSON su stdout e una riga
  // "di dati" su stderr, esce con 7.
  writeFileSync(
    join(dir, "npx"),
    [
      "#!/bin/sh",
      `printf '%s\\n' "$@" > '${join(dir, "args.txt")}'`,
      `printf '%s\\n' "\${WRANGLER_WRITE_LOGS-unset}" "\${WRANGLER_SEND_METRICS-unset}" "\${R2_ACCESS_KEY_ID-unset}" "\${R2_SECRET_ACCESS_KEY-unset}" > '${join(dir, "env.txt")}'`,
      `echo '{"ok":1}'`,
      "echo dato-personale >&2",
      "exit 7",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// runWrangler in un processo figlio: così si vede che cosa arriva davvero al terminale.
function runInChild(capture: boolean, path: string) {
  const code = [
    `import { runWrangler } from ${JSON.stringify(MODULE)};`,
    `const r = await runWrangler(["d1", "execute", "x", "--json"], { capture: ${capture} });`,
    "process.stdout.write(JSON.stringify(r));",
  ].join("\n");
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      env: {
        PATH: path,
        R2_ACCESS_KEY_ID: "k",
        R2_SECRET_ACCESS_KEY: "s",
      },
      encoding: "utf8",
    },
  );
}

describe("wrangler", () => {
  it("wrangler: captured stdout goes only to the caller, stderr nowhere", () => {
    const result = runInChild(true, `${dir}:${process.env.PATH}`);
    expect(result.stdout).toBe('{"code":7,"stdout":"{\\"ok\\":1}\\n"}');
    expect(result.stderr).not.toContain("dato-personale");
    expect(readFileSync(join(dir, "args.txt"), "utf8")).toBe(
      "--no\n--\nwrangler\nd1\nexecute\nx\n--json\n",
    );
    // Niente log su disco né telemetria; le chiavi R2 servono solo a R2.
    expect(readFileSync(join(dir, "env.txt"), "utf8")).toBe(
      "false\nfalse\nunset\nunset\n",
    );
  });

  it("wrangler: without capture nothing reaches the terminal", () => {
    const result = runInChild(false, `${dir}:${process.env.PATH}`);
    expect(result.stdout).toBe('{"code":7,"stdout":""}');
    expect(result.stderr).not.toContain("dato-personale");
  });

  it("wrangler: code 127 when npx cannot be started", () => {
    const empty = mkdtempSync(join(tmpdir(), "wrangler-no-npx-"));
    try {
      // node stesso resta raggiungibile tramite process.execPath.
      const result = runInChild(false, empty);
      expect(result.stdout).toBe('{"code":127,"stdout":""}');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
