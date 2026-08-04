/**
 * Phase 5 API surface. `handleApiRequest` is the single entry the Worker
 * routes /api/* into; everything else is exported for the frontend contract
 * (contracts.ts) and for tests that exercise real handlers with fixture
 * dependencies.
 */
export * from "./contracts";
export * from "./errors";
export * from "./logging";
export * from "./provenance-gate";
export * from "./rate-limit";
export * from "./turnstile";
export * from "./stripe";
export * from "./deps";
export * from "./catalog";
export * from "./sources";
export * from "./plan";
export * from "./session";
export * from "./store";
export * from "./http";
export { ROUTES, handleApiRequest } from "./routes";
