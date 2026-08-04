/**
 * Browser-level overlay / interstitial check — discharges gate finding
 * P9-2 (Phase 9): the node-side §1.2 route scan is marker-based, so a
 * fixed-position overlay under an unknown class could evade its rule C.
 * This spec closes that gap from the RENDERED side: computed style + hit
 * testing in a real browser, independent of any class name or marker.
 *
 * Rules asserted on every audited page (JS enhancement layer live):
 *  1. No modal apparatus exists at all: no [role="dialog"], no
 *     [aria-modal="true"], no <dialog>.
 *  2. Every VISIBLE fixed/sticky-positioned element is small chrome
 *     (< 20% of the viewport) — nothing screen-covering ever mounts.
 *  3. Protected content is hit-testable: elementFromPoint at the center of
 *     the first critical section resolves INSIDE that section — no
 *     invisible layer can intercept the tap (§1.2 "between a user and").
 */
import { test, expect } from "@playwright/test";
import { MOBILE_VIEWPORT, gotoStable, seedTwoChildPlan } from "./helpers";

interface OverlayReport {
  dialogCount: number;
  bigFixed: { tag: string; className: string; coverage: number }[];
  hitOk: boolean | null;
  hitTarget: string | null;
}

async function auditOverlays(page: import("@playwright/test").Page): Promise<OverlayReport> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dialogCount = document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], dialog',
    ).length;
    const bigFixed: { tag: string; className: string; coverage: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      if (style.display === "none" || style.visibility === "hidden" || el.hidden) continue;
      const rect = el.getBoundingClientRect();
      // Visible-on-screen intersection only (the skip link parks off-screen
      // until focused — off-screen chrome cannot be an interstitial).
      const w = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      const h = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      const coverage = (w * h) / (vw * vh);
      if (coverage >= 0.2) {
        bigFixed.push({ tag: el.tagName, className: el.className, coverage });
      }
    }
    // Hit test the first §1.2-critical section on the page, if any.
    const critical = document.querySelector(
      'section.section-safety_warning, section.section-required_items, section.section-dress_code_restriction, section.section-deadline',
    );
    let hitOk: boolean | null = null;
    let hitTarget: string | null = null;
    if (critical) {
      critical.scrollIntoView({ block: "center" });
      const rect = critical.getBoundingClientRect();
      const x = Math.min(Math.max(rect.x + rect.width / 2, 0), vw - 1);
      const y = Math.min(Math.max(rect.y + Math.min(rect.height / 2, 40), 0), vh - 1);
      const hit = document.elementFromPoint(x, y);
      hitOk = hit !== null && critical.contains(hit);
      hitTarget = hit ? `${hit.tagName}.${(hit as HTMLElement).className}` : null;
    }
    return { dialogCount, bigFixed, hitOk, hitTarget };
  });
}

const AUDITED_PATHS = [
  "/",
  "/plan",
  "/plan/basket",
  "/plan/checklist",
  "/plan/checklist?mode=store",
  "/capsule",
  "/safety",
  "/safety?upc=FIXTURE-UPC-0007", // fixture recall match — the intercept state
  "/budget",
  "/deals",
  "/trends",
  "/household",
  "/account",
  "/methodology",
  "/admin/status",
];

test.describe("P9-2 — no overlay/interstitial ever covers content (computed-style + hit test)", () => {
  test("every audited page, seeded session, mobile viewport", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(MOBILE_VIEWPORT);
    await seedTwoChildPlan(page);
    for (const path of AUDITED_PATHS) {
      await gotoStable(page, path);
      await page.waitForLoadState();
      const report = await auditOverlays(page);
      expect(report.dialogCount, `${path}: zero modal/dialog apparatus`).toBe(0);
      expect(
        report.bigFixed,
        `${path}: no visible fixed/sticky element covers >= 20% of the viewport`,
      ).toEqual([]);
      if (report.hitOk !== null) {
        expect(
          report.hitOk,
          `${path}: critical section hit-testable (hit: ${report.hitTarget ?? "none"})`,
        ).toBe(true);
      }
    }
  });

  test("scrolled state: sticky chrome stays small while prices are on screen", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await seedTwoChildPlan(page);
    await gotoStable(page, "/plan/checklist?mode=store");
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    const report = await auditOverlays(page);
    expect(report.dialogCount).toBe(0);
    expect(report.bigFixed).toEqual([]);
  });
});
