/**
 * Workers-pool setup: apply every up migration to the real (workerd) D1
 * database before each test file, using the same wrangler-format files that
 * `wrangler d1 migrations apply` consumes.
 */
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
