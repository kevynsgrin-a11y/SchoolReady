/**
 * Contrast + color-vision audit — computed, not eyeballed.
 *
 * Every text/background and badge-foreground/badge-background pair that the
 * generated stylesheet (src/ui/styles.ts) can produce from the pinned
 * tokens (src/ui/tokens.ts) is enumerated here with its WCAG 2.2 AA
 * threshold (1.4.3 text 4.5:1; 1.4.11 non-text 3:1 — including the focus
 * indicator against every surface it can sit on).
 *
 * The design direction's flagged residual risk (direction.md §13.4 —
 * Eraser Pink within waving distance of Recall Red) is tested under the
 * three common dichromacy simulations using the published Machado,
 * Oliveira & Fernandes (IEEE TVCG 2009) severity-1.0 matrices, and the
 * structural rule that meaning never rides on that hue pair is asserted
 * against the generated CSS itself.
 *
 * The test prints the full measured table for docs/a11y/audit-phase-11.md.
 */
import { test, expect } from "@playwright/test";
import { COLOR_TOKENS, STATUS_TOKENS } from "../src/ui/tokens";
import { buildStylesheet } from "../src/ui/styles";
import { contrastRatio, deltaE76, simulateCvd } from "./color-math";
import type { CvdKind } from "./color-math";

const C = COLOR_TOKENS;
const S = STATUS_TOKENS;
/** The one non-token literal in styles.ts: .button-primary:hover. */
const BUTTON_HOVER = "#14523F";
const WHITE = "#FFFFFF";

interface Pair {
  fg: string;
  bg: string;
  where: string;
  kind: "text" | "non-text";
}

const req = (kind: Pair["kind"]): number => (kind === "text" ? 4.5 : 3);

export const CONTRAST_PAIRS: Pair[] = [
  // Body text
  { fg: C.ink, bg: C.paper, where: "body text on the page (styles.ts body)", kind: "text" },
  { fg: C.ink, bg: C.surface, where: "text on cards/sheets (.card, tables)", kind: "text" },
  { fg: C.graphite, bg: C.paper, where: "secondary text (.muted, .provenance-line, hints)", kind: "text" },
  { fg: C.graphite, bg: C.surface, where: "secondary text + placeholders in cards/controls", kind: "text" },
  { fg: C.action, bg: C.paper, where: "links on the page (a color)", kind: "text" },
  { fg: C.action, bg: C.surface, where: "links/nav-active/.tab-active on cards + header", kind: "text" },
  { fg: WHITE, bg: C.action, where: ".button-primary label", kind: "text" },
  { fg: WHITE, bg: BUTTON_HOVER, where: ".button-primary:hover label", kind: "text" },
  { fg: C.ink, bg: C.accent, where: ".capsule-card-header title on Eraser Pink tint", kind: "text" },
  // Badges (direction §6 — every badge fg/bg pair)
  { fg: C.paper, bg: C.ink, where: "badge-required (Loose-leaf on Ink fill)", kind: "text" },
  { fg: C.action, bg: C.surface, where: "badge-useful (outline chip on Ream)", kind: "text" },
  { fg: C.graphite, bg: C.surface, where: "badge-optional / out-of-stock / insufficient-evidence", kind: "text" },
  { fg: S.signal, bg: C.surface, where: "badge-trending / badge-cooling (Signal Blue on Ream)", kind: "text" },
  { fg: S.sponsored, bg: S.sponsoredTint, where: "badge-sponsored + .fixture-ribbon (Kraft on tint)", kind: "text" },
  { fg: WHITE, bg: S.recall, where: "badge-recalled + .banner-recall text/links", kind: "text" },
  { fg: S.recall, bg: WHITE, where: "inverse recalled badge inside the recall banner", kind: "text" },
  { fg: WHITE, bg: S.restricted, where: "badge-school-restricted + .banner-restricted", kind: "text" },
  { fg: S.restricted, bg: WHITE, where: "inverse restricted badge inside the banner", kind: "text" },
  { fg: S.stale, bg: S.staleTint, where: "badge-stale + .suppression-notice + .offline-banner", kind: "text" },
  { fg: S.stock, bg: C.surface, where: "out-of-stock badge (Graphite, dashed chip)", kind: "text" },
  // Status colors on plain page surfaces (freestanding uses)
  { fg: S.signal, bg: C.paper, where: "review-needs annotations / trend text on the page", kind: "text" },
  { fg: S.recall, bg: C.paper, where: "recall text if ever set on the page (defense-in-depth)", kind: "text" },
  // Non-text UI (WCAG 1.4.11, 3:1)
  { fg: C.action, bg: C.paper, where: "focus ring on the page background", kind: "non-text" },
  { fg: C.action, bg: C.surface, where: "focus ring on cards/header/footer", kind: "non-text" },
  { fg: C.action, bg: S.staleTint, where: "focus ring on stale-tint chrome", kind: "non-text" },
  { fg: C.action, bg: S.sponsoredTint, where: "focus ring on kraft-tint chrome", kind: "non-text" },
  { fg: WHITE, bg: S.recall, where: "focus ring INSIDE .banner-recall (Phase 11 fix)", kind: "non-text" },
  { fg: WHITE, bg: S.restricted, where: "focus ring INSIDE .banner-restricted (Phase 11 fix)", kind: "non-text" },
  { fg: C.graphite, bg: C.surface, where: ".control borders (input/select/textarea)", kind: "non-text" },
  { fg: C.action, bg: C.surface, where: "checkbox accent-color against control surface", kind: "non-text" },
  { fg: S.stale, bg: S.staleTint, where: "dashed suppression/stale chip borders", kind: "non-text" },
  { fg: S.sponsored, bg: S.sponsoredTint, where: "sponsored ticket-notch chip border", kind: "non-text" },
  { fg: S.signal, bg: C.surface, where: ".review-needs left indicator bar", kind: "non-text" },
  { fg: C.ink, bg: C.paper, where: "sum rule / double rule (certificate of computation)", kind: "non-text" },
];

test("every text and badge pair meets WCAG 2.2 AA (4.5:1 text, 3:1 non-text)", () => {
  const rows: string[] = [
    "| Foreground | Background | Where | Kind | Ratio | Required | Verdict |",
    "|---|---|---|---|---|---|---|",
  ];
  const failures: string[] = [];
  for (const pair of CONTRAST_PAIRS) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    const needed = req(pair.kind);
    const pass = ratio >= needed;
    rows.push(
      `| \`${pair.fg}\` | \`${pair.bg}\` | ${pair.where} | ${pair.kind} | ${ratio.toFixed(2)}:1 | ${needed}:1 | ${pass ? "pass" : "FAIL"} |`,
    );
    if (!pass) failures.push(`${pair.where}: ${ratio.toFixed(2)}:1 < ${needed}:1`);
  }
  console.log(`[contrast table]\n${rows.join("\n")}`);
  expect(failures, failures.join("\n")).toEqual([]);
});

test("KNOWN EXEMPT: decorative rules are below 3:1 and must stay non-semantic", () => {
  // Rule Blue is decorative-only by direction §1 ("never text, never icons,
  // never a status") — it measures below 3:1 on purpose. This test pins the
  // measurement AND the CSS-side guarantee that no interactive boundary
  // uses it: .control and .button borders use Graphite/Ink/Action only.
  expect(contrastRatio(C.rule, C.paper)).toBeLessThan(3);
  const css = buildStylesheet();
  const controlRule = css.split("\n").find((l) => l.startsWith(".control {"))!;
  expect(controlRule).toContain("var(--color-graphite)");
  expect(controlRule).not.toContain("var(--color-rule)");
  const buttonRules = css.split("\n").filter((l) => l.startsWith(".button-"));
  for (const line of buttonRules) expect(line).not.toContain("var(--color-rule)");
});

/* ------------------------------------------------------------------ */
/* Eraser Pink vs Recall Red under color-vision deficiency             */
/* ------------------------------------------------------------------ */

const CVD_KINDS: CvdKind[] = ["protanopia", "deuteranopia", "tritanopia"];

test("Eraser Pink vs Recall Red: lightness separation survives all three dichromacies (Machado et al. 2009)", () => {
  const rows: string[] = [
    "| Vision | Eraser Pink renders as | Recall Red renders as | Luminance contrast | deltaE (CIE76) |",
    "|---|---|---|---|---|",
  ];
  const normal = contrastRatio(C.accent, S.recall);
  rows.push(
    `| typical | \`${C.accent}\` | \`${S.recall}\` | ${normal.toFixed(2)}:1 | ${deltaE76(C.accent, S.recall).toFixed(1)} |`,
  );
  // The hues DO collapse toward each other under red-green CVD (that is the
  // direction doc's flagged risk). The channel that survives is LIGHTNESS:
  // pink is a light background tint, Recall Red a dark fill. Measured
  // floors below are convergence checks (the pair never approaches
  // sameness), NOT AA thresholds — WCAG 1.4.1 compliance rests on the
  // structural rule asserted in the next test (pink never carries meaning;
  // red always ships icon + text label). Measured: deuteranopia is the
  // worst case at ~2.8:1 lightness separation, deltaE ~42 (measured 41.8).
  expect(normal).toBeGreaterThanOrEqual(3);
  for (const kind of CVD_KINDS) {
    const pink = simulateCvd(C.accent, kind);
    const red = simulateCvd(S.recall, kind);
    const ratio = contrastRatio(pink, red);
    rows.push(
      `| ${kind} | \`${pink}\` | \`${red}\` | ${ratio.toFixed(2)}:1 | ${deltaE76(pink, red).toFixed(1)} |`,
    );
    expect(
      ratio,
      `${kind}: simulated pink (${pink}) vs recall red (${red}) converged too far in lightness`,
    ).toBeGreaterThan(2);
    expect(
      deltaE76(pink, red),
      `${kind}: simulated pink (${pink}) vs recall red (${red}) converged too far perceptually`,
    ).toBeGreaterThan(15);
  }
  console.log(`[cvd table]\n${rows.join("\n")}`);
});

test("structural rule: meaning never rides on the pink/red hue pair (CSS-level)", () => {
  const css = buildStylesheet();
  const lines = css.split("\n");

  // Eraser Pink: background tint on the capsule module header ONLY — never
  // a text color, never a status class, never a chip.
  const accentUses = lines.filter(
    (l) => l.includes("var(--color-accent)") && !l.trimStart().startsWith("--color-accent:"),
  );
  expect(accentUses).toHaveLength(1);
  expect(accentUses[0]).toContain(".capsule-card-header");
  expect(accentUses[0]).toContain("background: var(--color-accent)");
  expect(accentUses[0]).not.toContain("color: var(--color-accent)");

  // Recall Red: solid-fill safety chrome only (banner + badge), where the
  // badge component makes icon + text label mandatory by construction.
  const recallUses = lines.filter(
    (l) => l.includes("var(--status-recall)") && !l.trimStart().startsWith("--status-recall:"),
  );
  expect(recallUses.length).toBeGreaterThan(0);
  for (const line of recallUses) {
    const selector = line.slice(0, line.indexOf("{")).trim();
    expect(
      selector.split(",").every((s) => /banner-recall|badge-recalled/.test(s)),
      `Recall Red may only appear in safety chrome; found: ${selector}`,
    ).toBe(true);
  }
});
