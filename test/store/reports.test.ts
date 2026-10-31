import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMetrics,
  getReport,
  saveMetrics,
  saveReport,
} from "../../src/store/reports";

afterEach(() => {
  vi.useRealTimers();
});

describe("store reports", () => {
  it("store: report and metrics roundtrip", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    expect(await getReport(env.DB, "2026-11", "report")).toBeNull();
    expect(await getMetrics(env.DB, "2026-11")).toEqual({});

    vi.setSystemTime(new Date("2026-12-01T05:00:00Z"));
    await saveReport(env.DB, "2026-11", "report", "# Report v1");
    vi.setSystemTime(new Date("2026-12-01T06:00:00Z"));
    await saveReport(env.DB, "2026-11", "report", "# Report v2");
    await saveReport(env.DB, "2026-11", "revisione", "# Revisione");
    expect(await getReport(env.DB, "2026-11", "report")).toBe("# Report v2");
    expect(await getReport(env.DB, "2026-11", "revisione")).toBe("# Revisione");
    expect(await getReport(env.DB, "2026-10", "report")).toBeNull();
    const reports = await env.DB.prepare(
      "SELECT month, kind, created_at FROM reports ORDER BY kind",
    ).all();
    expect(reports.results).toEqual([
      {
        month: "2026-11",
        kind: "report",
        created_at: "2026-12-01T06:00:00.000Z",
      },
      {
        month: "2026-11",
        kind: "revisione",
        created_at: "2026-12-01T06:00:00.000Z",
      },
    ]);

    await saveMetrics(env.DB, "2026-11", {
      adherence: { done: 7, planned: 8 },
      sessions: 7,
    });
    await saveMetrics(env.DB, "2026-11", { sessions: 8 });
    await saveMetrics(env.DB, "2026-10", { sessions: 1 });
    expect(await getMetrics(env.DB, "2026-11")).toEqual({
      adherence: { done: 7, planned: 8 },
      sessions: 8,
    });
  });

  it("store: saving empty metrics is a no-op", async () => {
    // D1 rifiuta un batch vuoto: con {} non si deve chiamare batch.
    await expect(saveMetrics(env.DB, "2026-11", {})).resolves.toBeUndefined();
    expect(await getMetrics(env.DB, "2026-11")).toEqual({});
  });
});
