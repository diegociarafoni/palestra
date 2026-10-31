import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeAudit } from "../../src/store/audit";

afterEach(() => {
  vi.useRealTimers();
});

describe("store audit", () => {
  it("store: write audit records actor and action", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T09:30:00Z"));
    await writeAudit(env.DB, "test@example.invalid", "measures", "7", "insert");
    vi.setSystemTime(new Date("2026-11-05T09:31:00Z"));
    await writeAudit(
      env.DB,
      "claude-connector",
      "profile",
      "test-key",
      "update",
    );
    const rows = await env.DB.prepare(
      "SELECT at, actor, table_name, row_key, action FROM audit ORDER BY id",
    ).all();
    expect(rows.results).toEqual([
      {
        at: "2026-11-05T09:30:00.000Z",
        actor: "test@example.invalid",
        table_name: "measures",
        row_key: "7",
        action: "insert",
      },
      {
        at: "2026-11-05T09:31:00.000Z",
        actor: "claude-connector",
        table_name: "profile",
        row_key: "test-key",
        action: "update",
      },
    ]);
  });
});
