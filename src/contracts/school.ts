/**
 * School directory contract. Fixture posture: synthetic schools
 * (isSynthetic=true, ncesSchoolId=null) until the NCES CCD live source is
 * licensed (config/flags.ts liveSources.nces_ccd).
 *
 * §0 NOT #1: a school row is directory identity only — this contract never
 * carries a school's supply list or a link to a school-hosted list document.
 * §1.7: state/city granularity only; no street address.
 */
import type { IsoTimestamp, WithProvenance } from "./provenance";

export const GRADE_LEVELS = [
  "K",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

/** USPS two-letter state code ("TX"). Drives sales-tax-holiday scope. */
export type StateCode = string;

export interface School extends WithProvenance {
  id: string;
  /** NCES CCD identifier; null for synthetic fixture schools. */
  ncesSchoolId: string | null;
  name: string;
  districtName: string | null;
  state: StateCode;
  city: string | null;
  gradeLow: GradeLevel;
  gradeHigh: GradeLevel;
  isSynthetic: boolean;
  createdAt: IsoTimestamp;
}
