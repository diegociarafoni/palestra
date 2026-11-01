import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import Report from "../../web/src/pagine/report/Report";
import { renderConTema } from "./render";
import { server } from "./setup";

// Report sintetico con una tabella GFM e un collegamento.
const REPORT_WITH_TABLE = `# Report novembre 2026

| Esercizio | Serie | Ripetizioni |
| --- | --- | --- |
| Leg Press | 3 | 10-12 |

Regole in [linee guida](https://example.com/linee-guida).
`;

describe("web", () => {
  it("web: report renders markdown table", async () => {
    // 23:30 UTC del 30/11 sono già le 00:30 del 1/12 a Roma: il mese precedente è novembre.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
    const months: string[] = [];
    server.use(
      http.get("/api/reports/:month", ({ params }) => {
        months.push(String(params.month));
        return HttpResponse.json({
          month: "2026-11",
          report: REPORT_WITH_TABLE,
          revisione: null,
        });
      }),
    );
    renderConTema(<Report />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Report mensile" }),
    ).toBeTruthy();
    expect(screen.getByText("novembre 2026")).toBeTruthy();
    const report = await screen.findByRole("region", { name: "Report" });
    const table = within(report).getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Esercizio", "Serie", "Ripetizioni"]);
    expect(
      within(table)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Leg Press", "3", "10-12"]);
    expect(
      within(report)
        .getByRole("link", { name: "linee guida" })
        .getAttribute("href"),
    ).toBe("https://example.com/linee-guida");
    expect(screen.queryByRole("region", { name: "Revisione" })).toBeNull();
    expect(months).toEqual(["2026-11"]);
  });

  it("web: report shows revisione", async () => {
    server.use(
      http.get("/api/reports/:month", () =>
        HttpResponse.json({
          month: "2026-11",
          report: REPORT_WITH_TABLE,
          revisione:
            "# Revisione novembre 2026\n\nNessuna modifica ai carichi.\n",
        }),
      ),
    );
    renderConTema(<Report />);

    const revisione = await screen.findByRole("region", { name: "Revisione" });
    expect(
      within(revisione).getByRole("heading", {
        level: 2,
        name: "Revisione novembre 2026",
      }),
    ).toBeTruthy();
    expect(
      within(revisione).getByText("Nessuna modifica ai carichi."),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "Report" })).toBeTruthy();
  });

  it("web: report month selector changes month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
    const user = userEvent.setup();
    const months: string[] = [];
    server.use(
      http.get("/api/reports/:month", ({ params }) => {
        months.push(String(params.month));
        return params.month === "2026-11"
          ? HttpResponse.json({
              month: "2026-11",
              report: REPORT_WITH_TABLE,
              revisione: null,
            })
          : HttpResponse.json({ error: "not_found" }, { status: 404 });
      }),
    );
    renderConTema(<Report />);
    await screen.findByRole("region", { name: "Report" });
    const previous = screen.getByRole("button", { name: "Mese precedente" });
    const next = screen.getByRole("button", { name: "Mese successivo" });

    await user.click(previous);
    expect(screen.getByText("ottobre 2026")).toBeTruthy();
    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(months.at(-1)).toBe("2026-10");

    // Avanti fino a gennaio (cambio d'anno), poi indietro a dicembre.
    await user.click(next);
    await user.click(next);
    await user.click(next);
    expect(screen.getByText("gennaio 2027")).toBeTruthy();
    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(months.at(-1)).toBe("2027-01");
    await user.click(previous);
    expect(screen.getByText("dicembre 2026")).toBeTruthy();
    await waitFor(() => expect(months.at(-1)).toBe("2026-12"));
  });

  it("web: report empty state", async () => {
    // 404: il mese non ha né report né revisione (corpo fisso dell'API).
    server.use(
      http.get("/api/reports/:month", () =>
        HttpResponse.json({ error: "not_found" }, { status: 404 }),
      ),
    );
    renderConTema(<Report />);

    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Report" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("web: report error shows retry", async () => {
    server.use(
      http.get("/api/reports/:month", () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    renderConTema(<Report />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossibile caricare i dati.");
    expect(within(alert).getByRole("button", { name: "Riprova" })).toBeTruthy();
  });
});
