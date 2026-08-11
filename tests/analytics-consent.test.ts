import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANALYTICS_CONFIG } from "../config/analytics";
import {
  isAnalyticsEligible,
  renderDocument,
  type SeoHead,
} from "../src/ui/components/chrome";
import { renderHome } from "../src/ui/screens/home";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const controllerSource = readFileSync(
  join(repoRoot, "public", "assets", "analytics.js"),
  "utf8",
);

const seo = (robots: string): SeoHead => ({
  robots,
  canonicalUrl: robots === "index,follow" ? "https://backtoacademy.com/" : null,
  jsonLd: [],
});
interface FakeButton {
  hidden: boolean;
  disabled: boolean;
  click(): void;
  addEventListener(name: string, handler: () => void): void;
}

function fakeButton(): FakeButton {
  let clickHandler: (() => void) | null = null;
  return {
    hidden: true,
    disabled: false,
    click() {
      clickHandler?.();
    },
    addEventListener(name, handler) {
      if (name === "click") clickHandler = handler;
    },
  };
}

interface HarnessOptions {
  storedPreference?: "granted" | "denied";
  measurementId?: string | null;
  privacySignal?: boolean;
  cookies?: string;
}

function runController(options: HarnessOptions = {}) {
  const allow = fakeButton();
  const decline = fakeButton();
  const open = fakeButton();
  const status = { textContent: "" };
  const privacySignal = { hidden: true };
  const storage = new Map<string, string>();
  if (options.storedPreference) {
    storage.set(ANALYTICS_CONFIG.preferenceStorageKey, options.storedPreference);
  }
  const attributes = new Map<string, string>([
    ["data-storage-key", ANALYTICS_CONFIG.preferenceStorageKey],
    ["data-cookie-prefix", ANALYTICS_CONFIG.cookiePrefix],
    ["data-cookie-name-prefix", ANALYTICS_CONFIG.cookieNamePrefix],
    [
      "data-cookie-lifetime-seconds",
      String(ANALYTICS_CONFIG.cookieLifetimeSeconds),
    ],
    ["data-status-pending", "pending"],
    ["data-status-granted", "granted"],
    ["data-status-denied", "denied"],
  ]);
  if (options.measurementId !== null) {
    attributes.set(
      "data-measurement-id",
      options.measurementId ?? ANALYTICS_CONFIG.measurementId,
    );
  }

  const panel = {
    hidden: true,
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    querySelector(selector: string) {
      if (selector === "[data-analytics-allow]") return allow;
      if (selector === "[data-analytics-decline]") return decline;
      if (selector === "[data-analytics-status]") return status;
      if (selector === "[data-analytics-privacy-signal]") return privacySignal;
      return null;
    },
  };

  const appendedScripts: Array<Record<string, unknown>> = [];
  const cookieWrites: string[] = [];
  const documentObject: Record<string, unknown> = {
    referrer: "https://search.example/results?q=school#private",
    querySelector(selector: string) {
      return selector === "[data-analytics-consent]" ? panel : null;
    },
    querySelectorAll(selector: string) {
      return selector === "[data-analytics-open]" ? [open] : [];
    },
    createElement(name: string) {
      if (name !== "script") throw new Error(`Unexpected element: ${name}`);
      return {
        id: "",
        async: false,
        referrerPolicy: "",
        src: "",
      };
    },
    getElementById(id: string) {
      return appendedScripts.find((script) => script.id === id) ?? null;
    },
    head: {
      appendChild(script: Record<string, unknown>) {
        appendedScripts.push(script);
        return script;
      },
    },
  };
  Object.defineProperty(documentObject, "cookie", {
    get: () => options.cookies ?? "",
    set: (value: string) => cookieWrites.push(value),
  });

  const dataLayer: unknown[] = [];
  const windowObject: Record<string, unknown> = {
    dataLayer,
    doNotTrack: "0",
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
    location: {
      href: "https://backtoacademy.com/methodology?private=1#section",
      origin: "https://backtoacademy.com",
      hostname: "backtoacademy.com",
    },
  };

  runInNewContext(controllerSource, {
    document: documentObject,
    window: windowObject,
    navigator: {
      globalPrivacyControl: options.privacySignal ?? false,
      doNotTrack: "0",
    },
    URL,
    Date,
    Number,
    Array,
    encodeURIComponent,
  });

  return {
    allow,
    decline,
    open,
    panel,
    status,
    privacySignal,
    storage,
    dataLayer,
    appendedScripts,
    cookieWrites,
    commands: () =>
      dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>)),
  };
}

describe("GA4 public-page render gate", () => {
  it("renders one local controller and one public measurement ID on an indexable page", () => {
    const page = renderDocument(renderHome(), {
      fixtureMode: true,
      seo: seo("index,follow"),
    });
    expect(isAnalyticsEligible(seo("index,follow"))).toBe(true);
    expect(page.match(/src="\/assets\/analytics\.js"/g)).toHaveLength(1);
    expect(page.match(/data-measurement-id=/g)).toHaveLength(1);
    expect(page).toContain(
      `data-measurement-id="${ANALYTICS_CONFIG.measurementId}"`,
    );
    expect(page).not.toContain("https://www.googletagmanager.com");
  });

  it("omits the measurement ID from noindex and default-safe renders", () => {
    const explicitNoindex = renderDocument(renderHome(), {
      fixtureMode: true,
      seo: seo("noindex"),
    });
    const defaultSafe = renderDocument(renderHome(), { fixtureMode: true });
    expect(isAnalyticsEligible(seo("noindex"))).toBe(false);
    expect(explicitNoindex).toContain('src="/assets/analytics.js"');
    expect(explicitNoindex).not.toContain("data-measurement-id=");
    expect(defaultSafe).not.toContain("data-measurement-id=");
  });
});

describe("GA4 explicit-consent controller", () => {
  it("makes no provider request before a choice and defaults every consent field to denied", () => {
    const harness = runController();
    expect(harness.appendedScripts).toHaveLength(0);
    expect(harness.panel.hidden).toBe(false);
    expect(harness.open.hidden).toBe(false);
    expect(harness.commands()[0]).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
  });

  it("loads exactly one tag after opt-in with sanitized URLs and advertising disabled", () => {
    const harness = runController();
    harness.allow.click();
    harness.allow.click();

    expect(
      harness.storage.get(ANALYTICS_CONFIG.preferenceStorageKey),
    ).toBe("granted");
    expect(harness.appendedScripts).toHaveLength(1);
    expect(harness.appendedScripts[0]?.src).toBe(
      `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_CONFIG.measurementId}`,
    );

    const config = harness
      .commands()
      .find((command) => command[0] === "config");
    expect(config?.[1]).toBe(ANALYTICS_CONFIG.measurementId);
    expect(config?.[2]).toMatchObject({
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_prefix: ANALYTICS_CONFIG.cookiePrefix,
      cookie_expires: ANALYTICS_CONFIG.cookieLifetimeSeconds,
      cookie_update: false,
      page_location: "https://backtoacademy.com/methodology",
      page_referrer: "https://search.example/results",
      send_page_view: true,
    });
  });

  it("does not load on ineligible pages even after the visitor opts in", () => {
    const harness = runController({ measurementId: null });
    harness.allow.click();
    expect(
      harness.storage.get(ANALYTICS_CONFIG.preferenceStorageKey),
    ).toBe("granted");
    expect(harness.appendedScripts).toHaveLength(0);
  });

  it("honors a browser privacy signal over a previously stored grant", () => {
    const harness = runController({
      storedPreference: "granted",
      privacySignal: true,
    });
    expect(harness.appendedScripts).toHaveLength(0);
    expect(harness.allow.disabled).toBe(true);
    expect(harness.privacySignal.hidden).toBe(false);
    expect(harness.status.textContent).toBe("denied");
  });

  it("revokes consent and expires only the dedicated analytics cookies", () => {
    const harness = runController({
      storedPreference: "granted",
      cookies: "k8p_ga=one; k8p_ga_STREAM=two; unrelated=three",
    });
    expect(harness.appendedScripts).toHaveLength(1);

    harness.open.click();
    harness.decline.click();

    expect(
      harness.storage.get(ANALYTICS_CONFIG.preferenceStorageKey),
    ).toBe("denied");
    expect(harness.cookieWrites).toHaveLength(4);
    expect(harness.cookieWrites.every((value) => value.startsWith("k8p_ga"))).toBe(
      true,
    );
    expect(harness.cookieWrites.join(" ")).not.toContain("unrelated");
    const lastConsent = harness
      .commands()
      .filter((command) => command[0] === "consent")
      .at(-1);
    expect(lastConsent?.[1]).toBe("update");
    expect(lastConsent?.[2]).toMatchObject({ analytics_storage: "denied" });
  });
});
