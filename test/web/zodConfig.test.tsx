// Per primo, come in main.tsx: la configurazione precede ogni schema.
import "../../web/src/zodConfig";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import measures from "../fixtures/dashboard/measures.json";

describe("web", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("web: zod runs without eval", async () => {
    expect(z.config().jitless).toBe(true);

    // Uno schema del dominio, costruito e usato dopo la configurazione, non chiama `new Function`
    // (la CSP della dashboard non ha 'unsafe-eval').
    const calls: unknown[][] = [];
    vi.stubGlobal(
      "Function",
      new Proxy(Function, {
        construct(target, args) {
          calls.push(args);
          return Reflect.construct(target, args);
        },
      }),
    );
    const { MeasuresResponseSchema } = await import(
      "../../src/domain/dashboard"
    );
    expect(MeasuresResponseSchema.parse({ measures }).measures).toHaveLength(2);
    expect(calls).toEqual([]);
  });
});
