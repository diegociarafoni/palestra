import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import Calendario from "../../web/src/pagine/calendario/Calendario";
import slots from "../fixtures/dashboard/slots.json";
import { renderConTema } from "./render";
import { server } from "./setup";

// Novembre 2026 sintetico, modello di esempio (slot 1 martedì o mercoledì, giorno A; slot 2
// giovedì, giorno B): tre slot dalla fixture più lo slot 2 della 2026-W46 saltato per lavoro;
// una seduta extra il 4/11. Feedback del 3/11 (slot 1) e del 4/11 (extra), senza id abbinati:
// si riconoscono da data e numero della seduta nel giorno.
const SKIPPED = {
  id: "2026-W46-2",
  week: "2026-W46",
  slot: 2,
  window: ["2026-11-12"],
  date: null,
  scheda_day: "B",
  status: "saltata",
  reason: "lavoro",
  session_id: null,
};
const feedback = (fields: object) => ({
  planned_id: null,
  session_id: null,
  seq: 1,
  joint_where: null,
  notes: null,
  updated_at: "2026-11-04T20:00:00Z",
  ...fields,
});
const CALENDAR = {
  slots: [...slots.filter((s) => s.week !== "2026-W44"), SKIPPED],
  extra: [{ date: "2026-11-04", name: "Seduta libera", moves: null }],
  feedback: [
    feedback({
      id: 1,
      date: "2026-11-03",
      class: "buona",
      joint_pain: true,
      joint_where: "ginocchio",
      notes: "Ultima serie pesante",
    }),
    feedback({
      id: 2,
      date: "2026-11-04",
      class: "faticosa",
      joint_pain: false,
    }),
  ],
};

describe("web", () => {
  it("web: calendario shows slots, extra sessions and feedback", async () => {
    // 23:30 UTC del 31/10 sono già le 00:30 del 1/11 a Roma: il mese corrente è novembre.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T23:30:00Z"));
    const months: (string | null)[] = [];
    server.use(
      http.get("/api/calendar", ({ request }) => {
        months.push(new URL(request.url).searchParams.get("month"));
        return HttpResponse.json(CALENDAR);
      }),
    );
    renderConTema(<Calendario />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Calendario" }),
    ).toBeTruthy();
    expect(screen.getByText("novembre 2026")).toBeTruthy();
    const planned = await screen.findByRole("region", {
      name: "Sedute programmate",
    });
    const week45 = within(planned).getByRole("region", {
      name: "Settimana 45",
    });
    const week46 = within(planned).getByRole("region", {
      name: "Settimana 46",
    });

    const [slot1, slot2, ...others45] = within(week45).getAllByRole("listitem");
    if (!slot1 || !slot2) throw new Error("slot della settimana 45 mancanti");
    expect(others45).toHaveLength(0);
    expect(within(slot1).getByText("Seduta A")).toBeTruthy();
    expect(within(slot1).getByText("Fatta")).toBeTruthy();
    expect(
      within(slot1).getByText("Giorni ammessi: mar 3 nov o mer 4 nov"),
    ).toBeTruthy();
    expect(within(slot1).getByText("Data: mar 3 nov")).toBeTruthy();
    expect(within(slot1).getByText("Feedback: Buona")).toBeTruthy();
    expect(
      within(slot1).getByText("Fastidio articolare: sì, ginocchio"),
    ).toBeTruthy();
    expect(within(slot1).getByText("Note: Ultima serie pesante")).toBeTruthy();
    expect(within(slot2).getByText("Seduta B")).toBeTruthy();
    expect(within(slot2).getByText("Programmata")).toBeTruthy();
    expect(within(slot2).queryByText(/^Feedback/)).toBeNull();

    const [slot3, skipped, ...others46] =
      within(week46).getAllByRole("listitem");
    if (!slot3 || !skipped) throw new Error("slot della settimana 46 mancanti");
    expect(others46).toHaveLength(0);
    expect(within(slot3).getByText("Data: mar 10 nov")).toBeTruthy();
    expect(within(slot3).queryByText(/^Feedback/)).toBeNull();
    expect(within(skipped).getByText("Saltata")).toBeTruthy();
    expect(within(skipped).getByText("Motivo: lavoro")).toBeTruthy();

    const extra = screen.getByRole("region", { name: "Sedute extra" });
    const [session, ...otherExtra] = within(extra).getAllByRole("listitem");
    if (!session) throw new Error("seduta extra mancante");
    expect(otherExtra).toHaveLength(0);
    expect(within(session).getByText("Seduta libera")).toBeTruthy();
    expect(within(session).getByText("Data: mer 4 nov")).toBeTruthy();
    expect(within(session).getByText("MOVEs: —")).toBeTruthy();
    expect(within(session).getByText("Feedback: Faticosa")).toBeTruthy();
    expect(within(session).getByText("Fastidio articolare: no")).toBeTruthy();
    expect(within(session).queryByText(/^Note/)).toBeNull();

    // Solo lettura: le scritture (feedback, slot saltato) arrivano con il Task 12.
    expect(screen.getAllByRole("button").map((b) => b.ariaLabel)).toEqual([
      "Mese precedente",
      "Mese successivo",
    ]);
    expect(months).toEqual(["2026-11"]);
  });

  it("web: calendario feedback of two sedute on the same day", async () => {
    // Il 3/11 lo slot 1 e poi una seduta extra: il feedback con `seq` 1 è dello slot, quello
    // con `seq` 2 della seduta extra.
    server.use(
      http.get("/api/calendar", () =>
        HttpResponse.json({
          slots: slots.filter((s) => s.id === "2026-W45-1"),
          extra: [{ date: "2026-11-03", name: "Seduta libera", moves: 120 }],
          feedback: [
            feedback({
              id: 1,
              date: "2026-11-03",
              class: "ottima",
              joint_pain: false,
            }),
            feedback({
              id: 2,
              date: "2026-11-03",
              seq: 2,
              class: "pessima",
              joint_pain: true,
            }),
          ],
        }),
      ),
    );
    renderConTema(<Calendario />);

    const week = await screen.findByRole("region", { name: "Settimana 45" });
    const [slot] = within(week).getAllByRole("listitem");
    const extra = screen.getByRole("region", { name: "Sedute extra" });
    const [session] = within(extra).getAllByRole("listitem");
    if (!slot || !session) throw new Error("sedute mancanti");
    expect(within(slot).getByText("Feedback: Ottima")).toBeTruthy();
    expect(within(slot).queryByText("Feedback: Pessima")).toBeNull();
    expect(within(session).getByText("Feedback: Pessima")).toBeTruthy();
    expect(within(session).getByText("Fastidio articolare: sì")).toBeTruthy();
    expect(within(session).getByText("MOVEs: 120")).toBeTruthy();
  });

  it("web: calendario empty state", async () => {
    server.use(
      http.get("/api/calendar", () =>
        HttpResponse.json({ slots: [], extra: [], feedback: [] }),
      ),
    );
    renderConTema(<Calendario />);

    expect(await screen.findByText("Nessun dato")).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("web: calendario section without data", async () => {
    // Un mese con i soli slot, poi uno con la sola seduta extra.
    server.use(
      http.get("/api/calendar", () =>
        HttpResponse.json({ ...CALENDAR, extra: [] }),
      ),
    );
    const { unmount } = renderConTema(<Calendario />);

    await screen.findByRole("region", { name: "Settimana 45" });
    const extra = screen.getByRole("region", { name: "Sedute extra" });
    expect(within(extra).getByText("Nessun dato")).toBeTruthy();
    expect(within(extra).queryByRole("list")).toBeNull();
    unmount();

    server.use(
      http.get("/api/calendar", () =>
        HttpResponse.json({ ...CALENDAR, slots: [] }),
      ),
    );
    renderConTema(<Calendario />);

    const planned = await screen.findByRole("region", {
      name: "Sedute programmate",
    });
    expect(within(planned).getByText("Nessun dato")).toBeTruthy();
    expect(within(planned).queryByRole("region")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Sedute extra" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);
  });

  it("web: calendario api error shows retry", async () => {
    const user = userEvent.setup();
    let requests = 0;
    server.use(
      http.get("/api/calendar", () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json({ error: "internal" }, { status: 500 })
          : HttpResponse.json(CALENDAR);
      }),
    );
    renderConTema(<Calendario />);

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

  it("web: calendario month selector changes month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    const user = userEvent.setup();
    const months: (string | null)[] = [];
    server.use(
      http.get("/api/calendar", ({ request }) => {
        months.push(new URL(request.url).searchParams.get("month"));
        return HttpResponse.json({ slots: [], extra: [], feedback: [] });
      }),
    );
    renderConTema(<Calendario />);
    await screen.findByText("Nessun dato");

    await user.click(screen.getByRole("button", { name: "Mese successivo" }));
    expect(screen.getByText("dicembre 2026")).toBeTruthy();
    await waitFor(() => expect(months).toEqual(["2026-11", "2026-12"]));
  });
});
