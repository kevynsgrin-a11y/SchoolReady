/**
 * PWA surface: the web app manifest, generated at runtime so the name is
 * always the runtime brand value (§0 brand isolation — no literal anywhere).
 * The service worker itself is a static asset (public/sw.js) that keeps the
 * in-store checklist working through connection loss.
 */
import { BRAND } from "../../config/brand";
import { COLOR_TOKENS } from "./tokens";

export function webManifest(): string {
  return JSON.stringify({
    name: BRAND.name,
    short_name: BRAND.name,
    description:
      "Anonymous K-8 supply-list planner: verified lists, net-required math, honest store comparisons.",
    start_url: "/plan/checklist",
    scope: "/",
    display: "standalone",
    background_color: COLOR_TOKENS.paper,
    theme_color: COLOR_TOKENS.paper,
    icons: [],
  });
}
