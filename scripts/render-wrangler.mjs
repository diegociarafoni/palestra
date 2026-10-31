#!/usr/bin/env node
// Scrive wrangler.toml (in .gitignore) da wrangler.template.toml, nella cartella corrente,
// sostituendo il segnaposto con l'identificativo del database letto da D1_DATABASE_ID.
// Uso: D1_DATABASE_ID=… node scripts/render-wrangler.mjs
// Non stampa mai l'identificativo.
// Exit code: 0 file scritto · 78 variabile mancante o non valida (nessun file scritto).
import { readFileSync, writeFileSync } from "node:fs";

const PLACEHOLDER = "<D1_DATABASE_ID>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const id = process.env.D1_DATABASE_ID;
if (!id || !UUID.test(id)) {
  // Mai stampare il valore ricevuto.
  console.error("D1_DATABASE_ID mancante o non valido: serve un UUID");
  process.exit(78);
}
const template = readFileSync("wrangler.template.toml", "utf8");
writeFileSync("wrangler.toml", template.replaceAll(PLACEHOLDER, id));
