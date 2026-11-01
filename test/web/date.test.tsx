import { describe, expect, it } from "vitest";
import {
  chartDate,
  dayAxisBounds,
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

  it("web: day axis keeps a day before and after the points", () => {
    // Un giorno di margine per lato: il primo e l'ultimo punto non stanno sulle linee degli
    // assi, e una data sola ha comunque un asse con le sue tacche.
    const iso = ({ min, max }: { min: Date; max: Date }) => [
      min.toISOString(),
      max.toISOString(),
    ];
    expect(iso(dayAxisBounds("2026-11-03", "2026-11-10"))).toEqual([
      "2026-11-02T00:00:00.000Z",
      "2026-11-11T00:00:00.000Z",
    ]);
    expect(iso(dayAxisBounds("2026-11-03", "2026-11-03"))).toEqual([
      "2026-11-02T00:00:00.000Z",
      "2026-11-04T00:00:00.000Z",
    ]);
  });
});
