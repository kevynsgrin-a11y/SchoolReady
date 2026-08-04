/**
 * State sales-tax-holiday contracts (Phase 2, ingestion-engineer; consumed by
 * basket comparison in Phase 4 — §0 capability 3 tax eligibility).
 *
 * A holiday is a state-scoped date window plus per-category price caps
 * (e.g. clothing up to a cap, school supplies up to a cap; null = no cap).
 * Geography stops at the state (§1.7: no finer location persists anywhere).
 *
 * Fixture posture: fixture calendars are modeled on typical statutory
 * structure but are NOT verified against state revenue departments —
 * provenance carries reduced confidence and explicit limitations; §1.5
 * requires the basket layer to suppress or caveat tax math accordingly.
 */
import type { IsoTimestamp, WithProvenance } from "./provenance";
import type { StateCode } from "./school";

export const TAX_HOLIDAY_CATEGORIES = [
  "clothing",
  "footwear",
  "school_supplies",
  "computers",
  "backpacks",
  "other",
] as const;
export type TaxHolidayCategory = (typeof TAX_HOLIDAY_CATEGORIES)[number];

export interface TaxHoliday extends WithProvenance {
  id: string;
  state: StateCode;
  year: number;
  /** ISO dates, inclusive window. */
  startsOn: string;
  endsOn: string;
  /** Link to the authoritative state page (deep link, never mirrored). */
  infoUrl: string | null;
  isSynthetic: boolean;
  createdAt: IsoTimestamp;
}

export interface TaxHolidayCategoryRule extends WithProvenance {
  id: string;
  holidayId: string;
  category: TaxHolidayCategory;
  /** Per-item price cap in cents; null = no cap for this category. */
  priceCapCents: number | null;
  createdAt: IsoTimestamp;
}
