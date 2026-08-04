import { BRAND } from "../config/brand";
import { DEFAULT_FLAGS } from "../config/flags";

/**
 * Worker environment bindings (mirrors wrangler.jsonc). Phase 1 adds the D1
 * binding; later phases extend this interface with their own bindings.
 */
export interface Env {
  /** D1 database (fixture posture: local-only, placeholder database_id). */
  DB: D1Database;
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
