import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import Misure from "../../web/src/pagine/misure/Misure";
import measures from "../fixtures/dashboard/measures.json";
import { renderConTema } from "./render";
import { server } from "./setup";

// Sessione di Cloudflare Access: come il client chiede le risposte e come reagisce a 401/403.
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
});
