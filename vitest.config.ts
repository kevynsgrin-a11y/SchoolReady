import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Wrangler-format up migrations (migrations/*.sql; down/ is not read here —
// reversibility is proven by tests/schema.test.ts on node:sqlite).
const migrations = await readD1Migrations("migrations");

export default defineConfig({
  test: {
    projects: [
      {
        // Node-side tests: config/lint/schema-reversibility suites.
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        // Workers-runtime tests: run inside workerd against the real D1
        // engine, with the fixture-posture binding from wrangler.jsonc.
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        test: {
          name: "workers",
          include: ["tests-workers/**/*.test.ts"],
          setupFiles: ["./tests-workers/apply-migrations.ts"],
        },
      },
    ],
  },
});
