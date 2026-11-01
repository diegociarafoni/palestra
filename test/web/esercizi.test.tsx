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

// jsdom non calcola il layout: il grafico legge la sua larghezza da getComputedStyle e, a 0 px,
// scarta i punti fuori dall'area di disegno. Qui ogni elemento risulta largo 360 px (un telefono).
function phoneWidth() {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    return new Proxy(style, {
      get: (target, property) => {
        if (property === "width") return "360px";
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
}

// Elementi del grafico con il colore `slot` della palette, fuori dalla legenda: le linee non
// hanno riempimento, i segni dei punti sì.
const marks = (chart: HTMLElement, slot: number) =>
  [
    ...chart.querySelectorAll(
      `svg [stroke="var(--mui-palette-grafici-serie${slot})"]`,
    ),
  ].filter(
    (element) =>
      element.closest("li") === null && element.getAttribute("fill") !== "none",
  );

// Etichette delle tacche dell'asse y: i testi SVG del grafico fatti solo di cifre e virgola.
const yTicks = (chart: HTMLElement) =>
  [...chart.querySelectorAll("svg text")]
    .map((text) => text.textContent ?? "")
    .filter((text) => /^\d+(,\d+)?$/.test(text));

// Etichette delle tacche dell'asse del tempo: i testi SVG del grafico come "3 nov".
const xTicks = (chart: HTMLElement) =>
  [...chart.querySelectorAll("svg text")]
    .map((text) => text.textContent ?? "")
    .filter((text) => /^\d+ [a-z]+$/.test(text));

// Celle di una riga del corpo: l'intestazione (il nome dell'esercizio), poi i valori.
const rowCells = (row: HTMLElement) => [
  within(row).getByRole("rowheader"),
  ...within(row).getAllByRole("cell"),
];
const cells = (row: HTMLElement) =>
  rowCells(row).map((cell) => cell.textContent);

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
    // Dentro una serie gli spazi sono non separabili (\u00a0): da `md` in su i valori vanno a
    // capo solo prima o dopo la freccia, mai tra numero e unità ("65 kg ×" | "10").
    expect(cells(legPress)).toEqual([
      "Leg Press",
      "2",
      "60\u00a0kg\u00a0×\u00a012 → 65\u00a0kg\u00a0×\u00a010",
      "84 → 86,7",
      "+3,2 %",
      "Confermato",
      "Mantieni → 65\u00a0kg\u00a0×\u00a012",
    ]);
    expect(cells(chestPress)).toEqual([
      "Chest Press",
      "0",
      "—",
      "—",
      "—",
      "—",
      "Tara → ×\u00a012",
    ]);
    expect(cells(latMachine)).toEqual([
      "Lat Machine",
      "1",
      "30\u00a0kg\u00a0×\u00a012 → 30\u00a0kg\u00a0×\u00a012",
      "42 → 42",
      "0 %",
      "Da rivedere",
      "Aumenta di uno step → ×\u00a010",
    ]);
  });

  it("web: esercizi one chart per exercise", async () => {
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const section = await screen.findByRole("region", {
      name: "e1RM per esercizio",
    });
    // Un grafico per esercizio con almeno un punto, nell'ordine della lista (Chest Press non ne
    // ha): ognuno è una regione con il nome dell'esercizio come titolo.
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Leg Press", "Lat Machine"]);
    expect(
      within(section).queryByRole("region", { name: "Chest Press" }),
    ).toBeNull();
    for (const name of ["Leg Press", "Lat Machine"]) {
      const chart = within(section).getByRole("region", { name });
      // Una serie per grafico: nessuna legenda, un solo colore. Un path SVG non ha ruolo
      // (eccezione di docs/buone-pratiche-mui.md § 9): la linea è il path senza riempimento.
      expect(within(chart).queryByRole("list")).toBeNull();
      expect(
        [...chart.querySelectorAll('svg path[fill="none"]')].map((path) =>
          path.getAttribute("stroke"),
        ),
      ).toEqual(["var(--mui-palette-grafici-serie1)"]);
    }
  });

  it("web: esercizi chart for every exercise", async () => {
    // Nove esercizi con un punto: un grafico ciascuno, tutti con il primo colore; nessun limite
    // della palette e nessuna nota.
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

    const section = await screen.findByRole("region", {
      name: "e1RM per esercizio",
    });
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Esercizio 1",
      "Esercizio 2",
      "Esercizio 3",
      "Esercizio 4",
      "Esercizio 5",
      "Esercizio 6",
      "Esercizio 7",
      "Esercizio 8",
      "Esercizio 9",
    ]);
    expect(within(section).queryByText(/primi 8 esercizi/)).toBeNull();
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

  it("web: esercizi chart marks every session", async () => {
    // Lat Machine ha una sola seduta: una linea di un punto non si vede, il segno sì.
    phoneWidth();
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const legPress = await screen.findByRole("region", { name: "Leg Press" });
    const latMachine = screen.getByRole("region", { name: "Lat Machine" });
    await waitFor(() => expect(marks(legPress, 1)).toHaveLength(2));
    expect(marks(latMachine, 1)).toHaveLength(1);
  });

  it("web: esercizi chart line joins the points", async () => {
    // Tre sedute di Leg Press: un solo tratto (un "M", moveto) di segmenti dritti (due "L",
    // nessuna curva "C"): tra una seduta e l'altra non ci sono valori misurati da suggerire.
    server.use(
      http.get("/api/exercises", () =>
        HttpResponse.json({
          strength_table: [],
          e1rm_series: [
            {
              slug: "leg-press",
              name: "Leg Press",
              points: [
                { date: "2026-11-03", e1rm_kg: 84 },
                { date: "2026-11-10", e1rm_kg: 86.67 },
                { date: "2026-11-17", e1rm_kg: 86 },
              ],
            },
          ],
        }),
      ),
    );
    renderConTema(<Esercizi />);

    const legPress = await screen.findByRole("region", { name: "Leg Press" });
    const path = legPress
      .querySelector('svg path[fill="none"]')
      ?.getAttribute("d");
    expect(path?.match(/[A-Za-z]/g)).toEqual(["M", "L", "L"]);
  });

  it("web: esercizi chart y ticks in italian", async () => {
    // Ogni grafico ha il suo asse y, con i numeri come nella tabella (it-IT): "8,5", non "8.5".
    server.use(
      http.get("/api/exercises", () =>
        HttpResponse.json({
          strength_table: [],
          e1rm_series: [
            {
              slug: "lat-machine",
              name: "Lat Machine",
              points: [
                { date: "2026-11-03", e1rm_kg: 8 },
                { date: "2026-11-10", e1rm_kg: 9 },
              ],
            },
          ],
        }),
      ),
    );
    renderConTema(<Esercizi />);

    const chart = await screen.findByRole("region", { name: "Lat Machine" });
    expect(yTicks(chart)).toEqual(["8", "8,5", "9"]);
    expect(within(chart).queryByText("8.5")).toBeNull();
  });

  it("web: esercizi chart y axis spans at least 5 % of the mean", async () => {
    // Da 100 a 101 kg (1 %, rumore): l'asse y copre almeno ±5 % della media attorno ai dati, con
    // un margine, e la variazione non riempie l'altezza del grafico. Le tacche dell'asse y sono i
    // soli testi numerici del grafico (un testo SVG non ha ruolo: docs/buone-pratiche-mui.md § 9).
    server.use(
      http.get("/api/exercises", () =>
        HttpResponse.json({
          strength_table: [],
          e1rm_series: [
            {
              slug: "leg-press",
              name: "Leg Press",
              points: [
                { date: "2026-11-03", e1rm_kg: 100 },
                { date: "2026-11-10", e1rm_kg: 101 },
              ],
            },
          ],
        }),
      ),
    );
    renderConTema(<Esercizi />);

    const chart = await screen.findByRole("region", { name: "Leg Press" });
    expect(yTicks(chart)).toEqual(["95", "100", "105"]);
  });

  it("web: esercizi chart keeps the best of the day", async () => {
    // Due sedute di Lat Machine il 3 novembre (40 e 50 kg): un punto solo, il massimo, come la
    // "serie migliore"; con il 10 novembre i punti sono due.
    phoneWidth();
    server.use(
      http.get("/api/exercises", () =>
        HttpResponse.json({
          strength_table: [],
          e1rm_series: [
            {
              slug: "lat-machine",
              name: "Lat Machine",
              points: [
                { date: "2026-11-03", e1rm_kg: 40 },
                { date: "2026-11-03", e1rm_kg: 50 },
                { date: "2026-11-10", e1rm_kg: 45 },
              ],
            },
          ],
        }),
      ),
    );
    renderConTema(<Esercizi />);

    const chart = await screen.findByRole("region", { name: "Lat Machine" });
    await waitFor(() => expect(marks(chart, 1)).toHaveLength(2));
    // L'asse y va da 45 a 50: il 40 non è un punto del grafico.
    expect(within(chart).getByText("50")).toBeTruthy();
    expect(within(chart).queryByText("40")).toBeNull();
  });

  it("web: esercizi chart dates without year", async () => {
    // Le tacche dell'asse del tempo sono giorni del mese scelto: l'anno non si ripete.
    phoneWidth();
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const legPress = await screen.findByRole("region", { name: "Leg Press" });
    await waitFor(() =>
      expect(within(legPress).getByText("3 nov")).toBeTruthy(),
    );
    expect(xTicks(legPress)).toEqual([
      "3 nov",
      "5 nov",
      "7 nov",
      "9 nov",
      "11 nov",
    ]);
    expect(within(legPress).queryByText(/2026/)).toBeNull();
  });

  it("web: esercizi charts share the time axis", async () => {
    // Stesso asse del tempo per tutti i grafici, dalla prima all'ultima seduta del mese (3 e 10
    // novembre) con un giorno di margine: la sola seduta di Lat Machine (5 novembre) ha le
    // stesse tacche di Leg Press, non un asse suo attorno al 5.
    phoneWidth();
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const latMachine = await screen.findByRole("region", {
      name: "Lat Machine",
    });
    await waitFor(() =>
      expect(within(latMachine).getByText("3 nov")).toBeTruthy(),
    );
    const legPress = screen.getByRole("region", { name: "Leg Press" });
    expect(xTicks(latMachine)).toEqual([
      "3 nov",
      "5 nov",
      "7 nov",
      "9 nov",
      "11 nov",
    ]);
    expect(xTicks(latMachine)).toEqual(xTicks(legPress));
  });

  it("web: esercizi chart with a single date", async () => {
    // Tutte le sedute del mese nello stesso giorno: l'asse del tempo non si riduce a un punto
    // senza tacche, la data della seduta si legge.
    phoneWidth();
    server.use(
      http.get("/api/exercises", () =>
        HttpResponse.json({
          strength_table: [],
          e1rm_series: [
            {
              slug: "lat-machine",
              name: "Lat Machine",
              points: [{ date: "2026-11-03", e1rm_kg: 42 }],
            },
          ],
        }),
      ),
    );
    renderConTema(<Esercizi />);

    const chart = await screen.findByRole("region", { name: "Lat Machine" });
    await waitFor(() => expect(marks(chart, 1)).toHaveLength(1));
    expect(within(chart).getByText("3 nov")).toBeTruthy();
  });

  it("web: esercizi table rows headed by exercise", async () => {
    // Il nome dell'esercizio è l'intestazione della sua riga: un lettore di schermo lo ripete
    // davanti a ogni valore.
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const table = await screen.findByRole("table", {
      name: "Forza per esercizio",
    });
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((header) => header.textContent),
    ).toEqual(["Leg Press", "Chest Press", "Lat Machine"]);
  });

  it("web: esercizi table keeps the exercise in view", async () => {
    // A 360 px la tabella scorre in orizzontale: la colonna dell'esercizio resta ferma a sinistra,
    // con lo sfondo del foglio perché i valori le scorrono sotto (anche nell'intestazione) e un
    // bordo a destra che separa il nome dai valori tagliati.
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const table = await screen.findByRole("table", {
      name: "Forza per esercizio",
    });
    const first = [
      within(table).getByRole("columnheader", { name: "Esercizio" }),
      ...within(table).getAllByRole("rowheader"),
    ];
    expect(first).toHaveLength(4);
    for (const cell of first) {
      const style = getComputedStyle(cell);
      expect([
        style.position,
        style.left,
        style.backgroundColor,
        style.borderRightStyle,
      ]).toEqual([
        "sticky",
        "0px",
        "var(--mui-palette-background-paper)",
        "solid",
      ]);
    }
  });

  it("web: esercizi table readable on a phone", async () => {
    // A 360 px la tabella scorre in orizzontale: i valori restano su una riga ("60 kg × 12 → 65
    // kg × 10" non va a capo in quattro righe); solo il nome dell'esercizio può andare a capo.
    server.use(http.get("/api/exercises", () => HttpResponse.json(EXERCISES)));
    renderConTema(<Esercizi />);

    const table = await screen.findByRole("table", {
      name: "Forza per esercizio",
    });
    const [, legPress] = within(table).getAllByRole("row");
    if (!legPress) throw new Error("riga mancante");
    expect(
      rowCells(legPress).map((cell) => getComputedStyle(cell).whiteSpace),
    ).toEqual([
      "normal",
      "nowrap",
      "nowrap",
      "nowrap",
      "nowrap",
      "nowrap",
      "nowrap",
    ]);
  });
});
