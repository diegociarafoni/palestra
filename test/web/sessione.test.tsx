import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { browser, retryQuery, SessionError } from "../../web/src/api/session";
import Misure from "../../web/src/pagine/misure/Misure";
import measures from "../fixtures/dashboard/measures.json";
import { renderConTema } from "./render";
import { server } from "./setup";

// Sessione di Cloudflare Access: come il client chiede le risposte e come reagisce a 401/403.
// L'ultima ricarica sta in sessionStorage (solo un numero). jsdom non ricarica la pagina: la
// ricarica passa da `browser.reload`, che qui è sostituita da una spia.
const RELOAD_KEY = "palestra:lastReload";
const NOW = new Date("2026-11-03T08:00:00Z"); // 1793692800000

function expiredSession(status: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  server.use(
    http.get("/api/measures", () =>
      HttpResponse.json({ error: "unauthorized" }, { status }),
    ),
  );
  return vi.spyOn(browser, "reload").mockImplementation(() => {});
}

describe("web", () => {
  it("web: api requests ask Access for a 401", async () => {
    // Senza `X-Requested-With: XMLHttpRequest` Access risponde a una sessione scaduta con un
    // redirect alla pagina di login (altra origine: `fetch` fallisce), non con 401.
    const headers: (string | null)[] = [];
    server.use(
      http.get("/api/measures", ({ request }) => {
        headers.push(request.headers.get("X-Requested-With"));
        return HttpResponse.json({ measures });
      }),
    );
    renderConTema(<Misure />);

    await screen.findByRole("table", { name: "Tutte le misure" });
    expect(headers).toEqual(["XMLHttpRequest"]);
  });

  it("web: expired session reloads the page", async () => {
    const reload = expiredSession(401);
    renderConTema(<Misure />);

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe("1793692800000");
    expect(screen.getByRole("status", { name: "Caricamento" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("web: expired session reloads again after 60 s", async () => {
    sessionStorage.setItem(RELOAD_KEY, "1793692739000"); // 61 s prima
    const reload = expiredSession(401);
    renderConTema(<Misure />);

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe("1793692800000");
    expect(screen.getByRole("status", { name: "Caricamento" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("web: reload time in the future does not block reloads", async () => {
    // Orologio spostato indietro dopo l'ultima ricarica: quell'ora sta 30 s nel futuro.
    sessionStorage.setItem(RELOAD_KEY, "1793692830000");
    const reload = expiredSession(401);
    renderConTema(<Misure />);

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe("1793692800000");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([401, 403])(
    "web: session still invalid after a reload shows message (%i)",
    async (status) => {
      sessionStorage.setItem(RELOAD_KEY, "1793692770000"); // 30 s prima
      const reload = expiredSession(status);
      renderConTema(<Misure />);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Sessione non valida. Chiudi e riapri la dashboard.",
      );
      expect(alert.textContent).not.toContain("Impossibile caricare i dati.");
      expect(sessionStorage.getItem(RELOAD_KEY)).toBe("1793692770000");
      expect(reload).not.toHaveBeenCalled();
    },
  );

  it.each(["getItem", "setItem"] as const)(
    "web: session storage unavailable shows message (%s)",
    async (method) => {
      // Navigazione privata o storage disattivato: senza memoria della ricarica si rischia un ciclo.
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("storage non disponibile", "SecurityError");
      });
      const reload = expiredSession(401);
      renderConTema(<Misure />);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Sessione non valida. Chiudi e riapri la dashboard.",
      );
      expect(reload).not.toHaveBeenCalled();
    },
  );

  it("web: session error is not retried", () => {
    // Politica dei nuovi tentativi del QueryClient dell'app (main.tsx): 3 per gli altri errori.
    expect(retryQuery(0, new SessionError("sessione"))).toBe(false);
    expect(retryQuery(0, new Error("rete"))).toBe(true);
    expect(retryQuery(2, new Error("rete"))).toBe(true);
    expect(retryQuery(3, new Error("rete"))).toBe(false);
  });
});
