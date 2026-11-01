import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { queryKeys } from "../../web/src/api/keys";
import Misure from "../../web/src/pagine/misure/Misure";
import measures from "../fixtures/dashboard/measures.json";
import { renderConTema } from "./render";
import { server } from "./setup";

// x di ogni punto della linea dal `d` del path SVG: l'ultima coppia "x,y" di ogni comando (M, L, C).
const vertexXs = (d: string) =>
  d
    .split(/[MLC]/)
    .filter(Boolean)
    .map((command) => Number(command.split(",").at(-2)));

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

  it("web: table text is 16 px", async () => {
    // docs/buone-pratiche-mui.md § 8: testo di base almeno 16 px (1rem), anche nelle tabelle.
    server.use(
      http.get("/api/measures", () => HttpResponse.json({ measures })),
    );
    renderConTema(<Misure />);

    const table = await screen.findByRole("table", { name: "Tutte le misure" });
    const [header] = within(table).getAllByRole("columnheader");
    const [cell] = within(table).getAllByRole("cell");
    if (!header || !cell) throw new Error("celle mancanti");
    expect(getComputedStyle(header).fontSize).toBe("16px");
    expect(getComputedStyle(cell).fontSize).toBe("16px");
  });

  it("web: measures table readable on a phone", async () => {
    server.use(
      http.get("/api/measures", () => HttpResponse.json({ measures })),
    );
    renderConTema(<Misure />);

    const table = await screen.findByRole("table", { name: "Tutte le misure" });
    // Intestazioni dei numeri allineate a destra come le loro celle.
    for (const name of [
      "Peso (kg)",
      "Vita (cm)",
      "Muscolo (kg)",
      "Grasso (kg)",
      "Grasso (%)",
    ]) {
      const header = within(table).getByRole("columnheader", { name });
      expect(getComputedStyle(header).textAlign).toBe("right");
    }
    // Data e ora su una riga: a 360 px la tabella scorre in orizzontale.
    const date = within(table).getByRole("cell", { name: "3 nov 2026, 08:00" });
    expect(getComputedStyle(date).whiteSpace).toBe("nowrap");
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
    // Solo la misura fuori protocollo, senza ora: tabella con una riga, grafico senza assi vuoti.
    const outside = measures
      .filter((m) => !m.in_protocol)
      .map((m) => ({ ...m, time: null }));
    server.use(
      http.get("/api/measures", () => HttpResponse.json({ measures: outside })),
    );
    renderConTema(<Misure />);

    const table = await screen.findByRole("table", { name: "Tutte le misure" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1] && cells(rows[1])[0]).toBe("17 nov 2026");
    const chart = screen.getByRole("region", { name: "Peso in protocollo" });
    expect(within(chart).getByText("Nessun dato")).toBeTruthy();
    expect(chart.querySelector("svg")).toBeNull();
  });

  it("web: weight chart spaces points by date", async () => {
    // Tre misure in protocollo il 3, il 5 e il 24 novembre: la seconda sta a 2/21 del tratto.
    const [base] = measures;
    const inProtocol = [
      ["2026-11-03", 80],
      ["2026-11-05", 80.5],
      ["2026-11-24", 81],
    ].map(([date, weight_kg]) => ({ ...base, date, weight_kg }));
    server.use(
      http.get("/api/measures", () =>
        HttpResponse.json({ measures: inProtocol }),
      ),
    );
    renderConTema(<Misure />);

    const chart = await screen.findByRole("region", {
      name: "Peso in protocollo",
    });
    // Un path SVG non ha ruolo (eccezione di docs/buone-pratiche-mui.md § 9): la linea è l'unico path.
    const line = chart.querySelector("svg path");
    const [x0, x1, x2] = vertexXs(line?.getAttribute("d") ?? "");
    if (x0 === undefined || x1 === undefined || x2 === undefined) {
      throw new Error("punti della linea mancanti");
    }
    expect((x1 - x0) / (x2 - x0)).toBeCloseTo(2 / 21, 3);
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

  it("web: failed refetch keeps data", async () => {
    // Le misure arrivano; il nuovo caricamento in background (es. ritorno sulla pagina) fallisce.
    let requests = 0;
    server.use(
      http.get("/api/measures", () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json({ measures })
          : HttpResponse.json({ error: "internal" }, { status: 500 });
      }),
    );
    const { queryClient } = renderConTema(<Misure />);
    await screen.findByRole("table", { name: "Tutte le misure" });

    await act(() => queryClient.refetchQueries());
    // TanStack Query avvisa i componenti con un setTimeout(0): si aspetta quel giro prima di guardare.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(requests).toBe(2);
    expect(queryClient.getQueryState(queryKeys.measures)?.status).toBe("error");
    expect(screen.getByRole("table", { name: "Tutte le misure" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
