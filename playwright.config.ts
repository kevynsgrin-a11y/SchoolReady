/**
 * Playwright configuration — Phase 11 accessibility suite (tests-a11y/).
 *
 * Deliberately OUTSIDE `npm run verify` (which stays hermetic: lint +
 * typecheck + vitest). Run with `npm run test:a11y`. The suite targets the
 * REAL app served by `wrangler dev` (fixture mode, local D1/KV/R2 bindings)
 * plus a set of hand-built state snapshots served via route interception
 * for states that cannot be driven over HTTP (stale clocks, entitlements,
 * guard refusals — see tests-a11y/snapshots.ts).
 *
 * CI wiring note (release-qa): run `npx playwright install chromium` in the
 * job, then `npm run test:a11y`. In this sandbox the preinstalled Chromium
 * is used via executablePath (PLAYWRIGHT_BROWSERS_PATH revision mismatch).
 */
import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Prefer the environment's preinstalled Chromium; fall back to Playwright's
// own registry (CI path after `npx playwright install chromium`).
const localChromium = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.A11Y_CHROMIUM ?? (existsSync(localChromium) ? localChromium : undefined);

export default defineConfig({
  testDir: "tests-a11y",
  // Single worker: the API layer rate-limits per session/IP; parallel
  // journeys against one wrangler dev instance would trip 429s by design.
  workers: 1,
  fullyParallel: false,
  // One retry absorbs the sandbox's flaky network-change notifier (headless
  // Chromium intermittently reports navigator.onLine=false mid-run).
  retries: 1,
  reporter: [["list"]],
  timeout: 60_000,
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
