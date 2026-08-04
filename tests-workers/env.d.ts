import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      /** Mirrors wrangler.jsonc (fixture posture, local-only). */
      DB: D1Database;
      FIXTURE_MODE: string;
      /** Injected by vitest.config.ts via readD1Migrations(). */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
