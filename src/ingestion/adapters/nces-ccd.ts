/**
 * NCES CCD school+district directory adapter (SourceId 'nces_ccd').
 *
 * Raw rows use the CCD directory field names (NCESSCH, SCH_NAME, LEA_NAME,
 * LEAID, LSTATE, LCITY, GSLO, GSHI) so the live implementation, when it
 * lands, normalizes through the same code path as fixtures.
 *
 * §0 NOT #1: this is DIRECTORY IDENTITY ONLY — school name, district, state,
 * city, grade span. No supply-list content exists in this feed shape and
 * none may ever be added.
 *
 * Fixture posture: fixture documents carry obviously synthetic schools
 * ("Meadow Valley Elementary (Fixture)", NCESSCH "FIXTURE-SCH-...").
 * Normalized fixture Schools set ncesSchoolId=null + isSynthetic=true per
 * the school contract, so a synthetic row can never collide with a real
 * NCES identifier.
 */
import type { Flags } from "../../../config/flags";
import type { GradeLevel, School } from "../../contracts/school";
import { GRADE_LEVELS } from "../../contracts/school";
import type {
  Clock,
  FixtureDocument,
  IngestionBatch,
  SourceAdapter,
} from "../types";
import { isoFromMs } from "../types";
import { assertFixtureDocument, provenanceFromFixture } from "../provenance";
import { createLiveStub } from "./live-stub";

/** CCD directory field shape (subset we consume). */
export interface NcesCcdRow {
  NCESSCH: string;
  SCH_NAME: string;
  LEA_NAME: string;
  LEAID: string;
  LSTATE: string;
  LCITY: string;
  /** CCD grade codes: 'PK', 'KG', '01'..'12'. */
  GSLO: string;
  GSHI: string;
}

/** Map a CCD grade code onto the K-8 contract vocabulary, clamped to K-8. */
export function gradeFromCcd(code: string, bound: "low" | "high"): GradeLevel {
  if (code === "PK" || code === "KG") return "K";
  const n = Number.parseInt(code, 10);
  if (Number.isNaN(n)) return bound === "low" ? "K" : "8";
  if (n < 1) return "K";
  if (n > 8) return "8";
  return GRADE_LEVELS[n] as GradeLevel; // GRADE_LEVELS = ['K','1',...,'8']
}

export function createNcesCcdFixtureAdapter(
  doc: FixtureDocument<NcesCcdRow>,
  clock: Clock,
): SourceAdapter<School> {
  return {
    sourceId: "nces_ccd",
    mode: "fixture",
    fetchBatch(): Promise<IngestionBatch<School>> {
      assertFixtureDocument(doc, "nces_ccd");
      const now = isoFromMs(clock());
      const records = doc.records.map((row, i) => {
        const provenance = provenanceFromFixture(
          doc.provenance,
          `school-${row.NCESSCH}`,
          clock,
          `US-${row.LSTATE}`,
        );
        const school: School = {
          id: `school:fixture:${String(i + 1).padStart(4, "0")}`,
          // Synthetic rows never carry an NCES identifier (school contract).
          ncesSchoolId: null,
          name: row.SCH_NAME,
          districtName: row.LEA_NAME,
          state: row.LSTATE,
          city: row.LCITY,
          gradeLow: gradeFromCcd(row.GSLO, "low"),
          gradeHigh: gradeFromCcd(row.GSHI, "high"),
          isSynthetic: true,
          provenanceId: provenance.id,
          createdAt: now,
        };
        return { record: school, provenance };
      });
      return Promise.resolve({ sourceId: "nces_ccd", fetchedAt: now, records });
    },
  };
}

/** Factory honoring flags: fixture unless the live flag is ON (then stub). */
export function createNcesCcdAdapter(
  flags: Flags,
  doc: FixtureDocument<NcesCcdRow>,
  clock: Clock,
): SourceAdapter<School> {
  return flags.liveSources.nces_ccd
    ? createLiveStub<School>("nces_ccd")
    : createNcesCcdFixtureAdapter(doc, clock);
}
