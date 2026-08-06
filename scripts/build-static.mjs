#!/usr/bin/env node
/**
 * Static build for Lighthouse CI (lighthouserc.json staticDistDir: dist).
 *
 * Bundles src/ui/static-site.ts with the esbuild that ships in
 * node_modules (vite dependency), imports it, and writes the static-first
 * pages plus assets into dist/. Only bindingless pages are rendered —
 * data-bearing screens are Worker-rendered and measured against a running
 * Worker in later phases.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(repoRoot, "dist");
const bundle = join(tmpdir(), `static-site-${process.pid}.mjs`);

await build({
  absWorkingDir: repoRoot,
  entryPoints: ["./src/ui/static-site.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: bundle,
  logLevel: "info",
});

const site = await import(pathToFileURL(bundle).href);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const page of site.staticPages()) {
  const target = join(dist, page.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, page.html);
}
mkdirSync(join(dist, "assets"), { recursive: true });
writeFileSync(join(dist, "assets", "ui.css"), site.staticStylesheet());
writeFileSync(join(dist, "manifest.webmanifest"), site.staticManifest());
// [SEO — Phase 8] Crawl assets from src/seo/ (indexable routes only).
writeFileSync(join(dist, "sitemap.xml"), site.staticSitemap());
writeFileSync(join(dist, "robots.txt"), site.staticRobots());
cpSync(join(repoRoot, "public", "assets"), join(dist, "assets"), { recursive: true });
cpSync(join(repoRoot, "public", "sw.js"), join(dist, "sw.js"));
rmSync(bundle, { force: true });
console.log(`build-static: wrote ${site.staticPages().length} page(s) + assets to dist/`);
