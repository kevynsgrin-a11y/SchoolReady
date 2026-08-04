/**
 * UI server: server-rendered HTML over the Phase 5 API contract.
 *
 * Every screen's data comes from IN-PROCESS calls to handleApiRequest —
 * the same router, provenance gate (§1.4 API half), suppression handling
 * (§1.5), rate limiting, and session model the public API ships. The UI
 * never imports an algorithm module directly (handoff 06 §8 MUST NOT), so
 * no code path can bypass suppression. Mutations are plain HTML forms
 * (POST -> redirect/render); client JS only enhances (public/assets/app.js).
 */
import type { ApiDeps } from "../api/deps";
import { handleApiRequest } from "../api/routes";
import type {
  AlertKind,
  ApiOk,
  ApiResponseBody,
  BasketData,
  CapsuleBody,
  CapsuleData,
  ChecklistData,
  ConfirmListBody,
  ConfirmedRequirementInput,
  EntitlementsData,
  IntakeData,
  InventoryData,
  ManualIntakeItemBody,
  MergeData,
  RecallCheckData,
  RecallsData,
  AlertsData,
  SessionData,
  TrendData,
} from "../api/contracts";
import { SESSION_COOKIE, TURNSTILE_HEADER } from "../api/contracts";
import { FIXTURE_TURNSTILE_PASS_TOKEN } from "../api/turnstile";
import type { RulingStyle, Unit } from "../contracts/product";
import type { GradeLevel, StateCode } from "../contracts/school";
import type { BrandRequirement, IntakeMethod, Optionality } from "../contracts/requirement";
import type { ItemCondition } from "../contracts/household";
import type { GarmentCategory, ClimateBand } from "../algorithms/capsule";
import { isoFromMs } from "../ingestion/types";
import { renderDocument } from "./components/chrome";
import type { Screen } from "./components/chrome";
import { buildStylesheet } from "./styles";
import { webManifest } from "./pwa";
import { failureState, stateFromResponse } from "./state";
import type { ScreenState } from "./state";
import { renderHome } from "./screens/home";
import { renderIntake } from "./screens/intake";
import type { IntakeScreenState, IntakeTab } from "./screens/intake";
import { renderHousehold } from "./screens/household";
import type { HouseholdData } from "./screens/household";
import { renderPlan } from "./screens/plan";
import { renderChecklist } from "./screens/checklist";
import { renderBasket, BASKET_VIEWS } from "./screens/basket";
import type { BasketViewKey } from "./screens/basket";
import { renderCapsule } from "./screens/capsule";
import { renderTrends } from "./screens/trends";
import { renderItem } from "./screens/item";
import type { ItemDetailData } from "./screens/item";
import { renderSafety } from "./screens/safety";
import type { SafetyData } from "./screens/safety";
import { renderBudget } from "./screens/budget";
import type { BudgetData } from "./screens/budget";
import { renderDeals } from "./screens/deals";
import type { DealsData } from "./screens/deals";
import { renderMethodology } from "./screens/methodology";
import { renderAccount } from "./screens/account";
import type { AccountData } from "./screens/account";
import { renderStatus } from "./screens/status";
import { html } from "./html";
import { ERRORS, COMMON } from "./copy/en";
// [SEO — Phase 8] The single SEO integration surface (src/seo/integration.ts):
// per-request robots/canonical/JSON-LD resolution + generated crawl assets.
import { resolveSeoForRequest, seoAssetResponse } from "../seo/integration";
import type { ResolvedSeo } from "../seo/integration";

/* ------------------------------------------------------------------ */
/* In-process API client                                               */
/* ------------------------------------------------------------------ */

interface ApiSession {
  deps: ApiDeps;
  /** Cookie header value forwarded to every in-process call. */
  cookie: string | null;
  /** Set-Cookie headers to replay onto the final HTML response. */
  setCookies: string[];
  /** [SEO — Phase 8] Robots/canonical/JSON-LD resolved once per request. */
  seo: ResolvedSeo;
}

function createApiSession(request: Request, deps: ApiDeps): ApiSession {
  return {
    deps,
    cookie: request.headers.get("cookie"),
    setCookies: [],
    seo: resolveSeoForRequest(request), // [SEO — Phase 8]
  };
}

async function callApi<T>(
  session: ApiSession,
  method: "GET" | "POST" | "DELETE",
  path: string,
  init?: { json?: unknown; rawBody?: BodyInit; headers?: Record<string, string> },
): Promise<{ status: number; body: ApiResponseBody<T> }> {
  const headers = new Headers(init?.headers ?? {});
  if (session.cookie) headers.set("cookie", session.cookie);
  let body: BodyInit | undefined = init?.rawBody;
  if (init?.json !== undefined) {
    body = JSON.stringify(init.json);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const response = await handleApiRequest(
    new Request(`https://ui.internal${path}`, { method, headers, body }),
    session.deps,
  );
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    session.setCookies.push(setCookie);
    const pair = setCookie.split(";")[0];
    if (pair) session.cookie = pair;
  }
  return { status: response.status, body: (await response.json()) as ApiResponseBody<T> };
}

/* ------------------------------------------------------------------ */
/* Response helpers                                                    */
/* ------------------------------------------------------------------ */

function htmlResponse(screen: Screen, session: ApiSession, status = 200): Response {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  // [SEO — Phase 8] X-Robots-Tag mirrors the meta robots tag; the head
  // itself (robots/canonical/JSON-LD) rides in through renderDocument.
  headers.set("x-robots-tag", session.seo.robots);
  for (const cookie of session.setCookies) headers.append("set-cookie", cookie);
  return new Response(
    renderDocument(screen, { fixtureMode: session.deps.flags.fixtureMode, seo: session.seo }),
    { status, headers },
  );
}

function redirect(session: ApiSession, location: string): Response {
  const headers = new Headers({ location });
  for (const cookie of session.setCookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/** Merges companion envelopes into one composite ready envelope. */
function composite<T>(data: T, parts: readonly ApiOk<unknown>[]): ApiOk<T> {
  const provenance = Object.assign({}, ...parts.map((p) => p.provenance)) as ApiOk<T>["provenance"];
  const sources = parts.flatMap((p) => p.meta.sources);
  const last = parts[parts.length - 1];
  return {
    ok: true,
    data,
    provenance,
    suppressions: parts.flatMap((p) => p.suppressions),
    assumptions: parts.flatMap((p) => p.assumptions),
    meta: last ? { ...last.meta, sources } : { generatedAt: "", fixtureMode: true, sources },
  };
}

const notFoundScreen = (): Screen => ({
  title: COMMON.navHome,
  description: ERRORS.notFound,
  activeNav: null,
  container: "flow",
  sections: [{ kind: "content", body: html`<h1>${ERRORS.notFound}</h1>` }],
});

/* ------------------------------------------------------------------ */
/* Form parsing helpers (controlled vocabularies only)                 */
/* ------------------------------------------------------------------ */

const str = (form: FormData, name: string): string => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const orNull = (v: string): string | null => (v.length === 0 ? null : v);
const int = (form: FormData, name: string): number => Number.parseInt(str(form, name), 10);

function manualItemFromForm(form: FormData, prefix = ""): ManualIntakeItemBody {
  const p = (name: string): string => str(form, `${prefix}${name}`);
  const quantity = Number.parseInt(p("quantity"), 10);
  return {
    productTypeSlug: p("productTypeSlug") || p("product"),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: (orNull(p("unit")) ?? undefined) as Unit | undefined,
    color: orNull(p("color")),
    rulingStyle: orNull(p("ruling") || p("rulingStyle")) as RulingStyle | null,
    optionality: (orNull(p("optionality")) ?? undefined) as Optionality | undefined,
  };
}

function confirmBodyFromForm(form: FormData): ConfirmListBody {
  const itemCount = Math.min(200, Math.max(0, int(form, "itemCount") || 0));
  const items: ConfirmedRequirementInput[] = [];
  for (let i = 0; i < itemCount; i += 1) {
    if (str(form, `item-${i}-include`) !== "on") continue;
    const p = (name: string): string => str(form, `item-${i}-${name}`);
    const packCount = Number.parseInt(p("packCount"), 10);
    const confidence = Number.parseFloat(p("confidence"));
    items.push({
      productTypeSlug: p("product"),
      quantity: Number.parseInt(p("quantity"), 10),
      unit: (orNull(p("unit")) ?? undefined) as Unit | undefined,
      packCount: Number.isFinite(packCount) ? packCount : null,
      dimensions: orNull(p("dimensions")),
      material: null,
      color: orNull(p("color")),
      rulingStyle: orNull(p("ruling")) as RulingStyle | null,
      brandRequirement: (orNull(p("brandRequirement")) ?? undefined) as BrandRequirement | undefined,
      requiredBrandSlug: orNull(p("brand")),
      optionality: (orNull(p("optionality")) ?? undefined) as Optionality | undefined,
      sourceConfidence: Number.isFinite(confidence) ? confidence : 1,
    });
  }
  return {
    intakeId: str(form, "intakeId"),
    intakeMethod: str(form, "intakeMethod") as IntakeMethod,
    schoolYear: str(form, "schoolYear"),
    gradeLevel: orNull(str(form, "gradeLevel")) as GradeLevel | null,
    memberOrdinal: int(form, "memberOrdinal"),
    state: orNull(str(form, "state").toUpperCase()) as StateCode | null,
    items,
  };
}

/** School-year default derived from the injected clock, never typed in. */
export function defaultSchoolYear(nowMs: number): string {
  const iso = isoFromMs(nowMs);
  const year = Number.parseInt(iso.slice(0, 4), 10);
  const month = Number.parseInt(iso.slice(5, 7), 10);
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/* ------------------------------------------------------------------ */
/* Screen loaders                                                      */
/* ------------------------------------------------------------------ */

async function reviewState(
  session: ApiSession,
  response: { status: number; body: ApiResponseBody<IntakeData> },
  intakeMethod: IntakeMethod,
): Promise<IntakeScreenState> {
  const state = stateFromResponse(response.body);
  if (state.kind !== "ready") return state;
  const sessionData = await callApi<SessionData>(session, "GET", "/api/session");
  return {
    kind: "review",
    envelope: state.envelope,
    intakeMethod,
    session: sessionData.body.ok ? sessionData.body.data : null,
    defaultSchoolYear: defaultSchoolYear(session.deps.clock()),
  };
}

async function loadHousehold(session: ApiSession): Promise<ScreenState<HouseholdData>> {
  const sess = await callApi<SessionData>(session, "GET", "/api/session");
  if (!sess.body.ok) return stateFromResponse(sess.body);
  const inv = await callApi<InventoryData>(session, "GET", "/api/inventory");
  if (!inv.body.ok) return stateFromResponse(inv.body);
  return {
    kind: "ready",
    envelope: composite<HouseholdData>(
      { session: sess.body.data, inventory: inv.body.data },
      [sess.body, inv.body],
    ),
  };
}

async function loadTrends(session: ApiSession): Promise<ScreenState<{ cards: TrendData[] }>> {
  const checklist = await callApi<ChecklistData>(session, "GET", "/api/plan/checklist");
  if (!checklist.body.ok) return stateFromResponse(checklist.body);
  const slugs = [...new Set(checklist.body.data.lines.map((l) => l.productTypeSlug))].slice(0, 12);
  const cards: TrendData[] = [];
  const parts: ApiOk<unknown>[] = [checklist.body];
  for (const slug of slugs) {
    const trend = await callApi<TrendData>(session, "GET", `/api/trend/${slug}`);
    if (trend.body.ok) {
      cards.push(trend.body.data);
      parts.push(trend.body);
    }
  }
  return { kind: "ready", envelope: composite({ cards }, parts) };
}

async function loadItem(session: ApiSession, slug: string): Promise<ScreenState<ItemDetailData>> {
  const trend = await callApi<TrendData>(session, "GET", `/api/trend/${slug}`);
  const data: ItemDetailData = {
    productSlug: slug,
    trend: trend.body.ok ? trend.body : null,
    // The beta catalog carries no UPC per product type; the safety page
    // checks explicit UPCs. Never guess a UPC to force a match (§1.5).
    recallCheck: null,
  };
  const parts = trend.body.ok ? [trend.body] : [];
  if (!trend.body.ok && trend.body.error.code !== "not_found") {
    return stateFromResponse(trend.body);
  }
  return { kind: "ready", envelope: composite(data, parts) };
}

async function loadSafety(session: ApiSession, upc: string | null): Promise<ScreenState<SafetyData>> {
  const recalls = await callApi<RecallsData>(session, "GET", "/api/recalls");
  if (!recalls.body.ok) return stateFromResponse(recalls.body);
  let check: ApiOk<RecallCheckData> | null = null;
  const parts: ApiOk<unknown>[] = [recalls.body];
  if (upc !== null && upc.length > 0) {
    const checked = await callApi<RecallCheckData>(session, "POST", "/api/recalls/check", {
      json: { upc },
    });
    if (!checked.body.ok) return stateFromResponse(checked.body);
    check = checked.body;
    parts.push(checked.body);
  }
  return { kind: "ready", envelope: composite<SafetyData>({ recalls: recalls.body, check }, parts) };
}

async function loadBudget(session: ApiSession): Promise<ScreenState<BudgetData>> {
  const checklist = await callApi<ChecklistData>(session, "GET", "/api/plan/checklist");
  if (!checklist.body.ok) return stateFromResponse(checklist.body);
  let basket: ApiOk<BasketData> | null = null;
  const parts: ApiOk<unknown>[] = [checklist.body];
  if (checklist.body.data.lines.length > 0) {
    const b = await callApi<BasketData>(session, "POST", "/api/plan/basket", { json: {} });
    if (b.body.ok) {
      basket = b.body;
      parts.push(b.body);
    }
  }
  return {
    kind: "ready",
    envelope: composite<BudgetData>({ checklist: checklist.body, basket }, parts),
  };
}

async function loadDeals(session: ApiSession, hasCookie: boolean): Promise<ScreenState<DealsData>> {
  if (!hasCookie) {
    return { kind: "ready", envelope: composite<DealsData>({ session: null, basket: null }, []) };
  }
  const sess = await callApi<SessionData>(session, "GET", "/api/session");
  if (!sess.body.ok) return stateFromResponse(sess.body);
  let basket: ApiOk<BasketData> | null = null;
  const parts: ApiOk<unknown>[] = [sess.body];
  if (sess.body.data.householdState !== null) {
    const b = await callApi<BasketData>(session, "POST", "/api/plan/basket", { json: {} });
    if (b.body.ok) {
      basket = b.body;
      parts.push(b.body);
    }
  }
  return {
    kind: "ready",
    envelope: composite<DealsData>({ session: sess.body.data, basket }, parts),
  };
}

async function loadAccount(session: ApiSession): Promise<ScreenState<AccountData>> {
  const alerts = await callApi<AlertsData>(session, "GET", "/api/alerts");
  if (!alerts.body.ok) return stateFromResponse(alerts.body);
  const entitlements = await callApi<EntitlementsData>(session, "GET", "/api/entitlements");
  if (!entitlements.body.ok) return stateFromResponse(entitlements.body);
  return {
    kind: "ready",
    envelope: composite<AccountData>(
      { alerts: alerts.body, entitlements: entitlements.body },
      [alerts.body, entitlements.body],
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

/** Handles UI routes; returns null only for paths this layer does not own. */
export async function handleUiRequest(request: Request, deps: ApiDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const session = createApiSession(request, deps);

  if (request.method === "GET") {
    if (path === "/assets/ui.css") {
      return new Response(buildStylesheet(), {
        headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }
    if (path === "/manifest.webmanifest") {
      return new Response(webManifest(), {
        headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
      });
    }
    // [SEO — Phase 8] Generated crawl assets: /sitemap.xml (indexable routes
    // only) and /robots.txt. All content comes from src/seo/sitemap.ts.
    const crawlAsset = seoAssetResponse(url);
    if (crawlAsset) return crawlAsset;

    switch (path) {
      case "/":
        return htmlResponse(renderHome(), session);
      case "/intake": {
        const tabParam = url.searchParams.get("tab");
        const tab: IntakeTab = tabParam === "manual" || tabParam === "upload" ? tabParam : "paste";
        return htmlResponse(renderIntake({ kind: "form", tab }), session);
      }
      case "/household":
        return htmlResponse(renderHousehold(await loadHousehold(session)), session);
      case "/plan": {
        const merge = await callApi<MergeData>(session, "GET", "/api/plan/merge");
        return htmlResponse(renderPlan(stateFromResponse(merge.body)), session);
      }
      case "/plan/checklist": {
        const checklist = await callApi<ChecklistData>(session, "GET", "/api/plan/checklist");
        return htmlResponse(
          renderChecklist(stateFromResponse(checklist.body), {
            storeMode: url.searchParams.get("mode") === "store",
          }),
          session,
        );
      }
      case "/plan/basket": {
        const viewParam = url.searchParams.get("view");
        const view: BasketViewKey | null = BASKET_VIEWS.some((v) => v.key === viewParam)
          ? (viewParam as BasketViewKey)
          : null;
        const daysParam = Number.parseInt(url.searchParams.get("days") ?? "", 10);
        const daysUntilNeeded = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : null;
        const stateParam = url.searchParams.get("state");
        const basket = await callApi<BasketData>(session, "POST", "/api/plan/basket", {
          json: {
            daysUntilNeeded,
            state: stateParam && /^[A-Z]{2}$/.test(stateParam) ? stateParam : null,
          },
        });
        return htmlResponse(
          renderBasket(stateFromResponse(basket.body), { view, daysUntilNeeded }),
          session,
        );
      }
      case "/capsule":
        return htmlResponse(renderCapsule({ kind: "form" }), session);
      case "/trends":
        return htmlResponse(renderTrends(await loadTrends(session)), session);
      case "/safety":
        return htmlResponse(
          renderSafety(await loadSafety(session, url.searchParams.get("upc"))),
          session,
        );
      case "/budget":
        return htmlResponse(renderBudget(await loadBudget(session)), session);
      case "/deals": {
        const hasCookie = (request.headers.get("cookie") ?? "").includes(`${SESSION_COOKIE}=`);
        return htmlResponse(renderDeals(await loadDeals(session, hasCookie)), session);
      }
      case "/methodology":
        return htmlResponse(renderMethodology(), session);
      case "/account":
        // [Monetization — Phase 9] fixtureMode drives the Season Pass
        // checkout entry point's honest availability copy.
        return htmlResponse(
          renderAccount(await loadAccount(session), { fixtureMode: deps.flags.fixtureMode }),
          session,
        );
      case "/admin/status": {
        const recalls = await callApi<RecallsData>(session, "GET", "/api/recalls");
        if (!recalls.body.ok) {
          return htmlResponse(renderStatus(stateFromResponse(recalls.body)), session);
        }
        return htmlResponse(
          renderStatus({
            kind: "ready",
            envelope: { ...recalls.body, data: { sources: recalls.body.meta.sources } },
          }),
          session,
        );
      }
      default: {
        const itemMatch = /^\/item\/([a-z0-9-]+)$/.exec(path);
        if (itemMatch) {
          const slug = itemMatch[1]!;
          return htmlResponse(renderItem(await loadItem(session, slug), slug), session);
        }
        return htmlResponse(notFoundScreen(), session, 404);
      }
    }
  }

  if (request.method === "POST") {
    switch (path) {
      case "/intake/paste": {
        const form = await request.formData();
        const response = await callApi<IntakeData>(session, "POST", "/api/intake/paste", {
          json: { text: str(form, "text") },
        });
        return htmlResponse(renderIntake(await reviewState(session, response, "paste")), session);
      }
      case "/intake/manual": {
        const form = await request.formData();
        const response = await callApi<IntakeData>(session, "POST", "/api/intake/manual", {
          json: { items: [manualItemFromForm(form)] },
        });
        return htmlResponse(renderIntake(await reviewState(session, response, "manual")), session);
      }
      case "/intake/upload": {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return htmlResponse(renderIntake({ kind: "error", code: "invalid_request" }), session);
        }
        const headers: Record<string, string> = { "content-type": file.type };
        if (deps.flags.fixtureMode) headers[TURNSTILE_HEADER] = FIXTURE_TURNSTILE_PASS_TOKEN;
        const response = await callApi<IntakeData>(session, "POST", "/api/intake/upload", {
          rawBody: await file.arrayBuffer(),
          headers,
        });
        return htmlResponse(renderIntake(await reviewState(session, response, "upload")), session);
      }
      case "/intake/confirm": {
        const form = await request.formData();
        const response = await callApi<unknown>(session, "POST", "/api/lists/confirm", {
          json: confirmBodyFromForm(form),
        });
        if (response.body.ok) return redirect(session, "/plan");
        const state = stateFromResponse(response.body);
        return htmlResponse(
          renderIntake(
            state.kind === "rate_limited"
              ? { kind: "rate_limited", retryAfterSeconds: state.retryAfterSeconds }
              : { kind: "error", code: state.kind === "error" ? state.code : "internal_error" },
          ),
          session,
        );
      }
      case "/household/inventory": {
        const form = await request.formData();
        const quantity = int(form, "quantity");
        const response = await callApi<InventoryData>(session, "POST", "/api/inventory", {
          json: {
            items: [
              {
                productTypeSlug: str(form, "productTypeSlug"),
                quantity: Number.isFinite(quantity) ? quantity : 0,
                condition: str(form, "condition") as ItemCondition,
              },
            ],
          },
        });
        if (response.body.ok) return redirect(session, "/household");
        return htmlResponse(renderHousehold(failureState(response.body)), session);
      }
      case "/capsule": {
        const form = await request.formData();
        const uniform = str(form, "uniformRequired") === "on";
        // [P12-1/P12-2 correction] Optional price/timing fields. A dollars
        // price becomes whole cents; each block is sent only when its inputs
        // are complete (the form hint says which inputs produce which
        // outputs). Nothing here persists (§1.7) — the capsule endpoint is
        // stateless.
        const priceDollars = Number.parseFloat(str(form, "priceDollars"));
        const priceCents =
          Number.isFinite(priceDollars) && priceDollars > 0
            ? Math.round(priceDollars * 100)
            : null;
        const seasonWearDays = int(form, "seasonWearDays");
        const daysUntilNeeded = int(form, "daysUntilNeeded");
        const typicalDeliveryDays = int(form, "typicalDeliveryDays");
        const upcRaw = str(form, "upc");
        const body: CapsuleBody = {
          categories: [
            {
              category: str(form, "category") as GarmentCategory,
              climateBand: str(form, "climateBand") as ClimateBand,
              daysBetweenWashes: int(form, "daysBetweenWashes"),
              reserveDays: int(form, "reserveDays"),
              usableExisting: int(form, "usableExisting"),
              dressCode: uniform
                ? { solidColorsOnly: false, uniformRequired: true, allowedColors: null }
                : null,
            },
          ],
          costPerWear:
            priceCents !== null && Number.isFinite(seasonWearDays) && seasonWearDays > 0
              ? { priceCents, seasonWearDays }
              : null,
          timing:
            priceCents !== null &&
            Number.isFinite(daysUntilNeeded) &&
            daysUntilNeeded > 0 &&
            Number.isFinite(typicalDeliveryDays) &&
            typicalDeliveryDays > 0
              ? {
                  daysUntilNeeded,
                  typicalDeliveryDays,
                  currentPriceCents: priceCents,
                  upc: /^[A-Za-z0-9-]{4,32}$/.test(upcRaw) ? upcRaw : null,
                }
              : null,
        };
        const response = await callApi<CapsuleData>(session, "POST", "/api/capsule", { json: body });
        return htmlResponse(renderCapsule(stateFromResponse(response.body)), session);
      }
      case "/account/delete": {
        // [Compliance — Phase 10] One-pass purge: DELETE /api/session removes
        // every session-linked row (§1.7); the expired cookie detaches the
        // browser. A fresh anonymous session starts only if the user returns.
        const response = await callApi<unknown>(session, "DELETE", "/api/session");
        if (response.body.ok) {
          session.setCookies.push(
            `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
          );
          session.cookie = null;
          return redirect(session, "/account");
        }
        return htmlResponse(
          renderAccount(failureState(response.body), { fixtureMode: deps.flags.fixtureMode }),
          session,
        );
      }
      case "/account/alerts": {
        const form = await request.formData();
        const headers: Record<string, string> = {};
        if (deps.flags.fixtureMode) headers[TURNSTILE_HEADER] = FIXTURE_TURNSTILE_PASS_TOKEN;
        const response = await callApi<unknown>(session, "POST", "/api/alerts/subscribe", {
          json: { alertKind: str(form, "alertKind") as AlertKind },
          headers,
        });
        if (response.body.ok) return redirect(session, "/account");
        return htmlResponse(
          renderAccount(failureState(response.body), { fixtureMode: deps.flags.fixtureMode }),
          session,
        );
      }
      default:
        return htmlResponse(notFoundScreen(), session, 404);
    }
  }

  return null;
}
