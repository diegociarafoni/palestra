import { describe, expect, it } from "vitest";
import { romeDate } from "../../src/domain/dates";

describe("dates", () => {
  it("dates: rome date", () => {
    expect(romeDate("2026-10-29T23:30:00Z")).toBe("2026-10-30");
    expect(romeDate("2026-07-01T22:30:00Z")).toBe("2026-07-02");
    expect(romeDate("2026-11-05T22:30:00Z")).toBe("2026-11-05");
  });
});
