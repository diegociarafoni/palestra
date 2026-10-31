import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(
  import.meta.dirname,
  "..",
  "..",
  "scripts",
  "prova-ripristino.sh",
);
// Riga finta del backup: non deve mai comparire nell'output dello script.
const ROW = "INSERT INTO measures VALUES('dato-personale');\n";

let dir: string;
let fakeBin: string;
let tmp: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "prova-ripristino-"));
  fakeBin = join(dir, "bin");
  tmp = join(dir, "tmp");
  mkdirSync(fakeBin);
  mkdirSync(tmp);
  // `npx` finto: registra argomenti e ambiente di ogni chiamata, stampa una riga del
  // backup su stdout e stderr come farebbe wrangler in errore, scrive il download in
  // `--file` (r2 object get) e copia ciò che riceve da importare (d1 execute).
  writeFileSync(
    join(fakeBin, "npx"),
    [
      "#!/bin/sh",
      `printf '%s|' "$@" >> '${join(dir, "calls.txt")}'`,
      `printf '\\n' >> '${join(dir, "calls.txt")}'`,
      `printf '%s %s\\n' "\${WRANGLER_WRITE_LOGS-unset}" "\${WRANGLER_SEND_METRICS-unset}" >> '${join(dir, "env.txt")}'`,
      'echo "$FAKE_ROW"',
      'echo "$FAKE_ROW" >&2',
      `if [ -n "\${FAKE_FAIL-}" ]; then case "$*" in *"$FAKE_FAIL"*) exit 3;; esac; fi`,
      'prev=""',
      'for a in "$@"; do',
      '  if [ "$prev" = "--file" ]; then',
      '    case "$*" in',
      `      *"r2 object get"*) printf '%s' "$FAKE_DOWNLOAD" > "$a";;`,
      `      *"d1 execute"*) cat "$a" > '${join(dir, "imported.sql")}';;`,
      "    esac",
      "  fi",
      '  prev="$a"',
      "done",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  // `date` finto: la data di Roma di oggi è un valore fisso.
  writeFileSync(
    join(fakeBin, "date"),
    [
      "#!/bin/sh",
      `if [ "\${TZ-}" = Europe/Rome ] && [ "$1" = +%F ]; then echo 2026-11-02; else echo sbagliato; fi`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync("bash", [SCRIPT, ...args], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH}`,
      TMPDIR: tmp,
      FAKE_ROW: ROW,
      FAKE_DOWNLOAD: ROW,
      ...env,
    },
    encoding: "utf8",
  });
}

function calls(): string[][] {
  let text = "";
  try {
    text = readFileSync(join(dir, "calls.txt"), "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .slice(0, -1)
    .map((line) => line.split("|").slice(0, -1));
}

describe("prova-ripristino", () => {
  it("prova-ripristino: imports the backup into palestra-restore-test without showing it", () => {
    const result = run(["2026-10-31"]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("dato-personale");
    expect(result.stderr).not.toContain("dato-personale");
    expect(result.stdout).toContain("palestra-restore-test");
    const [get, create, execute, ...rest] = calls();
    const file = get?.at(-1) ?? "";
    expect(get).toEqual([
      "--no",
      "--",
      "wrangler",
      "r2",
      "object",
      "get",
      "palestra-backup/palestra-2026-10-31.sql",
      "--remote",
      "--jurisdiction",
      "eu",
      "--file",
      file,
    ]);
    expect(file.startsWith(`${tmp}/`)).toBe(true);
    expect(create).toEqual([
      "--no",
      "--",
      "wrangler",
      "d1",
      "create",
      "palestra-restore-test",
      "--jurisdiction",
      "eu",
    ]);
    expect(execute).toEqual([
      "--no",
      "--",
      "wrangler",
      "d1",
      "execute",
      "palestra-restore-test",
      "--remote",
      "--file",
      file,
      "--yes",
    ]);
    expect(rest).toEqual([]);
    expect(readFileSync(join(dir, "imported.sql"), "utf8")).toBe(ROW);
    expect(readFileSync(join(dir, "env.txt"), "utf8")).toBe(
      "false false\nfalse false\nfalse false\n",
    );
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("prova-ripristino: uses today's Rome date by default", () => {
    const result = run([]);
    expect(result.status).toBe(0);
    expect(calls()[0]?.[6]).toBe("palestra-backup/palestra-2026-11-02.sql");
  });

  it("prova-ripristino: stops at the first failing step and deletes the download", () => {
    const result = run(["2026-10-31"], { FAKE_FAIL: "d1 create" });
    expect(result.status).toBe(69);
    expect(result.stderr).toContain(
      "Non riuscito: creazione di palestra-restore-test (wrangler exit 3)",
    );
    expect(result.stderr).not.toContain("dato-personale");
    expect(result.stdout).not.toContain("dato-personale");
    expect(calls().map((c) => c.slice(3, 5))).toEqual([
      ["r2", "object"],
      ["d1", "create"],
    ]);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("prova-ripristino: an empty download stops before creating the database", () => {
    const result = run(["2026-10-31"], { FAKE_DOWNLOAD: "" });
    expect(result.status).toBe(69);
    expect(result.stderr).toContain("Backup vuoto");
    expect(calls()).toHaveLength(1);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("prova-ripristino: exit 64 with a malformed date, before calling wrangler", () => {
    const result = run(["31/10/2026"]);
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("Uso: bash scripts/prova-ripristino.sh");
    expect(calls()).toEqual([]);
  });

  it("prova-ripristino: exit 64 with more than one argument", () => {
    const result = run(["2026-10-31", "palestra"]);
    expect(result.status).toBe(64);
    expect(calls()).toEqual([]);
  });
});
