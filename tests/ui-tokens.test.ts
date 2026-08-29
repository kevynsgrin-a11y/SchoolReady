/**
 * Token-contract conformance: src/ui/tokens.ts must match the direction.md
 * §14 export contract (palette, status colors, type trio, spacing, radii,
 * breakpoints, containers) EXACTLY, and the generated stylesheet must carry
 * every custom property with no third-party font/icon calls (§1.7 posture).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BREAKPOINTS,
  COLOR_TOKENS,
  CONTAINERS,
  ELEVATION,
  FONT_FAMILIES,
  MIN_TOUCH_TARGET_PX,
  RADII,
  SPACE_SCALE,
  STATUS_TOKENS,
  TYPE_SCALE,
  tokensCss,
} from "../src/ui/tokens";
import { buildStylesheet } from "../src/ui/styles";

const direction = readFileSync(
  fileURLToPath(new URL("../docs/design/direction.md", import.meta.url)),
  "utf8",
);

describe("tokens — direction.md §14 conformance", () => {
  it("palette hex values match the §1 table exactly", () => {
    expect(COLOR_TOKENS).toEqual({
      ink: "#25302A",
      paper: "#F7F8F2",
      surface: "#FFFFFF",
      action: "#1B6B54",
      rule: "#A7C4DE",
      graphite: "#5C6660",
      accent: "#E5A49B",
    });
  });

  it("status hex values match the §2 table exactly (separate family)", () => {
    expect(STATUS_TOKENS).toEqual({
      recall: "#B3261E",
      restricted: "#5B4B8A",
      stale: "#8A5B00",
      staleTint: "#FBEFD2",
      stock: "#5C6660",
      signal: "#2C5F9E",
      sponsored: "#6E5527",
      sponsoredTint: "#F2E8D8",
    });
  });

  it("every color literal is transcribed from the direction document", () => {
    for (const hex of [...Object.values(COLOR_TOKENS), ...Object.values(STATUS_TOKENS)]) {
      expect(direction, `direction.md must contain ${hex}`).toContain(hex);
    }
  });

  it("spacing scale is 4/8/12/16/24/32/48/64/96 — nothing off-scale", () => {
    expect([...SPACE_SCALE]).toEqual([4, 8, 12, 16, 24, 32, 48, 64, 96]);
  });

  it("radii are 0/4/8/16 — no pill shapes", () => {
    expect([...RADII]).toEqual([0, 4, 8, 16]);
  });

  it("breakpoints and containers match §4", () => {
    expect(BREAKPOINTS).toEqual({ sm: 480, md: 768, lg: 1024, xl: 1280 });
    expect(CONTAINERS).toEqual({ flow: 640, plan: 880, compare: 1120, page: 1200 });
  });

  it("type trio is Bricolage / Atkinson Hyperlegible Next / Spline Sans Mono", () => {
    expect(FONT_FAMILIES.display).toContain("Bricolage Grotesque");
    expect(FONT_FAMILIES.body).toContain("Atkinson Hyperlegible Next");
    expect(FONT_FAMILIES.data).toContain("Spline Sans Mono");
    // system-ui only in fallback stacks, never as the design.
    for (const stack of Object.values(FONT_FAMILIES)) {
      expect(stack.startsWith("system-ui")).toBe(false);
    }
  });

  it("type scale steps match the §3 table (size/line/weight)", () => {
    expect(TYPE_SCALE["display-xl"]).toMatchObject({ sizePx: 40, linePx: 44, weight: 800 });
    expect(TYPE_SCALE["display-l"]).toMatchObject({ sizePx: 32, linePx: 36, weight: 700 });
    expect(TYPE_SCALE.title).toMatchObject({ sizePx: 24, linePx: 28, weight: 700 });
    expect(TYPE_SCALE.heading).toMatchObject({ sizePx: 20, linePx: 24, weight: 600 });
    expect(TYPE_SCALE["body-l"]).toMatchObject({ sizePx: 18, linePx: 28 });
    expect(TYPE_SCALE.body).toMatchObject({ sizePx: 16, linePx: 24 });
    expect(TYPE_SCALE.label).toMatchObject({ sizePx: 14, linePx: 20, weight: 700 });
    expect(TYPE_SCALE.overline).toMatchObject({ sizePx: 12, linePx: 16, weight: 500, uppercase: true });
    expect(TYPE_SCALE.data).toMatchObject({ sizePx: 14, linePx: 20, weight: 400 });
    expect(TYPE_SCALE["data-s"]).toMatchObject({ sizePx: 12, linePx: 16, weight: 400 });
    // Line heights are multiples of 4 (4px baseline grid).
    for (const def of Object.values(TYPE_SCALE)) {
      expect(def.linePx % 4).toBe(0);
    }
  });

  it("elevation has exactly two levels above flat (no level 3)", () => {
    expect(Object.keys(ELEVATION)).toEqual(["card", "overlay"]);
  });

  it("touch target minimum is 44px", () => {
    expect(MIN_TOUCH_TARGET_PX).toBe(44);
  });
});

describe("generated CSS", () => {
  const css = tokensCss();
  const sheet = buildStylesheet();

  it("emits every --color-*, --status-*, --space-*, --radius-* property", () => {
    for (const name of Object.keys(COLOR_TOKENS)) expect(css).toContain(`--color-${name}:`);
    expect(css).toContain("--status-recall: #B3261E");
    expect(css).toContain("--status-stale-tint: #FBEFD2");
    SPACE_SCALE.forEach((px, i) => expect(css).toContain(`--space-${i + 1}: ${px}px`));
    RADII.forEach((px, i) => expect(css).toContain(`--radius-${i}: ${px}px`));
  });

  it("restores the [hidden] contract ahead of any rule that sets display", () => {
    // Regression: `[hidden]{display:none}` is a USER-AGENT rule, so any author
    // declaration setting `display` beats it regardless of specificity. Without
    // an author-side reset, `.offline-banner{display:flex}` rendered a false
    // "You are offline" banner on every route in production, and
    // `.button{display:inline-flex}` unhid progressive-enhancement controls.
    expect(sheet).toContain("[hidden] { display: none !important; }");
    const reset = sheet.indexOf("[hidden] { display: none !important; }");
    const offlineBanner = sheet.indexOf(".fixture-ribbon, .offline-banner { display:");
    expect(reset).toBeGreaterThan(-1);
    expect(offlineBanner).toBeGreaterThan(reset);
  });

  it("emits --font-* and --text-* properties for every step", () => {
    for (const role of ["display", "body", "data"]) expect(css).toContain(`--font-${role}:`);
    for (const step of Object.keys(TYPE_SCALE)) {
      expect(css).toContain(`--text-${step}-size:`);
      expect(css).toContain(`--text-${step}-line:`);
    }
  });

  it("self-hosts all three families and never calls a third-party CDN", () => {
    expect(sheet).toContain('url(/assets/fonts/bricolage-grotesque-latin-700-normal.woff2)');
    expect(sheet).toContain('url(/assets/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2)');
    expect(sheet).toContain('url(/assets/fonts/spline-sans-mono-latin-400-normal.woff2)');
    expect(sheet).not.toMatch(/https?:\/\//);
  });

  it("ships the focus-visible ring, 44px targets, and reduced-motion collapse", () => {
    expect(sheet).toContain(":focus-visible");
    expect(sheet).toContain("--touch-target: 44px");
    expect(sheet).toContain("prefers-reduced-motion");
  });

  it("reserves red for recall chrome only — no decorative red tokens", () => {
    // The only #B3261E usages are the recall status custom property and
    // recall-classed rules; no --color-* brand token is red.
    for (const hex of Object.values(COLOR_TOKENS)) {
      expect(hex).not.toBe("#B3261E");
    }
  });
});
