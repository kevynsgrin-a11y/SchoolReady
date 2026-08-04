/**
 * State sales-tax-holiday calendar adapter (SourceId 'state_tax_holidays').
 *
 * Raw rows are state-scoped windows with per-category caps. §1.7: geography
 * stops at the state code.
 *
 * Fixture posture: the 2026 fixture calendar is modeled on typical statutory
 * structure but is NOT verified against any state revenue department — the
 * fixture provenance carries reduced confidence and explicit limitations,
 * and every normalized row is isSynthetic=true. §1.5: the basket layer must
 * caveat or suppress tax math built on this until a verified source lands.
 */
import type { Flags } from "../../../config/flags";
import type {
  TaxHoliday,
  TaxHolidayCategory,
  TaxHolidayCategoryRule,
} from "../../contracts/tax-holiday";
import type {
  Clock,
  FixtureDocument,
  IngestionBatch,
  SourceAdapter,
} from "../types";
import { isoFromMs } from "../types";
import { assertFixtureDocument, provenanceFromFixture } from "../provenance";
import { createLiveStub } from "./live-stub";

export interface TaxHolidayRow {
  state: string;
  year: number;
  /** Inclusive ISO-date window. */
  startsOn: string;
  endsOn: string;
  infoUrl: string | null;
  categories: Array<{
    category: TaxHolidayCategory;
    /** null = no per-item cap. */
    priceCapCents: number | null;
  }>;
}

export interface TaxHolidayBundle {
  holiday: TaxHoliday;
  categories: TaxHolidayCategoryRule[];
}

export function createTaxHolidayFixtureAdapter(
  doc: FixtureDocument<TaxHolidayRow>,
  clock: Clock,
): SourceAdapter<TaxHolidayBundle> {
  return {
    sourceId: "state_tax_holidays",
    mode: "fixture",
    fetchBatch(): Promise<IngestionBatch<TaxHolidayBundle>> {
      assertFixtureDocument(doc, "state_tax_holidays");
      const now = isoFromMs(clock());
      const records = doc.records.map((row) => {
        const provenance = provenanceFromFixture(
          doc.provenance,
          `holiday-${row.state}-${row.year}`,
          clock,
          `US-${row.state}`,
        );
        const holidayId = `tax-holiday:fixture:${row.state}-${row.year}`;
        const holiday: TaxHoliday = {
          id: holidayId,
          state: row.state,
          year: row.year,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          infoUrl: row.infoUrl,
          isSynthetic: true,
          provenanceId: provenance.id,
          createdAt: now,
        };
        const categories: TaxHolidayCategoryRule[] = row.categories.map((c) => ({
          id: `${holidayId}:${c.category}`,
          holidayId,
          category: c.category,
          priceCapCents: c.priceCapCents,
          provenanceId: provenance.id,
          createdAt: now,
        }));
        return { record: { holiday, categories }, provenance };
      });
      return Promise.resolve({
        sourceId: "state_tax_holidays",
        fetchedAt: now,
        records,
      });
    },
  };
}

export function createTaxHolidayAdapter(
  flags: Flags,
  doc: FixtureDocument<TaxHolidayRow>,
  clock: Clock,
): SourceAdapter<TaxHolidayBundle> {
  return flags.liveSources.state_tax_holidays
    ? createLiveStub<TaxHolidayBundle>("state_tax_holidays")
    : createTaxHolidayFixtureAdapter(doc, clock);
}
