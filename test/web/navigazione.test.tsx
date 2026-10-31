import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Navigazione } from "../../web/src/componenti/Navigazione";
import { renderConTema } from "./render";

describe("web", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("web: navigation lists six pages", async () => {
    const user = userEvent.setup();
    renderConTema(<Navigazione />);

    // jsdom non ha media query: si vede la navigazione del telefono (sotto `md`).
    const nav = screen.getByRole("navigation", { name: "Pagine" });
    const visible = [
      ["Settimana", "/"],
      ["Calendario", "/calendario"],
      ["Esercizi", "/esercizi"],
      ["Misure", "/misure"],
    ];
    for (const [name, href] of visible) {
      expect(within(nav).getByRole("link", { name }).getAttribute("href")).toBe(
        href,
      );
    }
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(
      within(nav).getByRole("link", { name: "Settimana" }).ariaCurrent,
    ).toBe("page");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(within(nav).getByRole("button", { name: "Altro" }));
    const menu = screen.getByRole("menu", { name: "Altre pagine" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Scheda", "Report"]);
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/scheda",
      "/report",
    ]);
  });

  it("web: navigation uses tabs from md", () => {
    // Schermo largo: ogni media query risulta vera (jsdom non ha `matchMedia`). Il tema usa anche
    // la vecchia API `addListener` per seguire lo schema colore del sistema.
    vi.stubGlobal("matchMedia", (media: string) => ({
      matches: true,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }));
    renderConTema(<Navigazione />);

    const nav = screen.getByRole("navigation", { name: "Pagine" });
    const tabs = within(nav).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Settimana",
      "Calendario",
      "Esercizi",
      "Misure",
      "Scheda",
      "Report",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/",
      "/calendario",
      "/esercizi",
      "/misure",
      "/scheda",
      "/report",
    ]);
    expect(tabs[0]?.ariaSelected).toBe("true");
    expect(tabs[0]?.ariaCurrent).toBe("page");
    expect(within(nav).queryByRole("button", { name: "Altro" })).toBeNull();
  });
});
