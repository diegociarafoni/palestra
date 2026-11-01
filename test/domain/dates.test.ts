import { describe, expect, it } from "vitest";
import { isoWeek, lastDayOfMonth, romeDate } from "../../src/domain/dates";

describe("dates", () => {
  it("dates: rome date", () => {
    expect(romeDate("2026-10-29T23:30:00Z")).toBe("2026-10-30");
    expect(romeDate("2026-07-01T22:30:00Z")).toBe("2026-07-02");
    expect(romeDate("2026-11-05T22:30:00Z")).toBe("2026-11-05");
  });

  it("dates: iso week", () => {
    expect(isoWeek("2026-11-03")).toBe("2026-W45");
    expect(isoWeek("2026-11-01")).toBe("2026-W44");
    expect(isoWeek("2025-12-29")).toBe("2026-W01");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
  });

  it("dates: last day of month", () => {
    expect(lastDayOfMonth("2026-11")).toBe("2026-11-30");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
  });
});
