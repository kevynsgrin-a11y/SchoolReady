/**
 * Component library: the 11-badge system (icon + text + color, never
 * icon-only or color-only), the Sum Rule / Net-Required Stack signature
 * element, escaping, buttons, and skeletons.
 */
import { describe, expect, it } from "vitest";
import { html } from "../src/ui/html";
import { BADGE_KINDS, BADGE_SPECS, badgeFor } from "../src/ui/components/badges";
import type { BadgeKind } from "../src/ui/components/badges";
import {
  MINUS_SIGN,
  budgetBar,
  moneyCents,
  netRequiredStack,
  packMathChip,
  sumRuleTotal,
} from "../src/ui/components/ledger";
import { button, checkbox, select, textInput } from "../src/ui/components/forms";
import { skeletonScreen } from "../src/ui/components/skeleton";
import { recallBanner } from "../src/ui/components/banners";
import { ICON_PATHS, icon } from "../src/ui/icons";

const badgeData = { passingFamilies: 4, totalFamilies: 5, lastCheckedDate: "2026-08-03" };

describe("badge system — direction §6, all 11 badges", () => {
  it.each([...BADGE_KINDS])("badge '%s' renders icon + visible text label", (kind: BadgeKind) => {
    const out = badgeFor(kind, badgeData).__html;
    expect(out).toContain("<svg");
    expect(out).toContain('class="badge-label"');
    expect(out).toMatch(/badge-label">[^<]+</); // non-empty visible text
    expect(out).toContain(`data-badge="${kind}"`);
  });

  it("uses the fixed Lucide mapping — no improvised icons", () => {
    expect(BADGE_SPECS.required.icon).toBe("asterisk");
    expect(BADGE_SPECS.trending.icon).toBe("trending-up");
    expect(BADGE_SPECS.recalled.icon).toBe("octagon-alert");
    expect(BADGE_SPECS["school-restricted"].icon).toBe("shield-x");
    expect(BADGE_SPECS.sponsored.icon).toBe("megaphone");
    expect(BADGE_SPECS.stale.icon).toBe("clock-alert");
  });

  it("chip grammar: solid=safety, dashed=availability, ticket=commercial", () => {
    expect(BADGE_SPECS.recalled.chipClass).toContain("chip-fill");
    expect(BADGE_SPECS["school-restricted"].chipClass).toContain("chip-fill");
    expect(BADGE_SPECS["out-of-stock"].chipClass).toContain("chip-dashed");
    expect(BADGE_SPECS.stale.chipClass).toContain("chip-dashed");
    expect(BADGE_SPECS.sponsored.chipClass).toContain("chip-ticket");
    expect(BADGE_SPECS["insufficient-evidence"].chipClass).toContain("chip-dotted");
    expect(BADGE_SPECS.useful.chipClass).toContain("chip-outline");
  });

  it("trending badge embeds its evidence count in the label (§1.3)", () => {
    const out = badgeFor("trending", badgeData).__html;
    expect(out).toContain("Trending (4 of 5 signal families)");
  });

  it("REFUSES to render trending without counts or stale without a date", () => {
    expect(() => badgeFor("trending")).toThrow(/signal-family counts/);
    expect(() => badgeFor("stale")).toThrow(/last-checked date/);
  });

  it("stale badge carries the last-checked date from the envelope", () => {
    expect(badgeFor("stale", badgeData).__html).toContain(
      "Prices last checked 2026-08-03",
    );
  });
});

describe("signature element — Sum Rule and Net-Required Stack (direction §5)", () => {
  it("net-required stack subtracts with the TRUE minus sign over a sum rule", () => {
    const out = netRequiredStack({
      requiredLabel: "Required (both kids)",
      requiredUnits: 48,
      ownedLabel: "Already at home",
      ownedUnits: 19,
      resultLabel: "To buy",
      resultUnits: 29,
    }).__html;
    expect(out).toContain(MINUS_SIGN);
    expect(MINUS_SIGN).toBe("−");
    expect(out).toContain("sum-rule");
    expect(out).toContain("net-required-stack");
    expect(out).toContain("29");
  });

  it("renders the whole-unit rounding line only when ceil changed the number", () => {
    const args = {
      requiredLabel: "Required",
      requiredUnits: 12,
      ownedLabel: "Owned",
      ownedUnits: 4.5,
      resultLabel: "To buy",
      resultUnits: 7.5,
      wholeUnitsLabel: "To buy (whole units)",
      wholeUnits: 8,
    };
    expect(netRequiredStack(args).__html).toContain("To buy (whole units)");
    expect(
      netRequiredStack({ ...args, resultUnits: 8, wholeUnits: 8 }).__html,
    ).not.toContain("To buy (whole units)");
  });

  it("an operand with a receipt expands via a native details element", () => {
    const out = netRequiredStack({
      requiredLabel: "Required",
      requiredUnits: 6,
      ownedLabel: "Owned",
      ownedUnits: 2,
      resultLabel: "To buy",
      resultUnits: 4,
      requiredReceipt: html`<span>per-child receipt</span>`,
    }).__html;
    expect(out).toContain("<details");
    expect(out).toContain("per-child receipt");
  });

  it("a FINAL total carries the double rule; a subtotal does not", () => {
    const grand = sumRuleTotal({ label: "Landed cost", value: "$9.84", final: true }).__html;
    const sub = sumRuleTotal({ label: "Items", value: "$9.00" }).__html;
    expect(grand).toContain("double-rule");
    expect(sub).not.toContain("double-rule");
    expect(sub).toContain("sum-rule");
  });

  it("pack math chip shows the conversion with the underlined result", () => {
    const out = packMathChip({ packs: 2, packCount: 24, units: 48 }).__html;
    expect(out).toContain("2 × 24 ct");
    expect(out).toContain('class="pack-result"');
    expect(out).toContain("48");
  });

  it("moneyCents formats deterministically", () => {
    expect(moneyCents(123456)).toBe("$1234.56");
    expect(moneyCents(0)).toBe("$0.00");
    expect(moneyCents(5)).toBe("$0.05");
    expect(moneyCents(-100)).toBe(`${MINUS_SIGN}$1.00`);
  });

  it("budget bar clamps its fraction and labels the fill for AT", () => {
    const out = budgetBar({ label: "fixture-mart", value: "$9.84", fraction: 2 }).__html;
    expect(out).toContain("width:100%");
    expect(out).toContain('aria-label="fixture-mart: 100%"');
  });
});

describe("forms, skeletons, banners, escaping", () => {
  it("escapes interpolated user text everywhere by default", () => {
    const out = html`<p>${"<script>alert(1)</script>"}</p>`.__html;
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("buttons are native <button> elements with visible labels", () => {
    const out = button({ label: "Compare baskets across stores" }).__html;
    expect(out).toContain("<button type=\"submit\"");
    expect(out).toContain("Compare baskets across stores");
  });

  it("inputs and selects always pair with their id (label targets)", () => {
    expect(textInput({ id: "quantity", name: "quantity" }).__html).toContain('id="quantity"');
    expect(
      select({ id: "unit", name: "unit", options: [{ value: "each", label: "each" }] }).__html,
    ).toContain('id="unit"');
    expect(checkbox({ id: "c1", name: "c1", label: "Include" }).__html).toContain('for="c1"');
  });

  it("skeletons are aria-busy status regions with fixed-height bars and NO facts", () => {
    const out = skeletonScreen({ rows: 3, withLedger: true }).__html;
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('role="status"');
    expect(out).toContain("height:16px");
    expect(out).not.toContain("sum-rule"); // the rule is a certificate of computation
    expect(out).not.toMatch(/\$\d/);
  });

  it("recall banner is a static role=alert with icon + Recalled label", () => {
    const out = recallBanner({ title: "fixture recall", body: html`<p>details</p>` }).__html;
    expect(out).toContain('role="alert"');
    expect(out).toContain("icon-octagon-alert");
    expect(out).toContain("Recalled");
  });

  it("icons are vendored Lucide inline SVGs, aria-hidden, currentColor", () => {
    expect(Object.keys(ICON_PATHS).length).toBeGreaterThanOrEqual(30);
    const svg = icon("history", { size: 14, stroke: 1.75 }).__html;
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('width="14"');
    expect(svg).toContain('stroke-width="1.75"');
  });
});
