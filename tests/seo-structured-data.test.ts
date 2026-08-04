/**
 * Phase 8 — structured data: only WebSite and BreadcrumbList, describing
 * things we actually hold. The invented-markup guard makes it IMPOSSIBLE to
 * serialize review/rating/offer nodes — data this product does not have.
 */
import { describe, expect, it } from "vitest";
import { BRAND } from "../config/brand";
import { canonicalOrigin } from "../src/seo/config";
import { resolveSeoForPath } from "../src/seo/integration";
import { ROUTE_SEO } from "../src/seo/route-metadata";
import {
  FORBIDDEN_STRUCTURED_KEYS,
  FORBIDDEN_STRUCTURED_TYPES,
  InventedMarkupError,
  assertNoInventedMarkup,
  breadcrumbJsonLd,
  serializeJsonLd,
  webSiteJsonLd,
} from "../src/seo/structured-data";

describe("emitters — only what we hold", () => {
  it("WebSite node: name and url from config, nothing else invented", () => {
    expect(webSiteJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND.name,
      url: `${canonicalOrigin()}/`,
    });
  });

  it("BreadcrumbList node: positions and absolute items from the real trail", () => {
    const node = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Budget", path: "/budget" },
    ]) as { itemListElement: { position: number; item: string }[] };
    expect(node.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(node.itemListElement[1]!.item).toBe(`${canonicalOrigin()}/budget`);
  });
});

describe("invented-markup guard — review/rating/offer data cannot ship", () => {
  it("throws on every forbidden key, however deeply nested", () => {
    for (const key of FORBIDDEN_STRUCTURED_KEYS) {
      const poisoned = { "@type": "WebSite", nested: { deeper: { [key]: 4.8 } } };
      expect(() => assertNoInventedMarkup(poisoned), key).toThrow(InventedMarkupError);
    }
  });

  it("throws on every forbidden @type, including inside arrays", () => {
    for (const type of FORBIDDEN_STRUCTURED_TYPES) {
      const poisoned = { "@type": "ItemList", itemListElement: [{ "@type": type }] };
      expect(() => assertNoInventedMarkup(poisoned), type).toThrow(InventedMarkupError);
    }
  });

  it("serializeJsonLd refuses a poisoned node before it can render", () => {
    expect(() =>
      serializeJsonLd({ "@type": "WebSite", aggregateRating: { ratingValue: 5 } }),
    ).toThrow(InventedMarkupError);
  });

  it("passes clean nodes and escapes '<' so a script tag can never close itself", () => {
    const serialized = serializeJsonLd({ "@type": "WebSite", name: "</script><b>" });
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });
});

describe("no route can emit invented markup", () => {
  it("every mapped route's resolved JSON-LD is free of review/rating/offer markers", () => {
    const markers = [
      '"aggregateRating"',
      '"ratingValue"',
      '"reviewCount"',
      '"offers"',
      '"@type":"Review"',
      '"@type":"Product"',
      '"@type":"Offer"',
      '"@type":"AggregateRating"',
    ];
    for (const entry of ROUTE_SEO) {
      const path = entry.pattern.includes("/:")
        ? entry.pattern.replace("/:slug", "/example-slug")
        : entry.pattern;
      for (const hasSession of [false, true]) {
        const seo = resolveSeoForPath(path, { method: "GET", hasSession });
        for (const block of seo.jsonLd) {
          for (const marker of markers) {
            expect(block, `${entry.pattern} emitted ${marker}`).not.toContain(marker);
          }
        }
      }
    }
  });
});
