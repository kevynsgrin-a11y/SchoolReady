import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      /** Mirrors wrangler.jsonc (fixture posture, local-only). */
      DB: D1Database;
      /** Mirrors wrangler.jsonc (Phase 2: health/cache/flag-override keys). */
      SOURCE_KV: KVNamespace;
      /** Mirrors wrangler.jsonc (Phase 3: transient upload buffer, hard TTL). */
      UPLOAD_BUFFER: R2Bucket;
      FIXTURE_MODE: string;
      /** Injected by vitest.config.ts via readD1Migrations(). */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
