/**
 * Source registry (Phase 2). One registration per config/flags.ts SourceId,
 * each carrying the licensing flag (what may be fetched, cached, persisted,
 * displayed) — compliance-officer builds the Phase 10 licensing register
 * from this file plus the persisted source_health rows.
 *
 * §0 NOT #1: every registration's dataKind comes from a closed vocabulary
 * that has NO member for supply-list content. TeacherLists, district PDFs,
 * and school-hosted lists are not sources, will never be sources, and have
 * nowhere to land (no adapter, no table, no fixture).
 *
 * `liveEndpointDoc` values are documentation pointers for humans; nothing in
 * Phase 2 fetches them (live stubs throw before any network code runs).
 */
import type { SourceId } from "../../config/flags";
import type { SourceLicensing } from "../contracts/source";

/** Closed vocabulary of what a source may contain. No list content, ever. */
export const SOURCE_DATA_KINDS = [
  "school_directory",
  "product_safety_recalls",
  "tax_holiday_calendar",
  "retailer_offers",
] as const;
export type SourceDataKind = (typeof SOURCE_DATA_KINDS)[number];

export interface SourceRegistration {
  sourceId: SourceId;
  displayName: string;
  provider: string;
  dataKind: SourceDataKind;
  licensing: SourceLicensing;
  /** Namespaced fixture set backing this source in fixture mode. */
  fixtureSet: string;
  /** Human documentation pointer only — never fetched in Phase 2. */
  liveEndpointDoc: string;
}

export const SOURCE_REGISTRATIONS: Record<SourceId, SourceRegistration> = {
  nces_ccd: {
    sourceId: "nces_ccd",
    displayName: "NCES Common Core of Data school directory",
    provider: "National Center for Education Statistics (US Dept. of Education)",
    dataKind: "school_directory",
    licensing: {
      basis: "us_government_open_data",
      // US government open data; still OFF until liveSources.nces_ccd flips
      // and compliance-officer signs the register (Phase 10).
      allowLiveFetch: false,
      allowCache: true,
      allowPersist: true,
      allowDisplay: true,
      attributionRequired: true,
      notes:
        "Public-domain US federal directory data. Directory identity only " +
        "(name/district/state/city/grades) — never supply lists. Live fetch " +
        "stays off until the flag flips and the compliance register records it.",
    },
    fixtureSet: "fixture:nces-ccd-2026-v1",
    liveEndpointDoc: "https://nces.ed.gov/ccd/files.asp",
  },
  cpsc_recalls: {
    sourceId: "cpsc_recalls",
    displayName: "CPSC recall feed",
    provider: "US Consumer Product Safety Commission",
    dataKind: "product_safety_recalls",
    licensing: {
      basis: "us_government_open_data",
      allowLiveFetch: false,
      allowCache: true,
      allowPersist: true,
      allowDisplay: true,
      attributionRequired: true,
      notes:
        "Public-domain US federal safety data. We store structured recall " +
        "facts and deep-link to the CPSC notice; ConsumerContact fields are " +
        "never ingested (contact-shaped data, §1.7 posture).",
    },
    fixtureSet: "fixture:cpsc-recalls-2026-v1",
    liveEndpointDoc: "https://www.saferproducts.gov/RestWebServices",
  },
  state_tax_holidays: {
    sourceId: "state_tax_holidays",
    displayName: "State sales-tax-holiday calendar",
    provider: "State departments of revenue (per-state)",
    dataKind: "tax_holiday_calendar",
    licensing: {
      basis: "state_public_records",
      // Each state's page must be vetted individually before live fetch.
      allowLiveFetch: false,
      allowCache: true,
      allowPersist: true,
      allowDisplay: true,
      attributionRequired: true,
      notes:
        "Statutory public records, but sourced per-state; live collection " +
        "requires per-state source vetting by compliance-officer. Displayed " +
        "tax math must carry provenance limitations until verified (§1.5).",
    },
    fixtureSet: "fixture:tax-holidays-2026-v1",
    liveEndpointDoc:
      "https://www.streamlinedsalestax.org/for-businesses/sales-tax-holidays",
  },
  affiliate_feeds: {
    sourceId: "affiliate_feeds",
    displayName: "Retailer product feeds",
    provider: "Retail affiliate networks (contracts not yet in place)",
    dataKind: "retailer_offers",
    licensing: {
      basis: "commercial_contract_required",
      // Nothing is permitted until contracts land: deny-all licensing.
      allowLiveFetch: false,
      allowCache: false,
      allowPersist: false,
      allowDisplay: false,
      attributionRequired: false,
      notes:
        "No feed contract exists yet, so no live handling is licensed. " +
        "Fixture feeds (clearly synthetic retailers/prices) stand in for the " +
        "beta. §1.1: feed economics never enter ranking tables; when feeds " +
        "conflict with a neutral source, §1.5 suppresses.",
    },
    fixtureSet: "fixture:retailer-offers-2026-v1",
    liveEndpointDoc: "internal: docs pending contracts (Phase 9/10)",
  },
};
