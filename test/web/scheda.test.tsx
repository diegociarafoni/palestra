import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import Scheda from "../../web/src/pagine/scheda/Scheda";
import { SCHEDA_MD } from "../fixtures/dashboard/markdown";
import schedaFixture from "../fixtures/scheda-esempio.json";
import { renderConTema } from "./render";
import { server } from "./setup";

describe("web", () => {
  it("web: scheda renders active scheda", async () => {
    server.use(
      http.get("/api/scheda", () =>
        HttpResponse.json({
          version: "2026-11",
          valid_from: "2026-11-03",
          valid_to: "2026-11-30",
          md: SCHEDA_MD,
          json: schedaFixture,
        }),
      ),
    );
    renderConTema(<Scheda />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Scheda" }),
    ).toBeTruthy();
    expect(await screen.findByText("Versione 2026-11")).toBeTruthy();
    expect(
      screen.getByText("Valida dal 3 novembre 2026 al 30 novembre 2026"),
    ).toBeTruthy();
    // I titoli del Markdown scendono di un livello: l'unico h1 resta il titolo della pagina.
    expect(
      screen.getByRole("heading", { level: 2, name: "Scheda 2026-11" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Giorno A" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Skillbike (riscaldamento), 8 minuti, RPE 4-5",
      "Leg Press, 3 serie da 10-12",
      "Run Artis, 12 minuti, 6-6,5 km/h, pendenza 6 %",
    ]);
  });

  it("web: scheda empty state", async () => {
    // 404: nessuna scheda attiva oggi (corpo fisso dell'API).
    server.use(
      http.get("/api/scheda", () =>
        HttpResponse.json({ error: "not_found" }, { status: 404 }),
      ),
    );
    renderConTema(<Scheda />);

    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("web: scheda error shows retry", async () => {
    server.use(
      http.get("/api/scheda", () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    renderConTema(<Scheda />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossibile caricare i dati.");
    expect(within(alert).getByRole("button", { name: "Riprova" })).toBeTruthy();
    expect(screen.queryByText("Nessun dato")).toBeNull();
  });
});
