import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import Esercizi from "../../web/src/pagine/esercizi/Esercizi";
import metrics from "../fixtures/dashboard/metrics.json";
import { renderConTema } from "./render";
import { server } from "./setup";

// Metriche sintetiche: Leg Press con due sedute, Chest Press mai eseguita (da tarare) e una Lat
// Machine con una seduta e un aumento di uno step senza carico noto.
const LAT_MACHINE = {
  slug: "lat-machine",
  name: "Lat Machine",
  sessions: 1,
  first: { date: "2026-11-05", load_kg: 30, reps: 12 },
  last: { date: "2026-11-05", load_kg: 30, reps: 12 },
  e1rm_start_kg: 42,
  e1rm_end_kg: 42,
  e1rm_delta_pct: 0,
  reliability: "da_rivedere",
  next: { load_kg: null, reps_target: 10, action: "increase" },
};
const EXERCISES = {
  strength_table: [...metrics.strength_table, LAT_MACHINE],
  e1rm_series: [
    ...metrics.e1rm_series,
    {
      slug: "lat-machine",
      name: "Lat Machine",
      points: [{ date: "2026-11-05", e1rm_kg: 42 }],
    },
  ],
};

const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("web", () => {
  it("web: esercizi empty state", async () => {
    // Mese senza report: l'API risponde con le due liste vuote.
    let requests = 0;
    server.use(
      http.get("/api/exercises", () => {
        requests += 1;
        return HttpResponse.json({ strength_table: [], e1rm_series: [] });
      }),
    );
    renderConTema(<Esercizi />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Esercizi" }),
    ).toBeTruthy();
    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(requests).toBe(1);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("web: esercizi starts from previous month", async () => {
    // 23:30 UTC del 30/11 sono già le 00:30 del 1/12 a Roma: il mese precedente è novembre.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
    const months: (string | null)[] = [];
    server.use(
      http.get("/api/exercises", ({ request }) => {
        months.push(new URL(request.url).searchParams.get("month"));
        return HttpResponse.json({ strength_table: [], e1rm_series: [] });
      }),
    );
    const user = userEvent.setup();
    renderConTema(<Esercizi />);

    expect(screen.getByText("novembre 2026")).toBeTruthy();
    await screen.findByText("Nessun dato");
    expect(months).toEqual(["2026-11"]);

    await user.click(screen.getByRole("button", { name: "Mese precedente" }));
    expect(screen.getByText("ottobre 2026")).toBeTruthy();
    await waitFor(() => expect(months).toEqual(["2026-11", "2026-10"]));
  });

  it("web: esercizi shows strength table", async () => {
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const table = await screen.findByRole("table", {
      name: "Forza per esercizio",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Esercizio",
      "Sedute",
      "Prima → ultima serie",
      "e1RM inizio → fine (kg)",
      "Variazione e1RM",
      "Affidabilità",
      "Prossimo passo",
    ]);
    const [, legPress, chestPress, latMachine, ...others] =
      within(table).getAllByRole("row");
    if (!legPress || !chestPress || !latMachine) {
      throw new Error("righe mancanti");
    }
    expect(others).toHaveLength(0);
    expect(cells(legPress)).toEqual([
      "Leg Press",
      "2",
      "60 kg × 12 → 65 kg × 10",
      "84 → 86,7",
      "+3,2 %",
      "Confermato",
      "Mantieni → 65 kg × 12",
    ]);
    expect(cells(chestPress)).toEqual([
      "Chest Press",
      "0",
      "—",
      "—",
      "—",
      "—",
      "Tara → × 12",
    ]);
    expect(cells(latMachine)).toEqual([
      "Lat Machine",
      "1",
      "30 kg × 12 → 30 kg × 12",
      "42 → 42",
      "0 %",
      "Da rivedere",
      "Aumenta di uno step → × 10",
    ]);
  });

  it("web: esercizi chart shows one line per exercise", async () => {
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const chart = await screen.findByRole("region", {
      name: "e1RM per esercizio",
    });
    // Legenda (un elenco): solo gli esercizi con almeno un punto (Chest Press non ne ha).
    const legend = within(chart).getByRole("list");
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Leg Press", "Lat Machine"]);
    // Un path SVG non ha ruolo (eccezione di docs/buone-pratiche-mui.md § 9): le linee sono i path
    // fuori dalla legenda. Il colore segue la posizione dell'esercizio nella lista (Lat Machine è
    // il terzo), non quella tra le linee disegnate.
    const strokes = [...chart.querySelectorAll("svg path")]
      .filter((path) => path.closest("li") === null)
      .map((path) => path.getAttribute("stroke"));
    expect(strokes).toEqual([
      "var(--mui-palette-grafici-serie1)",
      "var(--mui-palette-grafici-serie3)",
    ]);
  });

  it("web: esercizi chart keeps eight palette slots", async () => {
    // Nove esercizi con un punto: la palette ha otto slot e non si ricomincia dal primo (skill
    // dataviz); il nono resta nella tabella, e il grafico lo dice.
    const series = Array.from({ length: 9 }, (_, i) => ({
      slug: `esercizio-${i + 1}`,
      name: `Esercizio ${i + 1}`,
      points: [{ date: "2026-11-03", e1rm_kg: 40 + i }],
    }));
    server.use(
      http.get("/api/exercises", () =>
        HttpResponse.json({ strength_table: [], e1rm_series: series }),
      ),
    );
    renderConTema(<Esercizi />);

    const chart = await screen.findByRole("region", {
      name: "e1RM per esercizio",
    });
    expect(
      within(within(chart).getByRole("list"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Esercizio 1",
      "Esercizio 2",
      "Esercizio 3",
      "Esercizio 4",
      "Esercizio 5",
      "Esercizio 6",
      "Esercizio 7",
      "Esercizio 8",
    ]);
    expect(
      within(chart).getByText(
        "Il grafico mostra i primi 8 esercizi: tutti sono nella tabella.",
      ),
    ).toBeTruthy();
  });

  it("web: esercizi api error shows retry", async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(
      http.get("/api/exercises", () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json({ error: "internal" }, { status: 500 })
          : HttpResponse.json(EXERCISES);
      }),
    );
    renderConTema(<Esercizi />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossibile caricare i dati.");
    expect(screen.queryByRole("table")).toBeNull();

    await user.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(
      await screen.findByRole("table", { name: "Forza per esercizio" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requests).toBe(2);
  });

  it("web: esercizi chart without points", async () => {
    // Solo Chest Press, mai eseguita: tabella con una riga, grafico senza assi vuoti.
    server.use(
      http.get("/api/exercises", () =>
        HttpResponse.json({
          strength_table: metrics.strength_table.slice(1),
          e1rm_series: metrics.e1rm_series.slice(1),
        }),
      ),
    );
    renderConTema(<Esercizi />);

    const table = await screen.findByRole("table", {
      name: "Forza per esercizio",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    const chart = screen.getByRole("region", { name: "e1RM per esercizio" });
    expect(within(chart).getByText("Nessun dato")).toBeTruthy();
    expect(chart.querySelector("svg")).toBeNull();
  });
});
