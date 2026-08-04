/**
 * Static-render entry for Lighthouse CI (scripts/build-static.mjs).
 *
 * Renders only the screens that need NO bindings and NO data — the
 * indexable static-first pages. Everything data-bearing stays
 * Worker-rendered; this entry exists so `npm run build` can produce a
 * `dist/` for LHCI budgets (CLS/LCP) without a running Worker.
 */
import { renderDocument } from "./components/chrome";
import { renderHome } from "./screens/home";
import { renderMethodology } from "./screens/methodology";
import { renderIntake } from "./screens/intake";
import { buildStylesheet } from "./styles";
import { webManifest } from "./pwa";

export interface StaticPage {
  path: string;
  html: string;
}

export function staticPages(): StaticPage[] {
  const options = { fixtureMode: true };
  return [
    { path: "index.html", html: renderDocument(renderHome(), options) },
    { path: "methodology/index.html", html: renderDocument(renderMethodology(), options) },
    {
      path: "intake/index.html",
      html: renderDocument(renderIntake({ kind: "form", tab: "paste" }), options),
    },
  ];
}

export const staticStylesheet = buildStylesheet;
export const staticManifest = webManifest;
