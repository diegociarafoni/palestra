import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../web/src/componenti/ErrorBoundary";
import { renderConTema } from "./render";

function Broken(): never {
  throw new Error("errore di render sintetico");
}

describe("web", () => {
  it("web: page error boundary shows message", () => {
    // React segnala in console l'errore intercettato: qui è atteso, non va stampato.
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderConTema(
      <>
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>
        <p>Resto dell'app</p>
      </>,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "Questa pagina non si è caricata. Ricarica la pagina per riprovare.",
    );
    expect(screen.getByText("Resto dell'app")).toBeTruthy();
    expect(screen.queryByText("errore di render sintetico")).toBeNull();
  });
});
