/**
 * Server integration — Phase 8 (seo-architect).
 *
 * The ONLY module src/ui/server.ts imports from src/seo. It resolves a
 * per-request head (robots directive, canonical, JSON-LD) from the route
 * metadata map and serves the generated crawl assets (/sitemap.xml,
 * /robots.txt). All policy lives in the sibling modules; this file is glue.
 */
import { SESSION_COOKIE } from "../api/contracts";
import { parseCookies } from "../api/session";
import { COMMON } from "../ui/copy/en";
import { canonicalOrigin } from "./config";
import type { RequestSeoContext, RobotsDirective, RouteSeoEntry } from "./route-metadata";
import { resolveRobots } from "./route-metadata";
import { generateRobotsTxt, generateSitemapXml } from "./sitemap";
import { breadcrumbJsonLd, serializeJsonLd, webSiteJsonLd } from "./structured-data";

/** Structurally satisfies SeoHead in src/ui/components/chrome.ts. */
export interface ResolvedSeo {
  readonly robots: RobotsDirective;
  readonly canonicalUrl: string | null;
  readonly jsonLd: readonly string[];
}

function jsonLdFor(entry: RouteSeoEntry): string[] {
  const blocks: string[] = [];
  for (const kind of entry.jsonLd) {
    if (kind === "website") blocks.push(serializeJsonLd(webSiteJsonLd()));
    if (kind === "breadcrumb" && entry.breadcrumbLabel !== null) {
      blocks.push(
        serializeJsonLd(
          breadcrumbJsonLd([
            { name: COMMON.navHome, path: "/" },
            { name: entry.breadcrumbLabel, path: entry.pattern },
          ]),
        ),
      );
    }
  }
  return blocks;
}

export function resolveSeoForPath(path: string, ctx: RequestSeoContext): ResolvedSeo {
  const { robots, entry } = resolveRobots(path, ctx);
  if (robots !== "index,follow" || entry === null) {
    // Canonical + structured data are index-only signals; a noindex render
    // carries neither (mixed signals confuse crawlers and audits alike).
    return { robots, canonicalUrl: null, jsonLd: [] };
  }
  // Canonical strips query state (?tab=, ?view=, ?days=...) to the pattern;
  // parameterized patterns canonicalize to the concrete request path.
  const canonicalPath = entry.pattern.includes("/:") ? path : entry.pattern;
  return {
    robots,
    canonicalUrl: `${canonicalOrigin()}${canonicalPath}`,
    jsonLd: jsonLdFor(entry),
  };
}

export function resolveSeoForRequest(request: Request): ResolvedSeo {
  const url = new URL(request.url);
  // Exact cookie-NAME match via the API's own parser (gate finding P8-4): a
  // substring test would count any cookie whose name merely ends in the
  // session name.
  const cookies = parseCookies(request.headers.get("cookie"));
  const hasSession = cookies[SESSION_COOKIE] !== undefined;
  return resolveSeoForPath(url.pathname, { method: request.method, hasSession });
}

/** Serves /sitemap.xml and /robots.txt; null for every other path. */
export function seoAssetResponse(url: URL): Response | null {
  if (url.pathname === "/sitemap.xml") {
    return new Response(generateSitemapXml(), {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  }
  if (url.pathname === "/robots.txt") {
    return new Response(generateRobotsTxt(), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  }
  return null;
}
