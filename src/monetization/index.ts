/**
 * src/monetization — Phase 9 (monetization-engineer).
 *
 * Affiliate link decoration, adjacent-disclosure rendering, editorial-only
 * ad-slot rules, Season Pass surface logic, dark-pattern markers, and the
 * §1.2 route-tree scanner. Structurally isolated from ranking: nothing under
 * src/algorithms/ or src/api/ can import this package, and this package
 * imports neither — both directions proven by
 * tests/algorithms-independence.test.ts.
 */
export * from "./networks";
export * from "./links";
export * from "./disclosure";
export * from "./ad-rules";
export * from "./season-pass";
export * from "./dark-patterns";
export * from "./route-scan";
