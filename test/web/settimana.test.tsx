import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import Settimana from "../../web/src/pagine/settimana/Settimana";
import slots from "../fixtures/dashboard/slots.json";
import { renderConTema } from "./render";
import { server } from "./setup";

// Settimana sintetica 2026-W45 del modello di esempio, nella forma della sync: slot 1 (martedì
// o mercoledì, giorno A) fatto il 3/11 (`date` null, giorno dalla seduta abbinata), slot 2
// (giovedì, giorno B) da fare, con il giorno scelto 5/11; una seduta extra il 4/11 senza MOVEs.
const SESSION_DAYS: Record<string, { date: string; seq: number }> = {
  "2026-W45-1": { date: "2026-11-03", seq: 1 },
};
const WEEK = {
  slots: slots
    .filter((s) => s.week === "2026-W45")
    .map((s) => ({ ...s, session: SESSION_DAYS[s.id] ?? null })),
  sessions: [
    { date: "2026-11-03", name: "Giorno A", moves: 400 },
    { date: "2026-11-04", name: "Seduta libera", moves: null },
  ],
  moves_total: 400,
};

const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("web", () => {
  it("web: settimana shows slots", async () => {
    // 23:30 UTC del 4/11 sono già le 00:30 del 5/11 a Roma: si chiede la settimana del 5/11.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T23:30:00Z"));
    const dates: (string | null)[] = [];
    server.use(
      http.get("/api/week", ({ request }) => {
        dates.push(new URL(request.url).searchParams.get("date"));
        return HttpResponse.json(WEEK);
      }),
    );
    renderConTema(<Settimana />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Settimana" }),
    ).toBeTruthy();
    const planned = await screen.findByRole("region", {
      name: "Sedute programmate",
    });
    const [done, open, ...others] = within(planned).getAllByRole("listitem");
    if (!done || !open) throw new Error("slot mancanti");
    expect(others).toHaveLength(0);
    expect(within(done).getByText("Seduta A")).toBeTruthy();
    expect(within(done).getByText("Fatta")).toBeTruthy();
    expect(
      within(done).getByText("Giorni ammessi: mar 3 nov o mer 4 nov"),
    ).toBeTruthy();
    expect(within(open).getByText("Seduta B")).toBeTruthy();
    expect(within(open).getByText("Programmata")).toBeTruthy();
    expect(within(open).getByText("Giorni ammessi: gio 5 nov")).toBeTruthy();
    expect(dates).toEqual(["2026-11-05"]);
  });

  it("web: settimana shows the day a slot was done", async () => {
    // Il giorno svolto viene dalla seduta abbinata; il giorno scelto (`date`) è un'altra cosa.
    server.use(http.get("/api/week", () => HttpResponse.json(WEEK)));
    renderConTema(<Settimana />);

    const planned = await screen.findByRole("region", {
      name: "Sedute programmate",
    });
    const [done, open] = within(planned).getAllByRole("listitem");
    if (!done || !open) throw new Error("slot mancanti");
    expect(within(done).getByText("Svolta: mar 3 nov")).toBeTruthy();
    expect(within(done).queryByText(/^Giorno scelto/)).toBeNull();
    expect(within(open).getByText("Giorno scelto: gio 5 nov")).toBeTruthy();
    expect(within(open).queryByText(/^Svolta/)).toBeNull();
  });

  it("web: settimana status label is 16 px", async () => {
    // docs/buone-pratiche-mui.md § 8: testo di base almeno 16 px, anche nell'etichetta del Chip
    // di stato (MUI usa 13 px).
    server.use(http.get("/api/week", () => HttpResponse.json(WEEK)));
    renderConTema(<Settimana />);

    const label = await screen.findByText("Fatta");
    expect(getComputedStyle(label).fontSize).toBe("16px");
  });

  it("web: settimana follows today when the page comes back", async () => {
    // Scheda del telefono lasciata aperta: tornandoci in un altro giorno la pagina chiede la
    // settimana di oggi, senza ricaricare.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T10:00:00Z"));
    const dates: (string | null)[] = [];
    server.use(
      http.get("/api/week", ({ request }) => {
        dates.push(new URL(request.url).searchParams.get("date"));
        return HttpResponse.json(WEEK);
      }),
    );
    renderConTema(<Settimana />);
    await screen.findByRole("region", { name: "Sedute programmate" });
    expect(dates).toEqual(["2026-11-04"]);

    vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(dates).toEqual(["2026-11-04", "2026-11-10"]));

    // Anche tornando sulla finestra (fuoco) senza che la pagina sia stata nascosta.
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(dates).toEqual(["2026-11-04", "2026-11-10", "2026-11-17"]),
    );
  });

  it("web: settimana shows sessions and moves total", async () => {
    server.use(http.get("/api/week", () => HttpResponse.json(WEEK)));
    renderConTema(<Settimana />);

    const table = await screen.findByRole("table", {
      name: "Sedute della settimana",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Data", "Seduta", "MOVEs"]);
    const [, first, second, ...others] = within(table).getAllByRole("row");
    if (!first || !second) throw new Error("righe mancanti");
    expect(others).toHaveLength(0);
    expect(cells(first)).toEqual(["mar 3 nov", "Giorno A", "400"]);
    expect(cells(second)).toEqual(["mer 4 nov", "Seduta libera", "—"]);
    expect(screen.getByText("Totale MOVEs: 400")).toBeTruthy();
  });

  it("web: settimana empty state", async () => {
    // Settimana senza slot (modello non ancora salvato) e senza sedute.
    server.use(
      http.get("/api/week", () =>
        HttpResponse.json({ slots: [], sessions: [], moves_total: 0 }),
      ),
    );
    renderConTema(<Settimana />);

    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("web: settimana section without data", async () => {
    // Lunedì: slot creati, nessuna seduta ancora.
    server.use(
      http.get("/api/week", () =>
        HttpResponse.json({ ...WEEK, sessions: [], moves_total: 0 }),
      ),
    );
    const { unmount } = renderConTema(<Settimana />);

    await screen.findByRole("region", { name: "Sedute programmate" });
    const sessions = screen.getByRole("region", {
      name: "Sedute della settimana",
    });
    expect(within(sessions).getByText("Nessun dato")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/^Totale MOVEs/)).toBeNull();
    unmount();

    // Sedute senza slot (modello settimanale non ancora salvato).
    server.use(
      http.get("/api/week", () => HttpResponse.json({ ...WEEK, slots: [] })),
    );
    renderConTema(<Settimana />);

    const planned = await screen.findByRole("region", {
      name: "Sedute programmate",
    });
    expect(within(planned).getByText("Nessun dato")).toBeTruthy();
    expect(within(planned).queryByRole("list")).toBeNull();
    expect(
      screen.getByRole("table", { name: "Sedute della settimana" }),
    ).toBeTruthy();
  });

  it("web: settimana api error shows retry", async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(
      http.get("/api/week", () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json({ error: "internal" }, { status: 500 })
          : HttpResponse.json(WEEK);
      }),
    );
    renderConTema(<Settimana />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossibile caricare i dati.");
    expect(screen.queryByRole("region")).toBeNull();

    await user.click(within(alert).getByRole("button", { name: "Riprova" }));
    expect(
      await screen.findByRole("region", { name: "Sedute programmate" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(requests).toBe(2);
  });
});
