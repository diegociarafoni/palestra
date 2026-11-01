import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default di Vitest reso esplicito: i test store contano su un isolamento per file
    // (e Vitest 5 smette di suggerire `isolate: false`).
    isolate: true,
    projects: [
      {
        test: {
          name: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/store/**", "test/sync/**", "test/report/run.test.ts"],
        },
      },
      {
        // D1 locale di Miniflare con le migrazioni del repository; nessun wrangler.toml.
        plugins: [
          cloudflareTest(async () => ({
            miniflare: {
              compatibilityDate: "2026-10-23",
              d1Databases: ["DB"],
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations("migrations"),
              },
            },
          })),
        ],
        test: {
          name: "workers",
          include: [
            "test/store/**/*.test.ts",
            "test/sync/**/*.test.ts",
            "test/report/run.test.ts",
          ],
          setupFiles: ["test/store/setup.ts"],
        },
      },
    ],
  },
});
