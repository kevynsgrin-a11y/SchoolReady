/**
 * Route metadata map — Phase 8 (seo-architect).
 *
 * Every HTML route the UI server renders gets an explicit index/noindex
 * decision here, with the RATIONALE encoded as data. Anything not in this
 * map resolves to noindex (default deny) — a new route is invisible to
 * crawlers until someone adds it here deliberately.
 *
 * Policy summary:
 *  - index: homepage, planner landing (/intake), methodology, and the
 *    capsule calculator — durable, identical for every visitor.
 *  - index_anonymous_only: basket / budget / tax-holiday tool pages. A
 *    crawler (cookieless) sees the generic tool; the SAME path rendered
 *    with a session cookie is a personalized result and goes noindex.
 *  - noindex: personalized plan/checklist/household/account surfaces,
 *    the session-derived trend radar, the CPSC feed page (no information
 *    gain over the source in the beta — §0 "not a repository" posture),
 *    and the operational status page.
 *  - programmatic: /item/:slug. Indexability requires clearing the quality
 *    gate (src/seo/quality-gate.ts) AND unexpired trend evidence
 *    (src/seo/trend-expiry.ts); with no evidence supplied the resolver
 *    default-denies. In the fixture-mode beta no programmatic page can
 *    clear the gate (fixture is not a verified source type) — by design.
 *
 * §0 NOT #1: no indexable route republishes school-list content. The only
 * list-bearing surfaces (/plan, /plan/checklist) are session-scoped,
 * noindex, and render the USER'S OWN confirmed items — never a school's
 * hosted list.
 *
 * POSTed responses (intake review, capsule results, upload flows) are
 * always noindex via the method rule in resolveRobots — personalized state
 * never enters the index regardless of path.
 */
import { COMMON } from "../ui/copy/en";
import type { QualityGateResult } from "./quality-gate";
import type { TrendPageStatus } from "./trend-expiry";

export const ROUTE_POLICIES = [
  "index",
  "index_anonymous_only",
  "noindex",
  "programmatic",
] as const;
export type RoutePolicy = (typeof ROUTE_POLICIES)[number];

export const RATIONALE_CODES = [
  "static_home",
  "planner_landing",
  "methodology_reference",
  "calculator_tool",
  "tool_generic_when_anonymous",
  "personalized_session_results",
  "account_surface",
  "operational_status",
  "programmatic_gate_required",
  "source_republication_no_gain",
] as const;
export type RationaleCode = (typeof RATIONALE_CODES)[number];

export type JsonLdKind = "website" | "breadcrumb";

export interface RouteSeoEntry {
  /** Exact path, or a one-segment pattern like "/item/:slug". */
  readonly pattern: string;
  readonly policy: RoutePolicy;
  readonly rationale: { readonly code: RationaleCode; readonly detail: string };
  /** Breadcrumb name for indexable tool pages (from the nav copy). */
  readonly breadcrumbLabel: string | null;
  readonly jsonLd: readonly JsonLdKind[];
}

export const ROUTE_SEO: readonly RouteSeoEntry[] = [
  {
    pattern: "/",
    policy: "index",
    rationale: {
      code: "static_home",
      detail: "Static homepage: what the tool does, identical for every visitor; no session data renders.",
    },
    breadcrumbLabel: null,
    jsonLd: ["website"],
  },
  {
    pattern: "/intake",
    policy: "index",
    rationale: {
      code: "planner_landing",
      detail: "Planner landing: the paste/manual/upload entry forms. Pure forms; upload RESULTS render only from POSTs, which are always noindex.",
    },
    breadcrumbLabel: COMMON.navIntake,
    jsonLd: ["breadcrumb"],
  },
  {
    pattern: "/methodology",
    policy: "index",
    rationale: {
      code: "methodology_reference",
      detail: "How the math works — genuine information gain, sourced from the engines' own constants.",
    },
    breadcrumbLabel: COMMON.navMethodology,
    jsonLd: ["breadcrumb"],
  },
  {
    pattern: "/capsule",
    policy: "index",
    rationale: {
      code: "calculator_tool",
      detail: "Capsule calculator: the GET render is a pure input form with no session data; results render only from POSTs (always noindex).",
    },
    breadcrumbLabel: COMMON.navCapsule,
    jsonLd: ["breadcrumb"],
  },
  {
    pattern: "/plan/basket",
    policy: "index_anonymous_only",
    rationale: {
      code: "tool_generic_when_anonymous",
      detail: "Basket-comparison tool. Cookieless render (what a crawler sees) is the generic tool; with a session cookie it renders personalized results and must be noindex.",
    },
    breadcrumbLabel: COMMON.navBasket,
    jsonLd: ["breadcrumb"],
  },
  {
    pattern: "/budget",
    policy: "index_anonymous_only",
    rationale: {
      code: "tool_generic_when_anonymous",
      detail: "Budget tool. Cookieless render is the generic tool; session renders are personalized results and must be noindex.",
    },
    breadcrumbLabel: COMMON.navBudget,
    jsonLd: ["breadcrumb"],
  },
  {
    pattern: "/deals",
    policy: "index_anonymous_only",
    rationale: {
      code: "tool_generic_when_anonymous",
      detail: "Sales-tax-holiday calendar. Cookieless render is the generic calendar surface; session renders fold in the household's basket and must be noindex.",
    },
    breadcrumbLabel: COMMON.navDeals,
    jsonLd: ["breadcrumb"],
  },
  {
    pattern: "/plan",
    policy: "noindex",
    rationale: {
      code: "personalized_session_results",
      detail: "Merged shopping plan for one household's session — personalized results, never indexable (§1.7 posture; §0 NOT #1: user list content never enters the index).",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
  {
    pattern: "/plan/checklist",
    policy: "noindex",
    rationale: {
      code: "personalized_session_results",
      detail: "Session checklist (saved-list state) — personalized, never indexable.",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
  {
    pattern: "/household",
    policy: "noindex",
    rationale: {
      code: "personalized_session_results",
      detail: "Household inventory audit — personalized session state.",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
  {
    pattern: "/trends",
    policy: "noindex",
    rationale: {
      code: "personalized_session_results",
      detail: "Trend radar built from the session's own checklist — personalized; trend evidence also expires (src/seo/trend-expiry.ts).",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
  {
    pattern: "/item/:slug",
    policy: "programmatic",
    rationale: {
      code: "programmatic_gate_required",
      detail: "Per-product evidence page. Indexable only if the quality gate passes AND trend evidence is unexpired; without supplied evidence the resolver default-denies. Fixture data never clears the gate, so every beta render is noindex.",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
  {
    pattern: "/safety",
    policy: "noindex",
    rationale: {
      code: "source_republication_no_gain",
      detail: "Lists CPSC recall data with no information gain over the source in the beta (§0 non-repository posture). Revisit only when list-matching — the part that IS ours — ships as a distinct verified surface.",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
  {
    pattern: "/account",
    policy: "noindex",
    rationale: {
      code: "account_surface",
      detail: "Alerts and privacy controls for one session — account surface, never indexable.",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
  {
    pattern: "/admin/status",
    policy: "noindex",
    rationale: {
      code: "operational_status",
      detail: "Provider/source health page — operational metadata, not search content.",
    },
    breadcrumbLabel: null,
    jsonLd: [],
  },
] as const;

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

export type RobotsDirective = "index,follow" | "noindex";

/** Evidence a programmatic route supplies to earn indexability. */
export interface ProgrammaticResolutionInput {
  readonly gate: QualityGateResult;
  /** null when the page is not trend-backed. */
  readonly trend: TrendPageStatus | null;
}

export interface ProgrammaticPolicy {
  readonly robots: RobotsDirective;
  /** true = the page auto-expired and is routed into editorial review. */
  readonly review: boolean;
}

export function resolveProgrammaticPolicy(
  input: ProgrammaticResolutionInput,
): ProgrammaticPolicy {
  if (input.trend !== null && input.trend.expired) {
    return { robots: "noindex", review: true };
  }
  if (!input.gate.pass) {
    return { robots: "noindex", review: false };
  }
  return { robots: "index,follow", review: false };
}

export interface RequestSeoContext {
  readonly method: string;
  /** Did the REQUEST carry the anonymous session cookie? */
  readonly hasSession: boolean;
  /** Evidence for programmatic routes; absent/null = default deny. */
  readonly programmatic?: ProgrammaticResolutionInput | null;
}

export function matchRoute(path: string): RouteSeoEntry | null {
  for (const entry of ROUTE_SEO) {
    const paramStart = entry.pattern.indexOf("/:");
    if (paramStart === -1) {
      if (entry.pattern === path) return entry;
      continue;
    }
    const prefix = entry.pattern.slice(0, paramStart + 1);
    const rest = path.startsWith(prefix) ? path.slice(prefix.length) : "";
    if (rest.length > 0 && !rest.includes("/")) return entry;
  }
  return null;
}

export interface ResolvedRobots {
  readonly robots: RobotsDirective;
  readonly entry: RouteSeoEntry | null;
  readonly review: boolean;
}

export function resolveRobots(path: string, ctx: RequestSeoContext): ResolvedRobots {
  const entry = matchRoute(path);
  // Any non-GET render (intake review, capsule results, upload flows) is
  // per-request state: never indexable, whatever the route's base policy.
  if (ctx.method !== "GET") return { robots: "noindex", entry, review: false };
  if (entry === null) return { robots: "noindex", entry: null, review: false };
  switch (entry.policy) {
    case "index":
      return { robots: "index,follow", entry, review: false };
    case "index_anonymous_only":
      return { robots: ctx.hasSession ? "noindex" : "index,follow", entry, review: false };
    case "noindex":
      return { robots: "noindex", entry, review: false };
    case "programmatic": {
      const evidence = ctx.programmatic ?? null;
      if (evidence === null) return { robots: "noindex", entry, review: false };
      const policy = resolveProgrammaticPolicy(evidence);
      return { robots: policy.robots, entry, review: policy.review };
    }
  }
}

/**
 * Paths a cookieless crawler may index — the ONLY paths eligible for the
 * sitemap. Programmatic patterns are excluded here; sitemap.ts admits
 * individual programmatic pages only through the quality gate.
 */
export function indexablePaths(): string[] {
  return ROUTE_SEO.filter(
    (entry) => entry.policy === "index" || entry.policy === "index_anonymous_only",
  ).map((entry) => entry.pattern);
}

/** Every mapped path that must NEVER appear in the sitemap as-is. */
export function nonIndexablePaths(): string[] {
  return ROUTE_SEO.filter(
    (entry) => entry.policy === "noindex" || entry.policy === "programmatic",
  ).map((entry) => entry.pattern);
}
