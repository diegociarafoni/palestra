#!/usr/bin/env node
// Controlla che una cartella non contenga dati personali prima di pubblicarla.
// Uso: node scripts/check-public-tree.mjs DIR
// Pattern: variabile PII_PATTERNS (un'espressione regolare per riga, senza
// distinzione tra maiuscole e minuscole) oppure ~/.config/palestra/identificativi.txt.
// Stampa solo percorso e numero di riga, mai il testo trovato.
// Exit code: 0 nessun problema · 1 problemi trovati · 64 argomenti errati · 78 pattern mancanti.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", ".superpowers"]);

function forbiddenPath(rel) {
  const p = rel.split(sep).join("/");
  if (p.startsWith("data/")) return true;
  if (p.startsWith("reports/") && p !== "reports/TEMPLATE.md") return true;
  if (p.startsWith("scheda/") && p !== "scheda/SCHEMA.md") return true;
  if (p.endsWith(".sqlite")) return true;
  return p === "kb/profilo.md";
}

function loadPatterns() {
  let text = process.env.PII_PATTERNS;
  if (!text) {
    const file = join(homedir(), ".config", "palestra", "identificativi.txt");
    if (!existsSync(file)) return null;
    text = readFileSync(file, "utf8");
  }
  const patterns = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    try {
      patterns.push(new RegExp(line, "i"));
    } catch {
      // Mai stampare il pattern: contiene identificativi personali.
      console.error(`pattern ${i + 1} non valido`);
      process.exit(78);
    }
  });
  return patterns;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

const root = process.argv[2];
if (!root || process.argv.length > 3 || !existsSync(root)) {
  console.error("Uso: node scripts/check-public-tree.mjs DIR");
  process.exit(64);
}
const patterns = loadPatterns();
if (!patterns || patterns.length === 0) {
  console.error("Nessun pattern: impostare PII_PATTERNS o ~/.config/palestra/identificativi.txt");
  process.exit(78);
}

let problems = 0;
for (const file of walk(root)) {
  const rel = relative(root, file);
  if (forbiddenPath(rel)) {
    console.log(`${rel}: percorso non ammesso`);
    problems++;
  }
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue; // file binario
  const lines = buffer.toString("utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (patterns.some((re) => re.test(line))) {
      console.log(`${rel}:${i + 1}`);
      problems++;
    }
  });
}
console.log(`${problems} problemi`);
process.exit(problems === 0 ? 0 : 1);
