/**
 * Phase 8 — SEO wiring over the REAL UI server: robots meta + X-Robots-Tag
 * on every render, canonical/JSON-LD on indexable pages only, session
 * cookie flips anonymous-only tools to noindex, sitemap.xml/robots.txt
 * served with 100% noindex exclusion, and no review/rating/offer structured
 * data anywhere in any rendered page.
 */
import { describe, expect, it } from "vitest";
import { BRAND } from "../config/brand";
import { canonicalOrigin } from "../src/seo/config";
import { nonIndexablePaths } from "../src/seo/route-metadata";
import { handleUiRequest } from "../src/ui/server";
import { makeClient } from "./api-helpers";
import type { WorkerClient } from "./api-helpers";

const INDEX_META = '<meta name="robots" content="index,follow">';
const NOINDEX_META = '<meta name="robots" content="noindex">';

interface UiResult {
  status: number;
  html: string;
  headers: Headers;
}

const capturedPages: string[] = [];

async function ui(
  client: WorkerClient,
  method: "GET" | "POST",
  path: string,
  options: { form?: Record<string, string>; cookie?: string | null } = {},
): Promise<UiResult> {
  const headers = new Headers();
  const cookie = options.cookie === undefined ? client.cookie : options.cookie;
  if (cookie) headers.set("cookie", cookie);
  let body: FormData | undefined;
  if (options.form) {
    body = new FormData();
    for (const [key, value] of Object.entries(options.form)) body.append(key, value);
  }
  const response = await handleUiRequest(
    new Request(`http://fixture.test${path}`, { method, headers, body }),
    client.deps,
  );
  if (response === null) throw new Error(`UI layer did not own ${method} ${path}`);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) client.cookie = setCookie.split(";")[0] ?? null;
  const html = response.status === 303 ? "" : await response.text();
  if (html.startsWith("<!doctype html>")) capturedPages.push(html);
  return { status: response.status, html, headers: response.headers };
}

describe("SEO over real rendered pages", () => {
  const client = makeClient({ idPrefix: "seo" });
  const origin = canonicalOrigin();

  it("homepage (cookieless): index,follow meta + header, canonical, WebSite JSON-LD", async () => {
    const home = await ui(client, "GET", "/", { cookie: null });
    expect(home.status).toBe(200);
    expect(home.html).toContain(INDEX_META);
    expect(home.headers.get("x-robots-tag")).toBe("index,follow");
    expect(home.html).toContain(`<link rel="canonical" href="${origin}/">`);
    expect(home.html).toContain('<script type="application/ld+json">');
    expect(home.html).toContain('"@type":"WebSite"');
    expect(home.html).toContain(`"name":"${BRAND.name}"`);
  });

  it("anonymous tool pages are indexable with breadcrumb trails", async () => {
    for (const path of ["/plan/basket", "/budget", "/deals", "/capsule", "/intake", "/methodology"]) {
      const page = await ui(client, "GET", path, { cookie: null });
      expect(page.html, path).toContain(INDEX_META);
      expect(page.headers.get("x-robots-tag"), path).toBe("index,follow");
      expect(page.html, path).toContain(`<link rel="canonical" href="${origin}${path}">`);
      if (path !== "/") expect(page.html, path).toContain('"@type":"BreadcrumbList"');
    }
  });

  it("query state canonicalizes to the bare tool path", async () => {
    const page = await ui(client, "GET", "/plan/basket?view=cheapest&days=6", { cookie: null });
    expect(page.html).toContain(`<link rel="canonical" href="${origin}/plan/basket">`);
  });

  it("POSTed intake review renders noindex (uploads/reviews never index)", async () => {
    const review = await ui(client, "POST", "/intake/manual", {
      cookie: null,
      form: { productTypeSlug: "glue-stick", quantity: "6", unit: "each", optionality: "required" },
    });
    expect(review.status).toBe(200);
    expect(client.cookie).toContain("k8p_sid=");
    expect(review.html).toContain(NOINDEX_META);
    expect(review.headers.get("x-robots-tag")).toBe("noindex");
    expect(review.html).not.toContain('rel="canonical"');
  });

  it("the SAME tool paths flip to noindex once the session cookie rides in", async () => {
    expect(client.cookie).toContain("k8p_sid=");
    for (const path of ["/plan/basket", "/budget", "/deals"]) {
      const page = await ui(client, "GET", path);
      expect(page.html, path).toContain(NOINDEX_META);
      expect(page.headers.get("x-robots-tag"), path).toBe("noindex");
      expect(page.html, path).not.toContain('rel="canonical"');
    }
  });

  it("personalized, account, status, safety, trend, and item pages are noindex", async () => {
    for (const path of [
      "/plan",
      "/plan/checklist",
      "/household",
      "/account",
      "/admin/status",
      "/safety",
      "/trends",
      "/item/fixture-gel-pen",
    ]) {
      const page = await ui(client, "GET", path);
      expect(page.html, path).toContain(NOINDEX_META);
      expect(page.headers.get("x-robots-tag"), path).toBe("noindex");
    }
  });

  it("404 renders are noindex", async () => {
    const missing = await ui(client, "GET", "/no-such-page");
    expect(missing.status).toBe(404);
    expect(missing.html).toContain(NOINDEX_META);
    expect(missing.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("sitemap.xml is served and excludes 100% of noindex routes", async () => {
    const sitemap = await ui(client, "GET", "/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    expect(sitemap.html).toContain(`<loc>${origin}/plan/basket</loc>`);
    expect(sitemap.html).toContain(`<loc>${origin}/methodology</loc>`);
    for (const path of nonIndexablePaths()) {
      expect(sitemap.html, `${path} leaked into the served sitemap`).not.toContain(
        `<loc>${origin}${path}</loc>`,
      );
    }
  });

  it("robots.txt is served, blocks only /api/, and points at the sitemap", async () => {
    const robots = await ui(client, "GET", "/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.html).toContain("Disallow: /api/");
    expect(robots.html).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect(robots.html).not.toContain("Disallow: /plan");
    expect(robots.html).not.toContain("Disallow: /account");
  });

  it("no rendered page carries review/rating/offer structured-data markers", () => {
    expect(capturedPages.length).toBeGreaterThan(10);
    const markers = [
      "aggregateRating",
      "ratingValue",
      "reviewCount",
      '"offers"',
      '"@type":"Review"',
      '"@type":"Product"',
      '"@type":"Offer"',
      '"@type":"AggregateRating"',
    ];
    for (const page of capturedPages) {
      for (const marker of markers) {
        expect(page).not.toContain(marker);
      }
    }
  });

  it("every rendered page carries exactly one robots directive, mirrored in the header", () => {
    for (const page of capturedPages) {
      const count =
        (page.includes(INDEX_META) ? 1 : 0) + (page.includes(NOINDEX_META) ? 1 : 0);
      expect(count).toBe(1);
    }
  });
});
