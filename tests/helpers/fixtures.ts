/**
 * Node-side fixture loading for tests and offline fixture-ingestion proofs.
 * (Workers-side bundling of fixture documents is wired in Phase 5; adapters
 * take the parsed document as an injected dependency either way.)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FixtureDocument } from "../../src/ingestion/types";
import type { NcesCcdRow } from "../../src/ingestion/adapters/nces-ccd";
import type { CpscRecallRow } from "../../src/ingestion/adapters/cpsc-recalls";
import type { TaxHolidayRow } from "../../src/ingestion/adapters/tax-holidays";
import type { ProductFeedRow } from "../../src/ingestion/adapters/product-feeds";

export const fixturesDir = fileURLToPath(new URL("../../fixtures", import.meta.url));

export function loadFixtureDoc<TRaw>(relativePath: string): FixtureDocument<TRaw> {
  return JSON.parse(
    readFileSync(join(fixturesDir, relativePath), "utf8"),
  ) as FixtureDocument<TRaw>;
}

export const loadSchoolsFixture = (): FixtureDocument<NcesCcdRow> =>
  loadFixtureDoc<NcesCcdRow>("nces-ccd/schools.fixture.json");

export const loadRecallsFixture = (): FixtureDocument<CpscRecallRow> =>
  loadFixtureDoc<CpscRecallRow>("cpsc-recalls/recalls.fixture.json");

export const loadTaxHolidaysFixture = (): FixtureDocument<TaxHolidayRow> =>
  loadFixtureDoc<TaxHolidayRow>("tax-holidays/2026.fixture.json");

export const loadOffersFixture = (): FixtureDocument<ProductFeedRow> =>
  loadFixtureDoc<ProductFeedRow>("product-feeds/offers.fixture.json");

/** All fixture JSON files on disk (discovered, never hardcoded). */
export function listFixtureFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".json")) out.push(full);
    }
  };
  walk(fixturesDir);
  return out.sort();
}
