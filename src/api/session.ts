/**
 * Anonymous-first session model (§0).
 *
 * A session is an OPAQUE random token in an HttpOnly cookie. D1 stores only
 * its SHA-256 hash plus the anonymous household link. There is no account,
 * no credential, no identity — and no endpoint anywhere requires one: the
 * session exists purely so a returning browser finds its own plan (§1.7:
 * nothing about the person is known or stored).
 */
import { isoFromMs } from "../ingestion/types";
import type { ApiDeps } from "./deps";
import { createHousehold, insertProvenance, userProvenance } from "./store";
import { SESSION_COOKIE } from "./contracts";

interface SubtleLike {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}

const subtle = (): SubtleLike =>
  (globalThis as unknown as { crypto: { subtle: SubtleLike } }).crypto.subtle;

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await subtle().digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** HttpOnly + SameSite=Lax + Path=/ — an opaque id, nothing more. */
export const buildSessionCookie = (token: string): string =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`;

export interface SessionContext {
  tokenHash: string;
  householdId: string;
  /** Non-null when a new session was created this request (Set-Cookie). */
  setCookieToken: string | null;
}

interface SessionRow {
  token_hash: string;
  household_id: string | null;
}

/** Reads an existing session; null when absent/unknown. Never creates. */
export async function readSession(
  request: Request,
  deps: ApiDeps,
): Promise<SessionContext | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await deps.db
    .prepare(`SELECT token_hash, household_id FROM api_sessions WHERE token_hash = ?`)
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row || row.household_id === null) return null;
  return { tokenHash, householdId: row.household_id, setCookieToken: null };
}

/** Reads or creates the anonymous session + household pair. */
export async function ensureSession(
  request: Request,
  deps: ApiDeps,
): Promise<SessionContext> {
  const existing = await readSession(request, deps);
  if (existing) {
    await deps.db
      .prepare(`UPDATE api_sessions SET last_seen_at = ? WHERE token_hash = ?`)
      .bind(isoFromMs(deps.clock()), existing.tokenHash)
      .run();
    return existing;
  }
  const token = `st_${deps.ids()}`;
  const tokenHash = await sha256Hex(token);
  const householdId = await createHousehold(deps.db, deps.ids, deps.clock, null);
  const provId = `prov:session:${tokenHash.slice(0, 16)}`;
  await insertProvenance(
    deps.db,
    userProvenance(
      "user:anonymous-session",
      provId,
      deps.clock,
      "Anonymous session token hash; opaque by construction (SS1.7). No account exists or is required.",
    ),
  );
  const at = isoFromMs(deps.clock());
  await deps.db
    .prepare(
      `INSERT INTO api_sessions (token_hash, household_id, provenance_id, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(tokenHash, householdId, provId, at, at)
    .run();
  return { tokenHash, householdId, setCookieToken: token };
}
