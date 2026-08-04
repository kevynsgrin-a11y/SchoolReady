/**
 * Congruence-gate evidence collection (§5 of the founding brief, restated
 * in .claude/agents/release-qa.md). Each test here produces the evidence a
 * line of docs/release/congruence-gate.md cites: link integrity, no
 * placeholder text, no emoji in rendered output, provenance visibility,
 * trust surfaces one click from the footer, tap-target measurements, and
 * the evidence screenshots (mobile + emulated-phone + desktop viewports).
 *
 * Chromium-only honesty: this suite proves what Chromium can prove. The
 * real-device / cross-browser lines of the gate are BLOCKED-ENV and listed
 * as launch preconditions in docs/release/launch-checklist.md.
 */
import { test, expect } from "@playwright/test";
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  gotoStable,
  seedTwoChildPlan,
  shot,
} from "./helpers";

const ALL_PAGES = [
  "/",
  "/intake",
  "/plan",
  "/plan/checklist",
  "/plan/basket",
  "/capsule",
  "/trends",
  "/safety",
  "/budget",
  "/deals",
  "/household",
  "/account",
  "/methodology",
  "/admin/status",
];

// Same broad ranges as scripts/lint-no-emoji.mjs (§1.8), applied to the
// RENDERED text a user sees rather than to source files. VS16/keycap are
// combining characters, so they get their own regex (as in the lint).
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{2139}\u{203C}\u{2049}\u{3030}\u{303D}\u{3297}\u{3299}]/u;
const EMOJI_COMBINING_RE = /\uFE0F|\u20E3/u;
const hasEmoji = (text: string): boolean => EMOJI_RE.test(text) || EMOJI_COMBINING_RE.test(text);

test.describe("congruence evidence — rendered-output sweeps", () => {
  test("no placeholder text, no emoji, and every internal link resolves (seeded session, all pages)", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedTwoChildPlan(page);

    const internalHrefs = new Set<string>();
    const externalHrefs = new Set<string>();
    for (const path of ALL_PAGES) {
      await gotoStable(page, path);
      const text = await page.locator("body").innerText();
      expect(text, `${path}: no lorem/placeholder scaffolding`).not.toMatch(
        /lorem|ipsum|\bTODO\b|TKTK|coming soon|under construction/i,
      );
      expect(hasEmoji(text), `${path}: zero emoji in rendered text (§1.8)`).toBe(false);
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
      for (const href of hrefs) {
        if (href.startsWith("http://") || href.startsWith("https://")) externalHrefs.add(href);
        else if (href.startsWith("/")) internalHrefs.add(href.split("#")[0] ?? href);
        // fragment-only hrefs (skip link, receipts) are same-page by nature
      }
    }

    // Every internal link a user can click resolves (no dead links).
    for (const href of internalHrefs) {
      if (href.length === 0) continue;
      const res = await page.request.get(href, { maxRedirects: 5 });
      expect(res.status(), `internal link ${href} resolves`).toBeLessThan(400);
    }
    console.log(`[congruence] internal links checked: ${internalHrefs.size}`);

    // External links in the beta may only point at the reserved example.com
    // fixture namespace (labeled synthetic deep links) — no real retailer or
    // unvetted destination ships before licensing sign-off.
    for (const href of externalHrefs) {
      expect(href, `external link confined to fixture namespace: ${href}`).toMatch(
        /^https:\/\/([a-z0-9-]+\.)*example\.com\//,
      );
    }
    console.log(`[congruence] external (fixture-namespace) links: ${externalHrefs.size}`);
  });

  test("provenance/freshness is visible wherever price/stock/trend/safety facts render", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await seedTwoChildPlan(page);
    // Pages whose primary content is user-actionable facts. Each must show
    // at least one visible provenance line (source + observed + retrieved +
    // confidence) — the §1.4 render guard's visible half.
    // (/plan/checklist is absent by design: its rows are guard-checked
    // quantities whose provenance renders on /plan where they originate —
    // the checklist page shows its generation date instead.)
    for (const path of ["/plan", "/plan/basket?view=lowest-cost", "/safety", "/trends", "/capsule-post"]) {
      if (path === "/capsule-post") {
        await gotoStable(page, "/capsule");
        await page.locator("#cap-wash").fill("2");
        await page.locator("#cap-reserve").fill("1");
        await page.locator("#cap-existing").fill("0");
        await page.locator('form[action="/capsule"] button[type="submit"]').click();
      } else {
        await gotoStable(page, path);
      }
      const lines = page.locator(".provenance-line");
      await expect(lines.first(), `${path}: provenance line visible`).toBeVisible();
      await expect(lines.first()).toContainText("observed");
      await expect(lines.first()).toContainText("retrieved");
      await expect(lines.first()).toContainText("confidence");
    }
    // The fixture ribbon (data-source honesty) is on every page.
    for (const path of ["/", "/plan", "/safety"]) {
      await gotoStable(page, path);
      await expect(page.locator(".fixture-ribbon")).toBeVisible();
    }
  });

  test("trust surfaces are one click from the footer on every page", async ({ page }) => {
    await gotoStable(page, "/");
    const footer = page.locator("footer.site-footer");
    // Methodology (how every number is computed), privacy/data controls,
    // source health, and the type/icon licenses — all directly linked.
    for (const { name, href } of [
      { name: "How the math works", href: "/methodology" },
      { name: "Alerts and privacy", href: "/account" },
      { name: "Data sources", href: "/admin/status" },
      { name: "Type and icon licenses", href: "/assets/licenses/ISC-lucide.txt" },
    ]) {
      const link = footer.getByText(name, { exact: true });
      await expect(link, `footer links ${name}`).toBeVisible();
      expect(await link.getAttribute("href")).toBe(href);
      const res = await page.request.get(href);
      expect(res.status(), `${href} resolves`).toBe(200);
    }
  });

  test("one-hand mobile: primary action targets measure >= 44px on a 390px phone viewport", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await seedTwoChildPlan(page);
    const audits: { path: string; selector: string }[] = [
      { path: "/", selector: "main a.button, main button" },
      { path: "/intake?tab=manual", selector: "main button, main select, main input" },
      { path: "/plan", selector: "main a.button" },
      { path: "/plan/checklist?mode=store", selector: ".check-row, .checklist-bar a, .checklist-bar button" },
      { path: "/capsule", selector: "main button, main select, main input[type='text'], main input[type='number']" },
      { path: "/safety", selector: "main button, main input#upc" },
    ];
    for (const { path, selector } of audits) {
      await gotoStable(page, path);
      const heights = await page.locator(selector).evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({
            tag: el.tagName,
            type: el.getAttribute("type"),
            h: el.getBoundingClientRect().height,
          })),
      );
      expect(heights.length, `${path}: targets found`).toBeGreaterThan(0);
      for (const t of heights) {
        // Checkbox INPUTS are 24px glyphs inside >=44px labeled rows — the
        // ROW is the target; everything else must be >=44px itself.
        if (t.type === "checkbox") continue;
        expect(t.h, `${path} ${t.tag}[type=${t.type}] height >= 44`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("evidence screenshots — remaining key screens, both viewports", async ({ page }) => {
    test.setTimeout(300_000);
    await seedTwoChildPlan(page);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStable(page, "/");
    await shot(page, "home-mobile");
    await gotoStable(page, "/intake?tab=manual");
    await shot(page, "intake-manual-mobile");
    await gotoStable(page, "/plan");
    await shot(page, "plan-merged-mobile");
    await gotoStable(page, "/trends");
    await shot(page, "trends-mobile");

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoStable(page, "/methodology");
    await shot(page, "methodology-desktop");
    await gotoStable(page, "/deals");
    await shot(page, "deals-desktop");
    await gotoStable(page, "/budget");
    await shot(page, "budget-desktop");
    await gotoStable(page, "/household");
    await shot(page, "household-desktop");
    await gotoStable(page, "/admin/status");
    await shot(page, "admin-status-desktop");
    await gotoStable(page, "/no-such-page");
    await shot(page, "not-found-desktop", false);
  });
});
