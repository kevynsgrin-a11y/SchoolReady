/**
 * Playwright configuration — Phase 12 release E2E suite (tests-e2e/).
 *
 * Run with `npm run test:e2e`. Deliberately OUTSIDE `npm run verify` (which
 * stays hermetic: lint + typecheck + vitest) and separate from the Phase 11
 * accessibility config so `npm run test:a11y` keeps its exact Phase 11
 * meaning. The three §6 critical journeys run against the REAL app served
 * by `wrangler dev` (fixture mode, local D1/KV/R2 bindings) on :8787.
 * Journey 2 additionally boots its own wrangler dev on :8788 with a
 * dedicated persist dir so a recalled offer (built by the REAL fixture
 * adapter from the shipped fixture documents) can be seeded into the SWR
 * cache before that server starts — miniflare holds its store exclusively,
 * so seeding a running server's KV from outside is not possible.
 *
 * CI wiring (release-qa): `npx playwright install chromium` in the job,
 * then `npm run test:e2e`. In this sandbox the preinstalled Chromium is
 * used via executablePath (PLAYWRIGHT_BROWSERS_PATH revision mismatch —
 * same mechanism as playwright.config.ts, Phase 11).
 */
import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const localChromium = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.A11Y_CHROMIUM ?? (existsSync(localChromium) ? localChromium : undefined);

export default defineConfig({
  testDir: "tests-e2e",
  // Single worker: the API layer rate-limits per session/IP, and journey 2
  // manages a second wrangler dev instance — parallelism would race both.
  workers: 1,
  fullyParallel: false,
  // One retry absorbs the sandbox's flaky network-change notifier (headless
  // Chromium intermittently reports navigator.onLine=false mid-run).
  retries: 1,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:8787",
    browserName: "chromium",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command:
      "npx wrangler d1 migrations apply k8-planner-fixture --local && npx wrangler dev --port 8787 --ip 127.0.0.1",
    url: "http://127.0.0.1:8787/healthz",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
