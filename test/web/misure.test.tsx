import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import Misure from "../../web/src/pagine/misure/Misure";
import measures from "../fixtures/dashboard/measures.json";
import { renderConTema } from "./render";
import { server } from "./setup";

const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("web", () => {
  it("web: misure shows measures", async () => {
    // Due misure sintetiche: la prima in protocollo, la seconda no.
    server.use(
      http.get("/api/measures", () => HttpResponse.json({ measures })),
    );
    renderConTema(<Misure />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Misure" }),
    ).toBeTruthy();
    const table = await screen.findByRole("table", { name: "Tutte le misure" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual([
      "Data e ora",
      "Peso (kg)",
      "Vita (cm)",
      "Muscolo (kg)",
      "Grasso (kg)",
      "Grasso (%)",
      "Condizione",
      "In protocollo",
    ]);
    const [, first, second] = within(table).getAllByRole("row");
    if (!first || !second) throw new Error("righe mancanti");
    expect(cells(first)).toEqual([
      "3 nov 2026, 08:00",
      "80",
      "90",
      "35",
      "16",
      "20",
      "digiuno",
      "Sì",
    ]);
    expect(cells(second)).toEqual([
      "17 nov 2026, 18:30",
      "81",
      "—",
      "—",
      "—",
      "—",
      "dopo pranzo",
      "No",
    ]);
    expect(
      screen.getByRole("heading", { level: 2, name: "Peso in protocollo" }),
    ).toBeTruthy();
  });

  it("web: misure empty state", async () => {
    server.use(
      http.get("/api/measures", () => HttpResponse.json({ measures: [] })),
    );
    renderConTema(<Misure />);

    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("web: misure chart without protocol measures", async () => {
    // Solo la misura fuori protocollo: tabella con una riga, grafico senza assi vuoti.
    server.use(
      http.get("/api/measures", () =>
        HttpResponse.json({ measures: measures.filter((m) => !m.in_protocol) }),
      ),
    );
    renderConTema(<Misure />);

    const table = await screen.findByRole("table", { name: "Tutte le misure" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    const chart = screen.getByRole("region", { name: "Peso in protocollo" });
    expect(within(chart).getByText("Nessun dato")).toBeTruthy();
    expect(chart.querySelector("svg")).toBeNull();
  });

  it("web: api error shows retry", async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(
      http.get("/api/measures", () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json({ error: "internal" }, { status: 500 })
          : HttpResponse.json({ measures });
      }),
    );
    renderConTema(<Misure />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossibile caricare i dati.");
    expect(screen.queryByRole("table")).toBeNull();

    await user.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(
      await screen.findByRole("table", { name: "Tutte le misure" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requests).toBe(2);
  });
});
