/**
 * Static-render entry for Lighthouse CI (scripts/build-static.mjs).
 *
 * Renders only the screens that need NO bindings and NO data — the
 * indexable static-first pages. Everything data-bearing stays
 * Worker-rendered; this entry exists so `npm run build` can produce a
 * `dist/` for LHCI budgets (CLS/LCP) without a running Worker.
 *
 * [SEO — Phase 8] Static pages carry the SAME resolved head (robots,
 * canonical, JSON-LD) as their Worker-rendered counterparts, and the build
 * emits sitemap.xml + robots.txt from src/seo/ so dist/ is crawl-complete.
 */
import { renderDocument } from "./components/chrome";
import { renderHome } from "./screens/home";
import { renderMethodology } from "./screens/methodology";
import { renderIntake } from "./screens/intake";
import { buildStylesheet } from "./styles";
import { webManifest } from "./pwa";
import { resolveSeoForPath } from "../seo/integration";
import { generateRobotsTxt, generateSitemapXml } from "../seo/sitemap";

export interface StaticPage {
  path: string;
  html: string;
}

/** Head for a cookieless GET — exactly what a crawler receives. */
const seoFor = (path: string) =>
  resolveSeoForPath(path, { method: "GET", hasSession: false });

export function staticPages(): StaticPage[] {
  const options = (path: string) => ({ fixtureMode: true, seo: seoFor(path) });
  return [
    { path: "index.html", html: renderDocument(renderHome(), options("/")) },
    {
      path: "methodology/index.html",
      html: renderDocument(renderMethodology(), options("/methodology")),
    },
    {
      path: "intake/index.html",
      html: renderDocument(renderIntake({ kind: "form", tab: "paste" }), options("/intake")),
    },
  ];
}

export const staticStylesheet = buildStylesheet;
export const staticManifest = webManifest;
export const staticSitemap = (): string => generateSitemapXml();
export const staticRobots = generateRobotsTxt;
