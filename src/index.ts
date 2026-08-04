import { BRAND } from "../config/brand";
import { DEFAULT_FLAGS } from "../config/flags";

/**
 * Worker environment bindings (mirrors wrangler.jsonc). Phase 1 adds the D1
 * binding; later phases extend this interface with their own bindings.
 */
export interface Env {
  /** D1 database (fixture posture: local-only, placeholder database_id). */
  DB: D1Database;
  /**
   * KV namespace (Phase 2): source-health snapshots ('health:<sourceId>'),
   * SWR cache envelopes ('cache:<sourceId>'), runtime flag overrides
   * ('flags:overrides'). Prefixes defined in src/ingestion/source-health.ts.
   */
  SOURCE_KV: KVNamespace;
  /**
   * R2 transient upload buffer (Phase 3): the ONLY sanctioned R2 use (§2) —
   * uploaded list photos/PDFs held under a hard TTL while being parsed, then
   * deleted (src/parsing/upload-buffer.ts). Never a durable store (§1.7).
   */
  UPLOAD_BUFFER: R2Bucket;
  FIXTURE_MODE: string;
}

/**
 * Minimal Worker entry. Real routes land in Phase 5 (backend-api) and screens
 * in Phase 7 (frontend-engineer). This exists so the scaffold deploys and
 * health-checks from day one.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({
        ok: true,
        service: BRAND.name,
        fixtureMode: DEFAULT_FLAGS.fixtureMode,
      });
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler;
