import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/store/**"],
        },
      },
      {
        // D1 locale di Miniflare con le migrazioni del repository; nessun wrangler.toml.
        plugins: [
          cloudflareTest(async () => ({
            miniflare: {
              compatibilityDate: "2026-08-15",
              d1Databases: ["DB"],
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations("migrations"),
              },
            },
          })),
        ],
        test: {
          name: "workers",
          include: ["test/store/**/*.test.ts"],
          setupFiles: ["test/store/setup.ts"],
        },
      },
    ],
  },
});
