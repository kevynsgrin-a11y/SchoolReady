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
    // Installed users land on the checklist (the in-aisle surface), but the
    // manifest must still declare icons or no platform will offer install.
    start_url: "/plan/checklist",
    scope: "/",
    display: "standalone",
    background_color: COLOR_TOKENS.paper,
    theme_color: COLOR_TOKENS.paper,
    // Chromium requires at least one >=144px icon before beforeinstallprompt
    // fires; "maskable" supplies the safe-zone variant Android crops to.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
