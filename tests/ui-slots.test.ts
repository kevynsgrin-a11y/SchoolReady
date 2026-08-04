/**
 * §1.2 as layout data — the slot registry and the placement rule. This is
 * the layout-level encoding monetization-engineer's Phase 9 route-tree
 * scan verifies from the outside; here we prove the rule itself and that
 * every shipped screen passes it (zero mounted slots in this beta).
 */
import { describe, expect, it } from "vitest";
import {
  AD_SLOT_REGISTRY,
  CRITICAL_SECTION_KINDS,
  SLOT_SURFACES,
  SlotPlacementError,
  assertSafetyFirst,
  assertSlotPlacement,
  renderAdSlot,
} from "../src/ui/slots";
import { renderSections } from "../src/ui/components/chrome";
import { html } from "../src/ui/html";

const section = (kind: (typeof CRITICAL_SECTION_KINDS)[number] | "content" | "ad_slot" | "disclosure" | "navigation" | "safety_warning" | "form") => ({
  kind,
  body: html`<p>section body</p>`,
});

describe("slot registry — fixed dimensions, editorial surfaces only", () => {
  it("every slot reserves fixed positive dimensions (zero CLS)", () => {
    expect(AD_SLOT_REGISTRY.length).toBeGreaterThan(0);
    for (const slot of AD_SLOT_REGISTRY) {
      expect(slot.widthPx).toBeGreaterThan(0);
      expect(slot.heightPx).toBeGreaterThan(0);
      expect(Number.isInteger(slot.widthPx)).toBe(true);
      expect(Number.isInteger(slot.heightPx)).toBe(true);
    }
  });

  it("no slot may mount on a planner, safety, or checkout surface", () => {
    for (const slot of AD_SLOT_REGISTRY) {
      for (const surface of slot.surfaces) {
        expect(SLOT_SURFACES).toContain(surface);
        expect(surface).toMatch(/^editorial_/);
      }
    }
  });

  it("renders the reservation at its fixed size with the Sponsored ticket chip", () => {
    const spec = AD_SLOT_REGISTRY[0]!;
    const emptyReservation = renderAdSlot(spec).__html;
    const filled = renderAdSlot(spec, html`<p>creative</p>`).__html;
    const style = `style="width:${spec.widthPx}px;height:${spec.heightPx}px"`;
    expect(emptyReservation).toContain(style);
    expect(filled).toContain(style); // same reservation with or without creative
    expect(emptyReservation).toContain("Sponsored");
    expect(emptyReservation).toContain("chip-ticket");
  });
});

describe("§1.2 placement rule", () => {
  it("protects exactly the §1.2 list", () => {
    expect([...CRITICAL_SECTION_KINDS].sort()).toEqual(
      [
        "assistance_resource",
        "correction",
        "deadline",
        "dress_code_restriction",
        "price_change",
        "required_items",
        "safety_warning",
      ].sort(),
    );
  });

  it("throws when an ad slot sits between the user and required items", () => {
    expect(() =>
      assertSlotPlacement([section("content"), section("ad_slot"), section("required_items")]),
    ).toThrow(SlotPlacementError);
  });

  it("throws for every protected kind below an ad slot", () => {
    for (const kind of CRITICAL_SECTION_KINDS) {
      expect(() => assertSlotPlacement([section("ad_slot"), section(kind)])).toThrow(
        SlotPlacementError,
      );
    }
  });

  it("allows a slot strictly below ALL protected content", () => {
    expect(() =>
      assertSlotPlacement([
        section("safety_warning"),
        section("required_items"),
        section("content"),
        section("ad_slot"),
      ]),
    ).not.toThrow();
  });

  it("safety warnings must render above all commercial content", () => {
    expect(() =>
      assertSafetyFirst([section("disclosure"), section("safety_warning")]),
    ).toThrow(SlotPlacementError);
    expect(() =>
      assertSafetyFirst([section("safety_warning"), section("content"), section("disclosure")]),
    ).not.toThrow();
  });

  it("the page composer enforces the rule AT RENDER TIME, not just in tests", () => {
    expect(() =>
      renderSections([section("ad_slot"), section("deadline")]),
    ).toThrow(SlotPlacementError);
  });
});
