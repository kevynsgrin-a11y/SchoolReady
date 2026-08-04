/**
 * §1.4 render guard — the UI half of invariant 4. A fact without complete,
 * resolvable, current provenance DOES NOT RENDER; the suppression reason
 * renders in its place, and the fact renderer is never invoked. Together
 * with the Phase 5 API gate (tests/api-*, tests-workers/api-*), this
 * completes invariant 4's enforcement.
 */
import { describe, expect, it, vi } from "vitest";
import { guardFact, provenanceLine, renderFact, suppressionNotice } from "../src/ui/render-guard";
import { escapeHtml } from "../src/ui/html";
import { SUPPRESSION } from "../src/ui/copy/en";
import { record } from "./helpers/ui";

const FACT_TEXT = "landed cost $12.34";

function attempt(provenanceIds: readonly string[] | undefined, provenance = {}) {
  const render = vi.fn(() => ({ __html: `<span>${FACT_TEXT}</span>` }));
  const out = renderFact({ provenanceIds, provenance, render });
  return { render, html: out.__html };
}

describe("guardFact — refusal cases", () => {
  it("refuses a fact with NO provenance ids (§1.4: does not render)", () => {
    expect(guardFact(undefined, {})).toMatchObject({ ok: false, code: "missing_provenance" });
    expect(guardFact([], {})).toMatchObject({ ok: false, code: "missing_provenance" });
  });

  it("refuses when an id does not resolve in the envelope dictionary", () => {
    expect(guardFact(["prov:missing"], {})).toMatchObject({
      ok: false,
      code: "unresolved_provenance",
    });
  });

  it("refuses a record missing any of the ten SS1.4 fields", () => {
    const broken = record();
    // @ts-expect-error — deliberately breaking the record shape
    delete broken.retrievedAt;
    expect(guardFact(["prov:test:1"], { "prov:test:1": broken })).toMatchObject({
      ok: false,
      code: "incomplete_record",
    });
  });

  it("refuses expired freshness (the 'expired' screen state)", () => {
    const r = record({ freshness: "expired" });
    expect(guardFact([r.id], { [r.id]: r })).toMatchObject({ ok: false, code: "expired" });
  });

  it("refuses retracted and under_review correction statuses", () => {
    const retracted = record({ correctionStatus: "retracted" });
    const review = record({ correctionStatus: "under_review" });
    expect(guardFact([retracted.id], { [retracted.id]: retracted })).toMatchObject({
      ok: false,
      code: "retracted",
    });
    expect(guardFact([review.id], { [review.id]: review })).toMatchObject({
      ok: false,
      code: "under_review",
    });
  });

  it("one bad citation poisons the whole fact (no partial credit)", () => {
    const good = record({ id: "prov:good" });
    const expired = record({ id: "prov:expired", freshness: "expired" });
    expect(
      guardFact(["prov:good", "prov:expired"], { "prov:good": good, "prov:expired": expired }),
    ).toMatchObject({ ok: false, code: "expired" });
  });
});

describe("renderFact — refusal renders the reason, never the fact", () => {
  it("renders the suppression reason instead of a provenance-less fact", () => {
    const { render, html } = attempt(undefined);
    expect(render).not.toHaveBeenCalled();
    expect(html).not.toContain(FACT_TEXT);
    expect(html).toContain(escapeHtml(SUPPRESSION.missingProvenance));
    expect(html).toContain("suppression-notice");
  });

  it("renders the expiry reason for expired facts — suppression beats guessing", () => {
    const r = record({ freshness: "expired" });
    const { render, html } = attempt([r.id], { [r.id]: r });
    expect(render).not.toHaveBeenCalled();
    expect(html).toContain(escapeHtml(SUPPRESSION.expired));
  });

  it("renders the fact WITH its visible provenance line when the guard passes", () => {
    const r = record();
    const { render, html } = attempt([r.id], { [r.id]: r });
    expect(render).toHaveBeenCalledTimes(1);
    expect(html).toContain(FACT_TEXT);
    expect(html).toContain("provenance-line");
    expect(html).toContain(r.source);
    expect(html).toContain("observed 2026-08-01");
    expect(html).toContain("retrieved 2026-08-04 12:00 UTC");
    expect(html).toContain("confidence 92%");
  });

  it("withLine:false still guards but omits the line (caller renders a shared one)", () => {
    const r = record();
    const out = renderFact({
      provenanceIds: [r.id],
      provenance: { [r.id]: r },
      withLine: false,
      render: () => ({ __html: FACT_TEXT }),
    });
    expect(out.__html).toContain(FACT_TEXT);
    expect(out.__html).not.toContain("provenance-line");
    const refused = renderFact({
      provenanceIds: [],
      provenance: {},
      withLine: false,
      render: () => ({ __html: FACT_TEXT }),
    });
    expect(refused.__html).not.toContain(FACT_TEXT);
  });
});

describe("provenance line — a designed element (direction §7)", () => {
  it("carries source, type, dates, confidence, and the history icon", () => {
    const r = record({ limitations: "fixture data, not live prices" });
    const line = provenanceLine([r]).__html;
    expect(line).toContain("icon-history");
    expect(line).toContain(r.source);
    expect(line).toContain("fixture");
    expect(line).toContain("Limitations: fixture data, not live prices");
  });

  it("surfaces a correction visibly when the source corrected the fact", () => {
    const r = record({ correctionStatus: "corrected" });
    expect(provenanceLine([r]).__html).toContain("Corrected by the source");
  });

  it("suppressionNotice renders icon + reason text (never color alone)", () => {
    const out = suppressionNotice("held back for the test").__html;
    expect(out).toContain("<svg");
    expect(out).toContain("held back for the test");
  });
});
