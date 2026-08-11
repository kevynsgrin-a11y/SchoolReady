/**
 * Phase 10 (compliance-officer) — privacy policy, disclaimers, and data
 * rights on the rendered alerts-and-privacy page, plus the finalized FTC
 * monetization copy:
 *  - the full plain-language policy renders (what is stored, the complete
 *    §1.7 never-collected list, retention with the ENFORCED upload TTL
 *    number, third parties, children, rights);
 *  - all four disclaimer categories render (prices/stock, tax, trends,
 *    recalls);
 *  - the export link and the one-pass delete form are wired to the real
 *    endpoints;
 *  - ordering stays §1.2-clean (scan) with the commercial section last;
 *  - the MONETIZATION block is no longer provisional and its strings carry
 *    the disclosure essentials in plain language.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EntitlementsData } from "../src/api/contracts";
import { CORE_ACCESS_NOTICE } from "../src/api/contracts";
import { renderDocument } from "../src/ui/components/chrome";
import { escapeHtml } from "../src/ui/html";
import { renderAccount } from "../src/ui/screens/account";
import { scanRenderedPage } from "../src/monetization/route-scan";
import { ACCOUNT, DISCLAIMERS, MONETIZATION, PRIVACY } from "../src/ui/copy/en";
import { UPLOAD_BUFFER_TTL_SECONDS } from "../src/parsing/upload-buffer";
import { envelope, record } from "./helpers/ui";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const PROV = record();
const provs = { [PROV.id]: PROV };

const entitlements: EntitlementsData = {
  seasonPass: null,
  gates: { adFreeExtras: false },
  coreAccessNotice: CORE_ACCESS_NOTICE,
};

const page = renderDocument(
  renderAccount(
    {
      kind: "ready",
      envelope: envelope(
        {
          alerts: envelope({ subscriptions: [] }, provs),
          entitlements: envelope(entitlements, provs),
        },
        provs,
      ),
    },
    { fixtureMode: true },
  ),
  { fixtureMode: true },
);

/** Copy renders through src/ui/html.ts escaping; compare escaped bytes. */
const rendered = (text: string): string => escapeHtml(text);

describe("privacy policy — renders complete and plain on /account", () => {
  it("renders the policy headings and the anonymous-cookie explanation", () => {
    for (const anchor of [
      PRIVACY.title,
      PRIVACY.collectTitle,
      PRIVACY.neverTitle,
      PRIVACY.retentionTitle,
      PRIVACY.thirdPartiesTitle,
      PRIVACY.childrenTitle,
      PRIVACY.rightsTitle,
    ]) {
      expect(page).toContain(rendered(anchor));
    }
  });

  it("lists every §1.7 never-collected category", () => {
    expect(PRIVACY.neverItems.length).toBeGreaterThanOrEqual(7);
    for (const item of PRIVACY.neverItems) expect(page).toContain(rendered(item));
    // The §1.7 enumerated categories are each covered by the list text.
    const all = PRIVACY.neverItems.join(" ");
    for (const category of ["name", "Classroom", "address", "size", "budget", "Gift"]) {
      expect(all).toContain(category);
    }
  });

  it("states the upload retention with the ENFORCED TTL constant, not a typed-in number", () => {
    const minutes = Math.round(UPLOAD_BUFFER_TTL_SECONDS / 60);
    expect(page).toContain(rendered(PRIVACY.retentionUpload(minutes)));
  });

  it("the children clause states the §0 NOT #5 posture", () => {
    expect(PRIVACY.childrenBody).toContain("no child accounts");
    expect(PRIVACY.childrenBody).toContain("no targeted advertising");
    expect(page).toContain(rendered(PRIVACY.childrenBody));
  });

  it("discloses optional GA4 without weakening the plan-data boundary", () => {
    expect(PRIVACY.thirdPartiesBody).toContain("Google Analytics");
    expect(PRIVACY.thirdPartiesBody).toContain("query strings are removed");
    expect(PRIVACY.thirdPartiesBody).toContain("saved-plan pages are excluded");
    expect(PRIVACY.thirdPartiesBody).toContain(
      "advertising signals and personalization are disabled",
    );
    expect(PRIVACY.thirdPartiesBody).toContain(
      "Nothing you enter in a plan is sold, shared, or sent to a third party",
    );
    expect(page).toContain(rendered(PRIVACY.thirdPartiesBody));
  });
});

describe("disclaimers — all four fact categories render", () => {
  it("prices/stock, tax, trends, and recalls disclaimers are on the page", () => {
    for (const text of [
      DISCLAIMERS.prices,
      DISCLAIMERS.tax,
      DISCLAIMERS.trends,
      DISCLAIMERS.recalls,
    ]) {
      expect(page).toContain(rendered(text));
    }
  });

  it("the recalls disclaimer points at the official CPSC notice", () => {
    expect(DISCLAIMERS.recalls).toContain("CPSC");
  });
});

describe("data rights — export and one-pass delete are wired on the page", () => {
  it("links the machine-readable export at GET /api/export", () => {
    expect(page).toContain('href="/api/export"');
    expect(page).toContain(rendered(ACCOUNT.exportJsonCta));
  });

  it("posts the one-pass delete form to /account/delete", () => {
    expect(page).toContain('action="/account/delete"');
    expect(page).toContain(rendered(ACCOUNT.deleteSubmit));
  });

  it("stays §1.2-clean: zero scan findings, commercial section still last", () => {
    expect(scanRenderedPage(page)).toEqual([]);
    const delAt = page.indexOf('action="/account/delete"');
    const upsellAt = page.indexOf('data-upsell="season-pass"');
    expect(delAt).toBeGreaterThan(-1);
    expect(upsellAt).toBeGreaterThan(delAt);
  });
});

describe("FTC monetization copy — finalized (Phase 10)", () => {
  it("the copy file no longer marks the MONETIZATION block provisional", () => {
    const source = readFileSync(join(repoRoot, "src", "ui", "copy", "en.ts"), "utf8");
    expect(source).not.toContain("PROVISIONAL");
    expect(source).toContain("16 CFR Part 255");
  });

  it("the disclosure names the material connection and the independence promise, plainly", () => {
    expect(MONETIZATION.affiliateDisclosure).toContain("Paid link");
    expect(MONETIZATION.affiliateDisclosure).toContain("commission");
    expect(MONETIZATION.affiliateDisclosure.toLowerCase()).toContain("never changes");
    expect(MONETIZATION.affiliateLinkSuffix).toBe("(paid link)");
  });

  it("the checkout-off notice keeps the sentence the workers sweep asserts", () => {
    expect(MONETIZATION.passCheckoutUnavailable).toContain(
      "Checkout is switched off in this validation beta",
    );
  });
});
