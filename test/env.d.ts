/// <reference types="@cloudflare/vitest-plugin/types" />

// Binding del progetto "workers" di Vitest (vitest.config.ts).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
