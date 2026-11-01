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
          exclude: [
            "test/store/**",
            "test/api/**",
            "test/sync/**",
            "test/report/run.test.ts",
          ],
        },
      },
      {
        // D1 locale di Miniflare con le migrazioni del repository; nessun wrangler.toml.
        // Vale per test/store e test/api (le rotte del dashboard leggono lo stesso D1).
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
            "test/api/**/*.test.ts",
            "test/sync/**/*.test.ts",
            "test/report/run.test.ts",
          ],
          setupFiles: ["test/store/setup.ts"],
        },
      },
      {
        // Frontend: stessi plugin della build (React + React Compiler), DOM di jsdom, API con MSW.
        extends: "./web/vite.config.ts",
        test: {
          name: "web",
          environment: "jsdom",
          include: ["test/web/**/*.test.tsx"],
          setupFiles: ["test/web/setup.ts"],
        },
      },
    ],
  },
});
