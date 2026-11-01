import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/api/[[route]]";
import { TEST_ENV } from "./jwt";

describe("api pages adapter", () => {
  it("api: pages adapter passes bindings", async () => {
    const res = await onRequest({
      request: new Request("https://dashboard.example.com/api/measures"),
      functionPath: "/api/measures",
      waitUntil: () => {},
      passThroughOnException: () => {},
      next: async () => new Response(null, { status: 500 }),
      env: {
        ...TEST_ENV,
        DB: env.DB,
        ASSETS: { fetch: async () => new Response(null, { status: 500 }) },
      },
      params: { route: ["measures"] },
      data: {},
    });
    // 401 e non 500: l'app ha ricevuto la configurazione di Access dai binding di Pages.
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":"unauthorized"}');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
