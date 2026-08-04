/**
 * Ad-slot placement rules as code — Phase 9 (monetization-engineer).
 *
 * §1.2 + handoff 09 §8: ad slots may mount ONLY on editorial/guide surfaces
 * (`editorial_article`, `editorial_guide_footer` — src/ui/slots.ts is the
 * single source of truth), always after all protected content, and NEVER on
 * a tool, planner, safety, checkout, or account surface. In this beta ZERO
 * editorial surfaces exist, so the mount table below is empty — and the
 * rules make that structural, not conventional: a mount outside the reserved
 * editorial route prefix or off an editorial surface throws.
 *
 * Season Pass (§ ad-free entitlement): `slotsForSurface` keys on
 * `gates.adFreeExtras` — the ONLY thing an entitlement may gate (Phase 5
 * contract) — and returns zero slots for entitled sessions even on
 * editorial surfaces. Core surfaces carry zero slots for everyone.
 */
import type { AdSlotSpec, PageSection, SlotSurface } from "../ui/slots";
import { AD_SLOT_REGISTRY, SLOT_SURFACES, renderAdSlot } from "../ui/slots";

export class AdPlacementError extends Error {
  constructor(detail: string) {
    super(`ad placement violation (SS1.2 / editorial-only rule): ${detail}`);
    this.name = "AdPlacementError";
  }
}

/** Structural slice of the Phase 5 EntitlementsData gate (no api import — §1.1 closure). */
export interface AdFreeGates {
  readonly adFreeExtras: boolean;
}

/**
 * Reserved route prefix for future editorial/guide pages (seo-architect owns
 * the actual routes; docs/seo/editorial-cluster-plan.md). No route under
 * this prefix exists in the beta, so no mount can name a servable route.
 */
export const EDITORIAL_ROUTE_PREFIX = "/guides/";

export function isEditorialSurface(surface: string): surface is SlotSurface {
  return (
    (SLOT_SURFACES as readonly string[]).includes(surface) && surface.startsWith("editorial_")
  );
}

export interface SlotMount {
  readonly slotId: string;
  readonly surface: SlotSurface;
  /** Route the slot mounts on — must live under EDITORIAL_ROUTE_PREFIX. */
  readonly route: string;
}

/**
 * The shipped mount table: EMPTY. Zero slots are mounted anywhere in this
 * beta (tests pin this). Any future entry must pass assertMountAllowed.
 */
export const MOUNTED_SLOTS: readonly SlotMount[] = [];

/** Validates one mount against every placement rule; returns its spec. */
export function assertMountAllowed(mount: SlotMount): AdSlotSpec {
  if (!isEditorialSurface(mount.surface)) {
    throw new AdPlacementError(
      `surface "${mount.surface}" is not an editorial surface; slots may never mount on tool, planner, safety, checkout, or account surfaces`,
    );
  }
  const spec = AD_SLOT_REGISTRY.find((s) => s.id === mount.slotId);
  if (spec === undefined) {
    throw new AdPlacementError(`slot id "${mount.slotId}" is not in AD_SLOT_REGISTRY`);
  }
  if (!spec.surfaces.includes(mount.surface)) {
    throw new AdPlacementError(
      `slot "${mount.slotId}" is not registered for surface "${mount.surface}"`,
    );
  }
  if (!mount.route.startsWith(EDITORIAL_ROUTE_PREFIX)) {
    throw new AdPlacementError(
      `route "${mount.route}" is outside the reserved editorial prefix "${EDITORIAL_ROUTE_PREFIX}"`,
    );
  }
  return spec;
}

/** Every shipped mount must be legal; trivially true while the table is empty. */
export function assertMountTable(mounts: readonly SlotMount[] = MOUNTED_SLOTS): void {
  for (const mount of mounts) assertMountAllowed(mount);
}

/**
 * The slots a surface may render for a given session. Non-editorial surface
 * -> none. Ad-free entitlement -> none, even on editorial surfaces. This is
 * the only function that hands slot specs to a renderer.
 */
export function slotsForSurface(surface: string, gates: AdFreeGates | null): AdSlotSpec[] {
  if (gates !== null && gates.adFreeExtras) return [];
  if (!isEditorialSurface(surface)) return [];
  return AD_SLOT_REGISTRY.filter((s) => s.surfaces.includes(surface));
}

/**
 * Ad sections for an editorial page, ready for the §1.2-enforcing section
 * composer (they must be appended AFTER all protected content — the
 * composer throws otherwise, and the route-tree scan re-proves it outside).
 */
export function editorialAdSections(surface: string, gates: AdFreeGates | null): PageSection[] {
  return slotsForSurface(surface, gates).map((spec) => ({
    kind: "ad_slot" as const,
    body: renderAdSlot(spec),
  }));
}
