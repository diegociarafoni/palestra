import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

// Lo storage è isolato per file, non per test: ogni test parte da tabelle vuote.
// Ordine compatibile con la chiave esterna timeseries → sessions.
const TABLES = [
  "timeseries",
  "sessions",
  "measures",
  "recovery",
  "planned_sessions",
  "feedback",
  "profile",
  "scheda",
  "reports",
  "metrics",
  "audit",
];

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});
