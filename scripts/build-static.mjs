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
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(repoRoot, "dist");
const bundle = join(tmpdir(), `static-site-${process.pid}.mjs`);

execFileSync(
  join(repoRoot, "node_modules", "esbuild", "bin", "esbuild"),
  [
    join(repoRoot, "src", "ui", "static-site.ts"),
    "--bundle",
    "--format=esm",
    "--platform=neutral",
    `--outfile=${bundle}`,
  ],
  { stdio: "inherit" },
);

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
cpSync(join(repoRoot, "public", "assets"), join(dist, "assets"), { recursive: true });
cpSync(join(repoRoot, "public", "sw.js"), join(dist, "sw.js"));
rmSync(bundle, { force: true });
console.log(`build-static: wrote ${site.staticPages().length} page(s) + assets to dist/`);
