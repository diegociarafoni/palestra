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
import { BAD_NAMES, STOP_LINES } from "../fixtures/d1-export-casi-limite";

const SCRIPT = join(
  import.meta.dirname,
  "..",
  "..",
  "scripts",
  "prova-ripristino.sh",
);
// Riga finta del backup: non deve mai comparire nell'output dello script.
const ROW = "INSERT INTO measures VALUES('dato-personale');\n";
// Dump sintetico nel formato dell'export di D1 (lo stesso dei test di restore-test).
const DUMP = readFileSync(
  join(import.meta.dirname, "..", "fixtures", "d1-export-sintetico.sql"),
  "utf8",
);
// Casi limite del conteggio, con gli stessi conteggi attesi in test/cli/restore-test.test.ts.
const EDGE = readFileSync(
  join(import.meta.dirname, "..", "fixtures", "d1-export-casi-limite.sql"),
  "utf8",
);
const DONE =
  "Import di palestra-2026-10-31.sql in palestra-restore-test completato; la copia locale è cancellata.";

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
  // `awk` e `sort` veri, ma solo con LC_ALL=C: l'ordine dei nomi deve essere quello di
  // restore-test (unità di codice) anche con un locale italiano.
  for (const tool of ["awk", "sort"]) {
    writeFileSync(
      join(fakeBin, tool),
      `#!/bin/sh\n[ "\${LC_ALL-}" = C ] || exit 9\nexec /usr/bin/${tool} "$@"\n`,
      { mode: 0o755 },
    );
  }
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

  it("prova-ripristino: prints the INSERT count of each table of the dump, nothing else", () => {
    const result = run(["2026-10-31"], { FAKE_DOWNLOAD: DUMP });
    expect(result.status).toBe(0);
    // Come restore-test: 3 in audit (non contano la stringa e il trigger dopo i dati),
    // 2 in sessions, sqlite_sequence escluso; feedback non ha INSERT.
    expect(result.stdout).toBe(
      [
        "tabella                   dump",
        "audit                        3",
        "sessions                     2",
        DONE,
        "",
      ].join("\n"),
    );
    expect(result.stderr).not.toContain("dato-personale");
  });

  it("prova-ripristino: applies the same counting rules as restore-test, names sorted", () => {
    const result = run(["2026-10-31"], { FAKE_DOWNLOAD: EDGE });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        "tabella                   dump",
        "Mixed_Case1                  1",
        "_cfg                         1",
        "_x                           1",
        "a_cf_b                       1",
        "audit                        3",
        "sessions                     1",
        "sqlitex                      1",
        DONE,
        "",
      ].join("\n"),
    );
  });

  it.each(STOP_LINES)(
    "prova-ripristino: counting stops at %j after the data",
    (stop) => {
      const result = run(["2026-10-31"], {
        FAKE_DOWNLOAD: [
          'INSERT INTO "audit" ("id") VALUES(1);',
          stop,
          'INSERT INTO "audit" ("id") VALUES(2);',
          "",
        ].join("\n"),
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        [
          "tabella                   dump",
          "audit                        1",
          DONE,
          "",
        ].join("\n"),
      );
    },
  );

  it("prova-ripristino: a dump without recognised INSERTs prints only the header", () => {
    const result = run(["2026-10-31"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      ["tabella                   dump", DONE, ""].join("\n"),
    );
  });

  it.each(BAD_NAMES)(
    "prova-ripristino: dump table name %j exits 65 before creating",
    (name) => {
      const result = run(["2026-10-31"], {
        FAKE_DOWNLOAD: `INSERT INTO "${name}" ("x") VALUES(1);\n`,
      });
      expect(result.status).toBe(65);
      expect(result.stderr).toContain(
        "Nome di tabella non ammesso nel dump: palestra-2026-10-31.sql",
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain(name);
      expect(calls()).toHaveLength(1);
      expect(readdirSync(tmp)).toEqual([]);
    },
  );

  it("prova-ripristino: an awk failure exits 69 without showing awk's output", () => {
    // awk finto che fallisce stampando una riga del backup, come in un errore di memoria.
    writeFileSync(
      join(fakeBin, "awk"),
      `#!/bin/sh\necho "$FAKE_ROW"\necho "$FAKE_ROW" >&2\nexit 2\n`,
      { mode: 0o755 },
    );
    const result = run(["2026-10-31"]);
    expect(result.status).toBe(69);
    expect(result.stderr).toContain(
      "Conteggio del dump non riuscito (exit 2).",
    );
    expect(result.stderr).not.toContain("Nome di tabella non ammesso");
    expect(`${result.stdout}${result.stderr}`).not.toContain("dato-personale");
    expect(calls()).toHaveLength(1);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("prova-ripristino: uses today's Rome date by default", () => {
    const result = run([]);
    expect(result.status).toBe(0);
    expect(calls()[0]?.[6]).toBe("palestra-backup/palestra-2026-11-02.sql");
  });

  it.each(["d1 create", "d1 execute"])(
    "prova-ripristino: a failing %s prints no dump counts on stdout",
    (step) => {
      const result = run(["2026-10-31"], {
        FAKE_FAIL: step,
        FAKE_DOWNLOAD: DUMP,
      });
      expect(result.status).toBe(69);
      expect(result.stdout).toBe("");
      expect(readdirSync(tmp)).toEqual([]);
    },
  );

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
