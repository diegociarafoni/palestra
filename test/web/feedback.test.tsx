import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "../../web/src/api/keys";
import Calendario from "../../web/src/pagine/calendario/Calendario";
import slots from "../fixtures/dashboard/slots.json";
import { renderConTema } from "./render";
import { server } from "./setup";

// Novembre 2026 sintetico; oggi è giovedì 5/11 (ora di Roma). Modello di esempio: slot 1 martedì
// o mercoledì (giorno A), slot 2 giovedì (giorno B), lunedì e venerdì non disponibili.
const EMPTY = {
  slots: [],
  extra: [],
  feedback: [],
  unavailable: ["mon", "fri"],
};

const feedback = (fields: object) => ({
  id: 1,
  planned_id: null,
  session_id: null,
  date: "2026-11-05",
  seq: 1,
  class: "buona",
  joint_pain: false,
  joint_where: null,
  notes: null,
  updated_at: "2026-11-05T18:00:00.000Z",
  ...fields,
});

// Slot 1 della 2026-W45 (finestra martedì 3/11 o mercoledì 4/11), nella forma della sync.
const W45_1 = slots[1];
if (W45_1?.id !== "2026-W45-1") throw new Error("fixture degli slot cambiata");

/** Oggi è giovedì 5/11 alle 19 a Roma. */
function todayIsThursday(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T18:00:00Z"));
}

/** Risposta del calendario, contando le richieste (una in più dopo ogni scrittura riuscita). */
function serveCalendar(calendar: object): { requests: number } {
  const counter = { requests: 0 };
  server.use(
    http.get("/api/calendar", () => {
      counter.requests += 1;
      return HttpResponse.json(calendar);
    }),
  );
  return counter;
}

/** Una promessa che il test risolve quando vuole: la risposta resta in sospeso fino ad allora. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("web", () => {
  it("web: feedback form submits selected class", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    const calendar = serveCalendar(EMPTY);
    const bodies: unknown[] = [];
    const response = deferred();
    server.use(
      http.put("/api/feedback", async ({ request }) => {
        expect(request.headers.get("Content-Type")).toContain(
          "application/json",
        );
        bodies.push(await request.json());
        await response.promise;
        return HttpResponse.json(
          feedback({ joint_pain: true, joint_where: "ginocchio" }),
        );
      }),
    );
    renderConTema(<Calendario />);

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    // Nessun feedback oggi: si salva la prima seduta, e non c'è "Un'altra seduta oggi".
    expect(
      within(form).queryByRole("button", { name: "Un'altra seduta oggi" }),
    ).toBeNull();
    const classes = within(form).getByRole("group", { name: "Come è andata" });
    expect(
      within(classes)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      // A schermo "😀 Ottima": lo spazio è il gap del tema, non un carattere.
      "😀Ottima",
      "🙂Buona",
      "😐Normale",
      "😓Faticosa",
      "😣Pessima",
    ]);
    await user.click(within(classes).getByRole("button", { name: "Buona" }));
    await user.click(
      within(form).getByRole("checkbox", {
        name: "Ho sentito un fastidio articolare",
      }),
    );
    await user.type(
      within(form).getByRole("textbox", { name: "dove" }),
      "ginocchio",
    );
    expect(
      within(form).getByRole("textbox", { name: "Note (facoltative)" }),
    ).toBeTruthy();
    const save = within(form).getByRole<HTMLButtonElement>("button", {
      name: "Salva",
    });
    await user.click(save);

    // In caricamento durante l'invio.
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      date: "2026-11-05",
      seq: 1,
      class: "buona",
      joint_pain: true,
      joint_where: "ginocchio",
      notes: null,
    });
    expect(save.disabled).toBe(true);
    expect(within(save).getByRole("progressbar")).toBeTruthy();

    // Salvato: il calendario si ricarica.
    response.resolve();
    await waitFor(() => expect(calendar.requests).toBe(2));
  });

  it("web: feedback form offers another seduta", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Oggi una seduta con il suo feedback (`seq` 1) e un feedback di ieri.
    serveCalendar({
      ...EMPTY,
      feedback: [
        feedback({ id: 1, date: "2026-11-04", class: "pessima" }),
        feedback({
          id: 2,
          class: "buona",
          joint_pain: true,
          joint_where: "ginocchio",
          notes: "Ultima serie pesante",
        }),
      ],
    });
    const bodies: unknown[] = [];
    server.use(
      http.put("/api/feedback", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(feedback({ id: 3, seq: 2 }));
      }),
    );
    renderConTema(<Calendario />);

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    // Precompilato con il feedback di oggi.
    const classes = within(form).getByRole("group", { name: "Come è andata" });
    expect(
      within(classes)
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent),
    ).toEqual(["🙂Buona"]);
    expect(
      within(form).getByRole<HTMLInputElement>("checkbox", {
        name: "Ho sentito un fastidio articolare",
      }).checked,
    ).toBe(true);
    expect(
      within(form).getByRole<HTMLInputElement>("textbox", { name: "dove" })
        .value,
    ).toBe("ginocchio");
    expect(
      within(form).getByRole<HTMLTextAreaElement>("textbox", {
        name: "Note (facoltative)",
      }).value,
    ).toBe("Ultima serie pesante");

    // La seconda seduta di oggi: stesso giorno, `seq` 2.
    await user.click(within(classes).getByRole("button", { name: "Normale" }));
    await user.click(
      within(form).getByRole("button", { name: "Un'altra seduta oggi" }),
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      date: "2026-11-05",
      seq: 2,
      class: "normale",
      joint_pain: true,
      joint_where: "ginocchio",
      notes: "Ultima serie pesante",
    });
  });

  it("web: feedback form edits the last seduta of today", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Oggi due sedute con il feedback: il modulo modifica la seconda.
    serveCalendar({
      ...EMPTY,
      feedback: [
        feedback({ id: 1, class: "ottima" }),
        feedback({ id: 2, seq: 2, class: "faticosa", notes: "Seconda" }),
      ],
    });
    const bodies: unknown[] = [];
    server.use(
      http.put("/api/feedback", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(feedback({ id: 2, seq: 2 }));
      }),
    );
    renderConTema(<Calendario />);

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    const classes = within(form).getByRole("group", { name: "Come è andata" });
    expect(
      within(classes)
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent),
    ).toEqual(["😓Faticosa"]);
    await user.click(within(form).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      date: "2026-11-05",
      seq: 2,
      class: "faticosa",
      joint_pain: false,
      joint_where: null,
      notes: "Seconda",
    });
  });

  it("web: feedback form requires a class", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    serveCalendar(EMPTY);
    let puts = 0;
    server.use(
      http.put("/api/feedback", () => {
        puts += 1;
        return HttpResponse.json(feedback({}));
      }),
    );
    renderConTema(<Calendario />);

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    await user.click(within(form).getByRole("button", { name: "Salva" }));
    // Errore sul campo, descritto al gruppo delle cinque scelte; nessun invio.
    const classes = within(form).getByRole("group", { name: "Come è andata" });
    expect(classes.getAttribute("aria-describedby")).toBeTruthy();
    expect(within(form).getByText("Scegli come è andata.")).toBeTruthy();
    expect(puts).toBe(0);

    await user.click(within(classes).getByRole("button", { name: "Ottima" }));
    expect(within(form).queryByText("Scegli come è andata.")).toBeNull();
  });

  it("web: chosen class is marked with a check", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    serveCalendar(EMPTY);
    renderConTema(<Calendario />);

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    const classes = within(form).getByRole("group", { name: "Come è andata" });
    expect(within(classes).queryByTestId("CheckIcon")).toBeNull();
    await user.click(within(classes).getByRole("button", { name: "Buona" }));
    // Lo stato non si affida al solo colore: la voce scelta ha anche la spunta, nascosta ai
    // lettori di schermo (che sentono "premuto"). Una sola spunta.
    const chosen = within(classes).getByRole("button", { pressed: true });
    expect(chosen.textContent).toBe("🙂Buona");
    expect(
      within(chosen).getByTestId("CheckIcon").getAttribute("aria-hidden"),
    ).toBe("true");
    expect(within(classes).getAllByTestId("CheckIcon")).toHaveLength(1);
    // Il testo resta come è scritto: niente maiuscolo dei pulsanti.
    expect(getComputedStyle(chosen).textTransform).toBe("none");
  });

  it("web: feedback form shows a save error", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    const calendar = serveCalendar(EMPTY);
    server.use(
      http.put("/api/feedback", () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    renderConTema(<Calendario />);

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    await user.click(within(form).getByRole("button", { name: "Pessima" }));
    await user.click(within(form).getByRole("button", { name: "Salva" }));
    const alert = await within(form).findByRole("alert");
    expect(alert.textContent).toBe("Salvataggio non riuscito. Riprova.");
    // Il modulo resta com'era, il pulsante di nuovo attivo; il calendario non si ricarica.
    expect(
      within(form).getByRole<HTMLButtonElement>("button", { name: "Salva" })
        .disabled,
    ).toBe(false);
    expect(
      within(form).getByRole("button", { name: "Pessima", pressed: true }),
    ).toBeTruthy();
    expect(calendar.requests).toBe(1);
  });

  it("web: feedback form only in the current month", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    serveCalendar(EMPTY);
    renderConTema(<Calendario />);

    await screen.findByRole("form", { name: "Come è andata oggi?" });
    await user.click(screen.getByRole("button", { name: "Mese precedente" }));
    await screen.findByText("ottobre 2026");
    expect(screen.queryByRole("form")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mese successivo" }));
    expect(
      await screen.findByRole("form", { name: "Come è andata oggi?" }),
    ).toBeTruthy();
  });

  it("web: calendar follows today into a new month", async () => {
    // La pagina aperta sabato 31/10 alle 23:30 a Roma resta aperta oltre la mezzanotte.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T22:30:00Z"));
    const user = userEvent.setup();
    const months: (string | null)[] = [];
    const bodies: unknown[] = [];
    server.use(
      http.get("/api/calendar", ({ request }) => {
        months.push(new URL(request.url).searchParams.get("month"));
        return HttpResponse.json(EMPTY);
      }),
      http.put("/api/feedback", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(feedback({ date: "2026-11-01" }));
      }),
    );
    renderConTema(<Calendario />);
    await screen.findByRole("form", { name: "Come è andata oggi?" });
    expect(screen.getByText("ottobre 2026")).toBeTruthy();

    // Domenica 1/11 alle 0:30: tornando sulla pagina, il mese di oggi e il suo modulo.
    vi.setSystemTime(new Date("2026-10-31T23:30:00Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("novembre 2026")).toBeTruthy();
    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    expect(months).toEqual(["2026-10", "2026-11"]);
    await user.click(within(form).getByRole("button", { name: "Ottima" }));
    await user.click(within(form).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ date: "2026-11-01", seq: 1 });
  });

  it("web: saving reloads calendar and week", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    const calendar = serveCalendar(EMPTY);
    server.use(
      http.put("/api/feedback", () => HttpResponse.json(feedback({}))),
    );
    const { queryClient } = renderConTema(<Calendario />);
    // La settimana già letta dalla pagina Settimana.
    queryClient.setQueryData(queryKeys.week("2026-11-05"), {
      slots: [],
      sessions: [],
      moves_total: 0,
    });

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    await user.click(within(form).getByRole("button", { name: "Buona" }));
    await user.click(within(form).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(calendar.requests).toBe(2));
    expect(
      queryClient.getQueryState(queryKeys.week("2026-11-05"))?.isInvalidated,
    ).toBe(true);
  });

  it("web: a write stays in progress until the calendar is reloaded", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Il calendario ricaricato dopo ciascuna delle due scritture arriva quando lo dice il test.
    const reloads = [deferred(), deferred()];
    let requests = 0;
    server.use(
      http.get("/api/calendar", async () => {
        requests += 1;
        await reloads[requests - 2]?.promise;
        return HttpResponse.json({
          ...EMPTY,
          slots: [
            {
              ...W45_1,
              status: "programmata",
              session_id: null,
              session: null,
            },
          ],
        });
      }),
      http.put("/api/feedback", () => HttpResponse.json(feedback({}))),
      http.patch("/api/slots/:id", () =>
        HttpResponse.json({
          ...W45_1,
          status: "programmata",
          date: "2026-11-04",
          session_id: null,
        }),
      ),
    );
    renderConTema(<Calendario />);

    // Feedback salvato: "Salva" resta in caricamento finché il calendario nuovo non arriva.
    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    await user.click(within(form).getByRole("button", { name: "Buona" }));
    const save = within(form).getByRole<HTMLButtonElement>("button", {
      name: "Salva",
    });
    await user.click(save);
    await waitFor(() => expect(requests).toBe(2));
    expect(save.disabled).toBe(true);
    expect(within(save).getByRole("progressbar")).toBeTruthy();
    reloads[0]?.resolve();
    await waitFor(() => expect(save.disabled).toBe(false));

    // Giorno scelto salvato: la scelta resta bloccata sul giorno nuovo fino al calendario nuovo.
    const week = screen.getByRole("region", { name: "Settimana 45" });
    const choice = within(week).getByRole<HTMLSelectElement>("combobox", {
      name: "Scegli il giorno",
    });
    await user.selectOptions(choice, "mer 4 nov");
    await waitFor(() => expect(requests).toBe(3));
    expect(choice.disabled).toBe(true);
    expect(choice.value).toBe("2026-11-04");
    reloads[1]?.resolve();
    await waitFor(() => expect(choice.disabled).toBe(false));
  });

  it("web: feedback of a synced seduta uses its seq", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Il 3/11 prima una seduta extra (`seq` 1, con feedback), poi quella di W45-1 (`seq` 2).
    const calendar = serveCalendar({
      ...EMPTY,
      slots: [{ ...W45_1, session: { date: "2026-11-03", seq: 2 } }],
      extra: [
        { date: "2026-11-03", name: "Seduta libera", moves: 120, seq: 1 },
      ],
      feedback: [feedback({ date: "2026-11-03", class: "ottima" })],
    });
    const bodies: unknown[] = [];
    server.use(
      http.put("/api/feedback", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          feedback({ id: 2, date: "2026-11-03", seq: 2 }),
        );
      }),
    );
    renderConTema(<Calendario />);

    const week = await screen.findByRole("region", { name: "Settimana 45" });
    const [slot] = within(week).getAllByRole("listitem");
    if (!slot) throw new Error("slot mancante");
    expect(within(slot).getByText("Senza feedback")).toBeTruthy();
    expect(within(slot).queryByText(/^Feedback:/)).toBeNull();
    const extra = screen.getByRole("region", { name: "Sedute extra" });
    expect(within(extra).getByText("Feedback: Ottima")).toBeTruthy();
    expect(
      within(extra).getByRole("button", { name: "Modifica feedback" }),
    ).toBeTruthy();

    await user.click(
      within(slot).getByRole("button", { name: "Aggiungi feedback" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Come è andata mar 3 nov?",
    });
    // Per una seduta precisa: niente "Un'altra seduta oggi".
    expect(
      within(dialog).queryByRole("button", { name: "Un'altra seduta oggi" }),
    ).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Buona" }));
    await user.click(within(dialog).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies).toEqual([
      {
        date: "2026-11-03",
        seq: 2,
        class: "buona",
        joint_pain: false,
        joint_where: null,
        notes: null,
      },
    ]);
    expect(calendar.requests).toBe(2);
  });

  it("web: feedback of an extra seduta uses its seq", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Il 3/11 prima la seduta di W45-1 (`seq` 1), poi una seduta extra (`seq` 2), senza feedback.
    serveCalendar({
      ...EMPTY,
      slots: [{ ...W45_1, session: { date: "2026-11-03", seq: 1 } }],
      extra: [
        { date: "2026-11-03", name: "Seduta libera", moves: 120, seq: 2 },
      ],
    });
    const bodies: unknown[] = [];
    server.use(
      http.put("/api/feedback", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          feedback({ id: 2, date: "2026-11-03", seq: 2 }),
        );
      }),
    );
    renderConTema(<Calendario />);

    const extra = await screen.findByRole("region", { name: "Sedute extra" });
    await user.click(
      within(extra).getByRole("button", { name: "Aggiungi feedback" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Come è andata mar 3 nov?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Normale" }));
    await user.click(within(dialog).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      date: "2026-11-03",
      seq: 2,
      class: "normale",
      joint_pain: false,
      joint_where: null,
      notes: null,
    });
  });

  it("web: feedback of other days can be edited", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Extra del 3/11 con il suo feedback; un feedback del 2/11 senza seduta ("Altri feedback");
    // una seduta extra oggi senza feedback.
    serveCalendar({
      ...EMPTY,
      extra: [
        { date: "2026-11-03", name: "Seduta libera", moves: 120, seq: 1 },
        { date: "2026-11-05", name: "Seduta libera", moves: 90, seq: 1 },
      ],
      feedback: [
        feedback({ id: 1, date: "2026-11-02", class: "normale" }),
        feedback({
          id: 2,
          date: "2026-11-03",
          class: "ottima",
          joint_pain: true,
          joint_where: "spalla",
        }),
      ],
    });
    const bodies: unknown[] = [];
    server.use(
      http.put("/api/feedback", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(feedback({ date: "2026-11-02" }));
      }),
    );
    renderConTema(<Calendario />);

    // La seduta extra del 3/11: il modulo parte dal suo feedback; "Annulla" chiude senza salvare.
    const extra = await screen.findByRole("region", { name: "Sedute extra" });
    const [tuesday, today] = within(extra).getAllByRole("listitem");
    if (!tuesday || !today) throw new Error("sedute extra mancanti");
    await user.click(
      within(tuesday).getByRole("button", { name: "Modifica feedback" }),
    );
    const edit = await screen.findByRole("dialog", {
      name: "Come è andata mar 3 nov?",
    });
    expect(
      within(edit).getByRole("button", { name: "Ottima", pressed: true }),
    ).toBeTruthy();
    expect(
      within(edit).getByRole<HTMLInputElement>("textbox", { name: "dove" })
        .value,
    ).toBe("spalla");
    await user.click(within(edit).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Una seduta di oggi: lo stesso titolo del modulo in cima.
    await user.click(
      within(today).getByRole("button", { name: "Aggiungi feedback" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Come è andata oggi?" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Il feedback senza seduta del 2/11.
    const others = screen.getByRole("region", { name: "Altri feedback" });
    await user.click(
      within(others).getByRole("button", { name: "Modifica feedback" }),
    );
    const other = await screen.findByRole("dialog", {
      name: "Come è andata lun 2 nov?",
    });
    await user.click(within(other).getByRole("button", { name: "Buona" }));
    await user.click(within(other).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bodies).toEqual([
      {
        date: "2026-11-02",
        seq: 1,
        class: "buona",
        joint_pain: false,
        joint_where: null,
        notes: null,
      },
    ]);
  });

  it("web: slot to confirm asks saltata with reason", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // W45-1 (martedì 3/11 o mercoledì 4/11) non fatto: da confermare.
    const calendar = serveCalendar({
      ...EMPTY,
      slots: [
        { ...W45_1, status: "da_confermare", session_id: null, session: null },
      ],
    });
    const requests: { id: unknown; body: unknown }[] = [];
    const response = deferred();
    server.use(
      http.patch("/api/slots/:id", async ({ params, request }) => {
        requests.push({ id: params.id, body: await request.json() });
        await response.promise;
        return HttpResponse.json({
          ...W45_1,
          status: "saltata",
          reason: "stanchezza",
          session_id: null,
        });
      }),
    );
    renderConTema(<Calendario />);

    const week = await screen.findByRole("region", { name: "Settimana 45" });
    const [slot] = within(week).getAllByRole("listitem");
    if (!slot) throw new Error("slot mancante");
    expect(within(slot).getByText("Da confermare")).toBeTruthy();
    expect(within(slot).queryByText("Senza feedback")).toBeNull();
    await user.click(within(slot).getByRole("button", { name: "Saltata?" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Seduta A saltata?",
    });
    const reasons = within(dialog).getByRole("radiogroup", {
      name: "Motivo (facoltativo)",
    });
    expect(
      within(reasons)
        .getAllByRole("radio")
        .map((r) => r.closest("label")?.textContent),
    ).toEqual(["Lavoro", "Stanchezza", "Fastidio", "Altro"]);
    await user.click(
      within(reasons).getByRole("radio", { name: "Stanchezza" }),
    );
    const confirm = within(dialog).getByRole<HTMLButtonElement>("button", {
      name: "Conferma",
    });
    await user.click(confirm);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      id: "2026-W45-1",
      body: { status: "saltata", reason: "stanchezza" },
    });
    expect(confirm.disabled).toBe(true);
    expect(within(confirm).getByRole("progressbar")).toBeTruthy();
    response.resolve();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calendar.requests).toBe(2);

    // Il motivo è facoltativo: riaperto, il dialogo riparte senza motivo.
    await user.click(within(slot).getByRole("button", { name: "Saltata?" }));
    const again = await screen.findByRole("dialog", {
      name: "Seduta A saltata?",
    });
    expect(within(again).queryByRole("radio", { checked: true })).toBeNull();
    await user.click(within(again).getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({
      id: "2026-W45-1",
      body: { status: "saltata", reason: null },
    });
  });

  it("web: programmata slot offers the choosable days", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Variante sintetica: domenica non disponibile, solo per provare l'esclusione. W45-1 senza
    // giorno scelto; W45-2 scelto per giovedì 5/11.
    const calendar = serveCalendar({
      ...EMPTY,
      unavailable: ["mon", "fri", "sun"],
      slots: [
        { ...W45_1, status: "programmata", session_id: null, session: null },
        { ...slots[2], session: null },
      ],
    });
    const requests: { id: unknown; body: unknown }[] = [];
    const response = deferred();
    server.use(
      http.patch("/api/slots/:id", async ({ params, request }) => {
        requests.push({ id: params.id, body: await request.json() });
        await response.promise;
        return HttpResponse.json({
          ...W45_1,
          status: "programmata",
          date: "2026-11-07",
          session_id: null,
        });
      }),
    );
    renderConTema(<Calendario />);

    const week = await screen.findByRole("region", { name: "Settimana 45" });
    const [first, second] = within(week).getAllByRole("listitem");
    if (!first || !second) throw new Error("slot mancanti");
    expect(
      within(second).getByRole<HTMLSelectElement>("combobox", {
        name: "Scegli il giorno",
      }).value,
    ).toBe("2026-11-05");
    const choice = within(first).getByRole<HTMLSelectElement>("combobox", {
      name: "Scegli il giorno",
    });
    // Finestra (martedì, mercoledì) e sabato: niente lunedì, venerdì e domenica.
    expect(
      within(choice)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["—", "mar 3 nov", "mer 4 nov", "sab 7 nov"]);
    await user.selectOptions(choice, "sab 7 nov");

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      id: "2026-W45-1",
      body: { date: "2026-11-07" },
    });
    // Durante l'invio il giorno appena scelto, senza altre scelte.
    expect(choice.value).toBe("2026-11-07");
    expect(choice.disabled).toBe(true);
    response.resolve();
    await waitFor(() => expect(choice.disabled).toBe(false));
    expect(calendar.requests).toBe(2);
  });

  it("web: slot write error is shown", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Nel frattempo la sync ha abbinato una seduta (409) o il server non risponde (500).
    const calendar = serveCalendar({
      ...EMPTY,
      slots: [
        { ...W45_1, status: "da_confermare", session_id: null, session: null },
        { ...slots[2], session: null },
      ],
    });
    server.use(
      http.patch("/api/slots/2026-W45-1", () =>
        HttpResponse.json({ error: "conflict" }, { status: 409 }),
      ),
      http.patch("/api/slots/2026-W45-2", () =>
        HttpResponse.json({ error: "internal" }, { status: 500 }),
      ),
    );
    renderConTema(<Calendario />);

    const week = await screen.findByRole("region", { name: "Settimana 45" });
    const [first, second] = within(week).getAllByRole("listitem");
    if (!first || !second) throw new Error("slot mancanti");
    await user.click(within(first).getByRole("button", { name: "Saltata?" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Seduta A saltata?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Conferma" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Salvataggio non riuscito. Riprova.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const choice = within(second).getByRole<HTMLSelectElement>("combobox", {
      name: "Scegli il giorno",
    });
    await user.selectOptions(choice, "sab 7 nov");
    expect((await within(second).findByRole("alert")).textContent).toBe(
      "Salvataggio non riuscito. Riprova.",
    );
    // Torna il giorno salvato.
    expect(choice.value).toBe("2026-11-05");
    expect(calendar.requests).toBe(1);
  });

  it("web: saved feedback keeps the focus on the form title", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // Dopo la scrittura il calendario ha il feedback di oggi: il modulo riparte dai suoi valori.
    let saved = false;
    server.use(
      http.get("/api/calendar", () =>
        HttpResponse.json(
          saved
            ? {
                ...EMPTY,
                feedback: [
                  feedback({ updated_at: "2026-11-05T18:05:00.000Z" }),
                ],
              }
            : EMPTY,
        ),
      ),
      http.put("/api/feedback", () => {
        saved = true;
        return HttpResponse.json(
          feedback({ updated_at: "2026-11-05T18:05:00.000Z" }),
        );
      }),
    );
    renderConTema(<Calendario />);

    const form = await screen.findByRole("form", {
      name: "Come è andata oggi?",
    });
    await user.click(within(form).getByRole("button", { name: "Buona" }));
    await user.click(within(form).getByRole("button", { name: "Salva" }));
    expect(
      await screen.findByRole("button", { name: "Un'altra seduta oggi" }),
    ).toBeTruthy();
    // Il pulsante premuto non c'è più: il focus è sul titolo, e l'esito è annunciato.
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Come è andata oggi?" }),
    );
    expect(screen.getByText("Feedback salvato.").getAttribute("role")).toBe(
      "status",
    );
  });

  it("web: slot writes move the focus to the week title", async () => {
    todayIsThursday();
    const user = userEvent.setup();
    // W45-1 da confermare, W45-2 programmato per giovedì 5/11; ogni scrittura cambia il calendario.
    let first = { ...W45_1, status: "da_confermare", session_id: null };
    let second = { ...slots[2], session_id: null };
    server.use(
      http.get("/api/calendar", () =>
        HttpResponse.json({
          ...EMPTY,
          slots: [
            { ...first, session: null },
            { ...second, session: null },
          ],
        }),
      ),
      http.patch("/api/slots/2026-W45-1", () => {
        first = { ...first, status: "saltata", reason: null };
        return HttpResponse.json(first);
      }),
      http.patch("/api/slots/2026-W45-2", () => {
        second = { ...second, date: "2026-11-07" };
        return HttpResponse.json(second);
      }),
    );
    renderConTema(<Calendario />);

    const week = await screen.findByRole("region", { name: "Settimana 45" });
    const title = within(week).getByRole("heading", { name: "Settimana 45" });
    await user.click(within(week).getByRole("button", { name: "Saltata?" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Seduta A saltata?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Conferma" }));
    // "Saltata?" sparisce con il calendario nuovo: il focus va al titolo della settimana.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(
        within(week).queryByRole("button", { name: "Saltata?" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(title);
    expect(within(week).getByRole("status").textContent).toBe(
      "Seduta segnata come saltata.",
    );

    // Il giorno scelto: la scelta si blocca durante l'invio, poi il focus torna al titolo.
    await user.selectOptions(
      within(week).getByRole("combobox", { name: "Scegli il giorno" }),
      "sab 7 nov",
    );
    await waitFor(() =>
      expect(within(week).getByRole("status").textContent).toBe(
        "Giorno scelto salvato.",
      ),
    );
    expect(document.activeElement).toBe(title);
  });
});
