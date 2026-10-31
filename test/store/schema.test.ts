import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// Le chiavi primarie TEXT non sono alias del rowid: senza NOT NULL accetterebbero NULL.
describe("store schema", () => {
  it.each([
    {
      table: "sessions",
      sql: "INSERT INTO sessions (session_id, date, started_at, json) VALUES (NULL, '2026-11-04', '2026-11-04T10:00:00+01:00', '{}')",
    },
    {
      table: "recovery",
      sql: "INSERT INTO recovery (week, json) VALUES (NULL, '{}')",
    },
    {
      table: "planned_sessions",
      sql: "INSERT INTO planned_sessions (id, week, slot, window_days, scheda_day, status) VALUES (NULL, '2026-W45', 1, '[]', 'A', 'programmata')",
    },
    {
      table: "profile",
      sql: "INSERT INTO profile (key, json) VALUES (NULL, '{}')",
    },
    {
      table: "scheda",
      sql: "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES (NULL, '2026-11-03', '2026-11-30', '{}', '')",
    },
  ])("store: $table text primary key rejects null", async ({ sql }) => {
    await expect(env.DB.prepare(sql).run()).rejects.toThrow("NOT NULL");
  });

  it("store: scheda valid_to rejects null", async () => {
    const insert = env.DB.prepare(
      "INSERT INTO scheda (version, valid_from, valid_to, json, md) VALUES ('2026-11', '2026-11-03', NULL, '{}', '')",
    );
    await expect(insert.run()).rejects.toThrow("NOT NULL");
  });
});
