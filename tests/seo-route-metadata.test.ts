/**
 * Phase 8 — route metadata map: every HTML route the UI server renders has
 * an explicit index/noindex decision with rationale-as-data; resolution is
 * default-deny (unknown path, non-GET, missing programmatic evidence all
 * resolve noindex); canonical + JSON-LD are index-only signals.
 */
import { describe, expect, it } from "vitest";
import { BRAND } from "../config/brand";
import { canonicalOrigin } from "../src/seo/config";
import {
  RATIONALE_CODES,
  ROUTE_SEO,
  indexablePaths,
  matchRoute,
  nonIndexablePaths,
  resolveRobots,
} from "../src/seo/route-metadata";
import { resolveSeoForPath, resolveSeoForRequest } from "../src/seo/integration";
import { SESSION_COOKIE } from "../src/api/contracts";

/**
 * The UI server's HTML GET routes as of Phase 8 (src/ui/server.ts router).
 * If the server grows a route, the resolver default-denies it (safe), but
 * this list must be updated together with the map — that is the point.
 */
const SERVER_HTML_ROUTES = [
  "/",
  "/intake",
  "/household",
  "/plan",
  "/plan/checklist",
  "/plan/basket",
  "/capsule",
  "/trends",
  "/safety",
  "/budget",
  "/deals",
  "/methodology",
  "/account",
  "/admin/status",
  "/item/:slug",
] as const;

const anonymous = { method: "GET", hasSession: false } as const;
const withSession = { method: "GET", hasSession: true } as const;

describe("route metadata map — coverage and rationale", () => {
  it("covers exactly the server's HTML GET routes, no more, no less", () => {
    expect([...ROUTE_SEO.map((e) => e.pattern)].sort()).toEqual(
      [...SERVER_HTML_ROUTES].sort(),
    );
  });

  it("every entry carries a known rationale code and a non-empty detail", () => {
    for (const entry of ROUTE_SEO) {
      expect(RATIONALE_CODES).toContain(entry.rationale.code);
      expect(entry.rationale.detail.length).toBeGreaterThan(20);
    }
  });

  it("indexable set is exactly the sanctioned tool/landing surfaces", () => {
    expect([...indexablePaths()].sort()).toEqual(
      ["/", "/budget", "/capsule", "/deals", "/intake", "/methodology", "/plan/basket"].sort(),
    );
  });

  it("noindex + programmatic sets cover everything else", () => {
    expect([...nonIndexablePaths()].sort()).toEqual(
      [
        "/account",
        "/admin/status",
        "/household",
        "/item/:slug",
        "/plan",
        "/plan/checklist",
        "/safety",
        "/trends",
      ].sort(),
    );
  });

  it("matches parameterized item routes but never nested paths", () => {
    expect(matchRoute("/item/fixture-gel-pen")?.pattern).toBe("/item/:slug");
    expect(matchRoute("/item/fixture-gel-pen/extra")).toBeNull();
    expect(matchRoute("/item/")).toBeNull();
  });
});

describe("robots resolution — default deny", () => {
  it("non-GET renders are noindex even on indexable routes", () => {
    expect(resolveRobots("/", { method: "POST", hasSession: false }).robots).toBe("noindex");
    expect(resolveRobots("/capsule", { method: "POST", hasSession: false }).robots).toBe("noindex");
  });

  it("unknown paths (404 renders) are noindex", () => {
    expect(resolveRobots("/no-such-page", anonymous).robots).toBe("noindex");
    expect(resolveRobots("/no-such-page", anonymous).entry).toBeNull();
  });

  it("anonymous-only tools flip to noindex once a session cookie rides in", () => {
    for (const path of ["/plan/basket", "/budget", "/deals"]) {
      expect(resolveRobots(path, anonymous).robots).toBe("index,follow");
      expect(resolveRobots(path, withSession).robots).toBe("noindex");
    }
  });

  it("personalized/account/operational routes are noindex in EVERY context", () => {
    for (const path of [
      "/plan",
      "/plan/checklist",
      "/household",
      "/trends",
      "/safety",
      "/account",
      "/admin/status",
    ]) {
      expect(resolveRobots(path, anonymous).robots).toBe("noindex");
      expect(resolveRobots(path, withSession).robots).toBe("noindex");
    }
  });

  it("programmatic routes default-deny without supplied gate evidence", () => {
    expect(resolveRobots("/item/fixture-gel-pen", anonymous).robots).toBe("noindex");
    expect(
      resolveRobots("/item/fixture-gel-pen", { ...anonymous, programmatic: null }).robots,
    ).toBe("noindex");
  });
});

describe("request session detection — exact cookie-name match (P8-4)", () => {
  const requestFor = (cookie: string | null): Request =>
    new Request("https://fixture.test/plan/basket", {
      headers: cookie === null ? {} : { cookie },
    });

  it("a cookie whose name merely ends in the session name is NOT a session", () => {
    expect(resolveSeoForRequest(requestFor(`not_${SESSION_COOKIE}=x`)).robots).toBe(
      "index,follow",
    );
  });

  it("the real session cookie flips the same route to noindex", () => {
    expect(resolveSeoForRequest(requestFor(`${SESSION_COOKIE}=x`)).robots).toBe("noindex");
    expect(
      resolveSeoForRequest(requestFor(`a=1; ${SESSION_COOKIE}=x; b=2`)).robots,
    ).toBe("noindex");
  });

  it("no cookie header at all resolves anonymous", () => {
    expect(resolveSeoForRequest(requestFor(null)).robots).toBe("index,follow");
  });
});

describe("resolved head — canonical and JSON-LD are index-only signals", () => {
  it("indexable render: canonical strips to the pattern, origin from config", () => {
    const seo = resolveSeoForPath("/plan/basket", anonymous);
    expect(seo.robots).toBe("index,follow");
    expect(seo.canonicalUrl).toBe(`${canonicalOrigin()}/plan/basket`);
    expect(seo.canonicalUrl).toContain(BRAND.domain);
  });

  it("noindex render: no canonical, no structured data", () => {
    const seo = resolveSeoForPath("/plan/basket", withSession);
    expect(seo.robots).toBe("noindex");
    expect(seo.canonicalUrl).toBeNull();
    expect(seo.jsonLd).toEqual([]);
  });

  it("homepage carries the WebSite node; personalized pages carry nothing", () => {
    const home = resolveSeoForPath("/", anonymous);
    expect(home.jsonLd.some((b) => b.includes('"WebSite"'))).toBe(true);
    expect(resolveSeoForPath("/plan", anonymous).jsonLd).toEqual([]);
  });

  it("tool pages carry a real BreadcrumbList trail", () => {
    const seo = resolveSeoForPath("/budget", anonymous);
    expect(seo.jsonLd.some((b) => b.includes('"BreadcrumbList"'))).toBe(true);
    expect(seo.jsonLd.some((b) => b.includes(`${canonicalOrigin()}/budget`))).toBe(true);
  });
});
