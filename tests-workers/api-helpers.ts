/**
 * Workers-runtime API harness: the REAL route handlers against real D1/KV/R2
 * bindings, with injected clock/ids, fixture verifiers, captured logs, a
 * cookie jar, and a ledger of every ok-envelope for the §1.4 response-shape
 * walker.
 */
import { env } from "cloudflare:test";
import { DEFAULT_FLAGS } from "../config/flags";
import { FIXTURE_LIBRARY } from "../src/index";
import { handleApiRequest } from "../src/api/routes";
import type { ApiDeps, FixtureLibrary } from "../src/api/deps";
import type { ApiLogEvent } from "../src/api/logging";
import { createAllowlistLogger } from "../src/api/logging";
import { createFixtureTurnstileVerifier } from "../src/api/turnstile";
import { createFixtureStripeVerifier } from "../src/api/stripe";
import type { KvLike } from "../src/ingestion/swr-cache";
import type { FixtureDocument } from "../src/ingestion/types";
import { R2UploadBuffer, createFixtureOcrEngine } from "../src/parsing";
import type { OcrFixtureRow, R2Like } from "../src/parsing";

export const T0 = Date.parse("2026-08-04T12:00:00.000Z");
/** Inside the fixture TX tax-holiday window (2026-08-07..09). */
export const T_HOLIDAY = Date.parse("2026-08-08T12:00:00.000Z");

export const EMPTY_OCR_DOC: FixtureDocument<OcrFixtureRow> = {
  _fixture: true,
  fixtureSet: "fixture:ocr-workers-empty-v1",
  description: "Synthetic empty OCR replay set (suites inject their own).",
  generatedAt: "2026-08-01T00:00:00.000Z",
  provenance: {
    source: "fixture:ocr-workers-empty-v1",
    sourceType: "fixture",
    observedAt: "2026-08-01T00:00:00.000Z",
    geography: "US",
    transformVersion: "none",
    confidence: 1,
    limitations: "Empty synthetic OCR set.",
  },
  records: [],
};

export function ocrDocFor(objectKey: string, text: string): FixtureDocument<OcrFixtureRow> {
  return {
    ...EMPTY_OCR_DOC,
    fixtureSet: "fixture:ocr-workers-replay-v1",
    provenance: { ...EMPTY_OCR_DOC.provenance, source: "fixture:ocr-workers-replay-v1" },
    records: [
      {
        objectKey,
        contentType: "image/png",
        pages: [{ pageNumber: 1, text, meanConfidence: 0.92 }],
        meanConfidence: 0.92,
      },
    ],
  };
}

export interface CallOptions {
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  /** Skip the jar's cookie for this call (simulates a fresh browser). */
  anonymous?: boolean;
}

export interface CallResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
}

export interface WorkerClient {
  deps: ApiDeps;
  logs: ApiLogEvent[];
  /** Every ok envelope returned through this client (walker input). */
  envelopes: unknown[];
  cookie: string | null;
  setNow(ms: number): void;
  call(method: string, path: string, options?: CallOptions): Promise<CallResult>;
}

export interface ClientOptions {
  fixtures?: FixtureLibrary;
  ocrDoc?: FixtureDocument<OcrFixtureRow>;
  idPrefix?: string;
  nowMs?: number;
}

export function makeClient(options: ClientOptions = {}): WorkerClient {
  let now = options.nowMs ?? T0;
  let counter = 0;
  const logs: ApiLogEvent[] = [];
  const envelopes: unknown[] = [];
  const clock = (): number => now;
  const deps: ApiDeps = {
    db: env.DB,
    kv: env.SOURCE_KV as unknown as KvLike,
    uploadBuffer: new R2UploadBuffer(env.UPLOAD_BUFFER as unknown as R2Like, clock),
    ocr: createFixtureOcrEngine(options.ocrDoc ?? EMPTY_OCR_DOC),
    clock,
    ids: () => `${options.idPrefix ?? "w"}${(counter += 1)}`,
    flags: DEFAULT_FLAGS,
    fixtures: options.fixtures ?? FIXTURE_LIBRARY,
    turnstile: createFixtureTurnstileVerifier(),
    stripeWebhooks: createFixtureStripeVerifier(),
    logger: createAllowlistLogger((event) => logs.push(event)),
  };

  const client: WorkerClient = {
    deps,
    logs,
    envelopes,
    cookie: null,
    setNow: (ms) => (now = ms),
    async call(method, path, callOptions = {}) {
      const headers = new Headers(callOptions.headers ?? {});
      if (client.cookie && !callOptions.anonymous && !headers.has("cookie")) {
        headers.set("cookie", client.cookie);
      }
      let bodyInit: string | undefined;
      if (callOptions.rawBody !== undefined) {
        bodyInit = callOptions.rawBody;
      } else if (callOptions.body !== undefined) {
        bodyInit = JSON.stringify(callOptions.body);
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
      }
      const response = await handleApiRequest(
        new Request(`http://fixture.test${path}`, { method, headers, body: bodyInit }),
        deps,
      );
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) client.cookie = setCookie.split(";")[0] ?? null;
      const body: unknown = await response.json();
      if ((body as { ok?: boolean }).ok === true) envelopes.push(body);
      return { status: response.status, body, headers: response.headers };
    },
  };
  return client;
}

/** Uploads bytes through the REAL upload endpoint (Turnstile fixture token). */
export async function uploadBytes(
  client: WorkerClient,
  bytes: Uint8Array,
  contentType = "image/png",
): Promise<CallResult> {
  const headers = new Headers({
    "content-type": contentType,
    "x-turnstile-token": "fixture-turnstile-pass",
  });
  if (client.cookie) headers.set("cookie", client.cookie);
  const response = await handleApiRequest(
    new Request("http://fixture.test/api/intake/upload", {
      method: "POST",
      headers,
      body: bytes,
    }),
    client.deps,
  );
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) client.cookie = setCookie.split(";")[0] ?? null;
  const body: unknown = await response.json();
  if ((body as { ok?: boolean }).ok === true) client.envelopes.push(body);
  return { status: response.status, body, headers: response.headers };
}

/** sha-256 hex of bytes — mirrors the route's content-addressed object key. */
export async function contentObjectKey(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `uploads/upl-${hex.slice(0, 24)}`;
}

interface ReviewDraftLike {
  productTypeSlug: string | null;
  quantity: number;
  unit: string;
  packCount: number | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
  rulingStyle: string | null;
  brandRequirement: string;
  requiredBrandSlug: string | null;
  optionality: string;
  prohibitedSubstitutions: readonly string[];
  sourceConfidence: number;
}
interface ReviewLike {
  items: { proposed: ReviewDraftLike | null; needsReview: boolean }[];
}

/** Confirm payload items built from a review payload's resolved drafts. */
export function confirmItemsFromReview(review: ReviewLike): unknown[] {
  return review.items
    .filter((item) => item.proposed !== null && !item.needsReview)
    .map(({ proposed }) => ({
      productTypeSlug: proposed!.productTypeSlug,
      quantity: proposed!.quantity,
      unit: proposed!.unit,
      packCount: proposed!.packCount,
      dimensions: proposed!.dimensions,
      material: proposed!.material,
      color: proposed!.color,
      rulingStyle: proposed!.rulingStyle,
      brandRequirement: proposed!.brandRequirement,
      requiredBrandSlug: proposed!.requiredBrandSlug,
      optionality: proposed!.optionality,
      prohibitedSubstitutions: proposed!.prohibitedSubstitutions,
      sourceConfidence: proposed!.sourceConfidence,
    }));
}

/** The household behind a client's session cookie (via the token hash). */
export async function householdIdOf(client: WorkerClient): Promise<string> {
  const token = client.cookie?.split("=")[1];
  if (!token) throw new Error("client has no session cookie");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const row = await env.DB.prepare(
    `SELECT household_id FROM api_sessions WHERE token_hash = ?`,
  )
    .bind(hash)
    .first<{ household_id: string }>();
  if (!row?.household_id) throw new Error("no household for session");
  return row.household_id;
}

/** Clears the shared SWR caches so a test's fixture overrides take effect. */
export async function clearSourceCaches(): Promise<void> {
  for (const sourceId of ["affiliate_feeds", "cpsc_recalls", "state_tax_holidays", "nces_ccd"]) {
    await env.SOURCE_KV.delete(`cache:${sourceId}`);
  }
}

/** Serializes every application D1 table row (zero-PII scans). */
export async function dumpAllTables(): Promise<string> {
  const { results: tables } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\'`,
  ).all<{ name: string }>();
  let dump = "";
  for (const { name } of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM "${name}"`).all();
    dump += JSON.stringify({ table: name, rows: results });
  }
  return dump;
}
