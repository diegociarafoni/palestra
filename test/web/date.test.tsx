import { describe, expect, it } from "vitest";
import {
  chartDate,
  formatChartDate,
  formatDayAxis,
} from "../../web/src/utils/date";

describe("web", () => {
  it("web: chart dates keep the Rome calendar day", () => {
    expect(chartDate("2026-11-03").toISOString()).toBe(
      "2026-11-03T00:00:00.000Z",
    );
    expect(formatChartDate(chartDate("2026-11-03"))).toBe("3 nov 2026");
    // Giorni del cambio d'ora: mezzanotte UTC è all'01:00 e alle 02:00 di Roma, stesso giorno.
    expect(formatChartDate(chartDate("2026-03-29"))).toBe("29 mar 2026");
    expect(formatChartDate(chartDate("2026-10-25"))).toBe("25 ott 2026");
  });

  it("web: day axis without year on ticks, full date elsewhere", () => {
    // Tacche dentro un mese: senza anno. Tooltip: la data completa.
    expect(formatDayAxis(chartDate("2026-11-03"), { location: "tick" })).toBe(
      "3 nov",
    );
    expect(
      formatDayAxis(chartDate("2026-11-03"), { location: "tooltip" }),
    ).toBe("3 nov 2026");
    // Cambio d'ora: mezzanotte UTC è già lo stesso giorno a Roma.
    expect(formatDayAxis(chartDate("2026-03-29"), { location: "tick" })).toBe(
      "29 mar",
    );
  });
});
