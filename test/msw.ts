import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type SetupServer, setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

const FIXTURES = join(import.meta.dirname, "fixtures", "mywellness");

/** Server MSW per il file di test: ogni richiesta senza handler è un errore. */
export function setupMswServer(): SetupServer {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

/** Contenuto di una fixture di `test/fixtures/mywellness/`. */
export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}
