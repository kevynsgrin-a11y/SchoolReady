/**
 * List intake (paste / manual / upload) + the MANDATORY review-confirm
 * screen (ReviewPayload contract, Phase 3/5): the parser proposes, the user
 * confirms. Confirm posts CONTROLLED-VOCABULARY fields only — originalText
 * has no form field and no path back to the server (P3-2 discipline).
 */
import type { ApiErrorCode, IntakeData, SessionData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import type { ReviewItem } from "../../parsing/types";
import { PRODUCT_LEXICON, getLexiconEntry } from "../../parsing/lexicon";
import { UNITS, RULING_STYLES } from "../../contracts/product";
import { COLOR_WORDS } from "../../parsing/lexicon";
import { GRADE_LEVELS } from "../../contracts/school";
import { OPTIONALITIES } from "../../contracts/requirement";
import type { IntakeMethod } from "../../contracts/requirement";
import type { Html } from "../html";
import { html, joinHtml, raw } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { button, checkbox, field, form, select, textInput, textarea } from "../components/forms";
import { renderFact, suppressionNotice } from "../render-guard";
import { errorSection, intro, loadingSection, rateLimitedSection } from "./shared";
import { INTAKE } from "../copy/en";

export type IntakeTab = "paste" | "manual" | "upload";

export type IntakeScreenState =
  | { kind: "form"; tab: IntakeTab }
  | { kind: "loading" }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "error"; code: ApiErrorCode }
  | {
      kind: "review";
      envelope: ApiOk<IntakeData>;
      intakeMethod: IntakeMethod;
      session: SessionData | null;
      /** Server-computed default (from the clock), e.g. "2026-2027". */
      defaultSchoolYear: string;
    };

/* ------------------------------------------------------------------ */
/* Intake forms                                                        */
/* ------------------------------------------------------------------ */

function tabs(active: IntakeTab): Html {
  const tab = (key: IntakeTab, href: string, label: string, iconName: "clipboard-paste" | "pencil" | "camera"): Html =>
    html`<a class="tab${key === active ? " tab-active" : ""}" href="${href}"${
      key === active ? html` aria-current="page"` : null
    }>${icon(iconName, { size: 20 })}<span>${label}</span></a>`;
  return html`<div class="tabs">${tab("paste", "/intake", INTAKE.tabPaste, "clipboard-paste")}${tab(
    "manual",
    "/intake?tab=manual",
    INTAKE.tabManual,
    "pencil",
  )}${tab("upload", "/intake?tab=upload", INTAKE.tabUpload, "camera")}</div>`;
}

const productOptions = (selected: string | null) =>
  PRODUCT_LEXICON.map((e) => ({ value: e.slug, label: e.displayName, selected: e.slug === selected }));

function pasteForm(): Html {
  return form({
    action: "/intake/paste",
    ariaLabel: INTAKE.tabPaste,
    body: [
      field({
        id: "paste-text",
        label: INTAKE.pasteLabel,
        control: textarea({ id: "paste-text", name: "text", rows: 10, required: true }),
      }),
      button({ label: INTAKE.pasteSubmit, icon: "scan-line" }),
    ],
  });
}

function manualForm(): Html {
  return form({
    action: "/intake/manual",
    ariaLabel: INTAKE.tabManual,
    body: [
      html`<fieldset><legend>${INTAKE.manualLegend}</legend>${joinHtml([
        field({
          id: "manual-product",
          label: INTAKE.manualProduct,
          control: select({ id: "manual-product", name: "productTypeSlug", options: productOptions(null) }),
        }),
        field({
          id: "manual-quantity",
          label: INTAKE.manualQuantity,
          control: textInput({ id: "manual-quantity", name: "quantity", type: "number", min: 1, max: 999, value: "1", required: true, inputmode: "numeric" }),
        }),
        field({
          id: "manual-unit",
          label: INTAKE.manualUnit,
          control: select({
            id: "manual-unit",
            name: "unit",
            options: UNITS.map((u) => ({ value: u, label: u })),
          }),
        }),
        field({
          id: "manual-color",
          label: INTAKE.manualColor,
          control: select({
            id: "manual-color",
            name: "color",
            options: [{ value: "", label: INTAKE.reviewStateNone }, ...COLOR_WORDS.map((c) => ({ value: c, label: c }))],
          }),
        }),
        field({
          id: "manual-ruling",
          label: INTAKE.manualRuling,
          control: select({
            id: "manual-ruling",
            name: "rulingStyle",
            options: [{ value: "", label: INTAKE.reviewStateNone }, ...RULING_STYLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") }))],
          }),
        }),
        field({
          id: "manual-optionality",
          label: INTAKE.manualOptionality,
          control: select({
            id: "manual-optionality",
            name: "optionality",
            options: OPTIONALITIES.map((o) => ({ value: o, label: o })),
          }),
        }),
      ])}</fieldset>`,
      button({ label: INTAKE.manualSubmit, icon: "circle-plus" }),
    ],
  });
}

function uploadForm(): Html {
  return form({
    action: "/intake/upload",
    ariaLabel: INTAKE.tabUpload,
    body: [
      html`<p class="muted">${INTAKE.uploadPrivacy}</p>`,
      field({
        id: "upload-file",
        label: INTAKE.uploadLabel,
        control: raw(
          '<input class="control" type="file" id="upload-file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" required>',
        ),
      }),
      button({ label: INTAKE.uploadSubmit, icon: "camera" }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Review-confirm                                                      */
/* ------------------------------------------------------------------ */

function reviewItemFields(item: ReviewItem, index: number): Html {
  const p = item.proposed;
  if (p === null) {
    return html`<div class="review-item"><p class="review-original">${INTAKE.reviewOriginal}: ${item.originalText}</p>${suppressionNotice(INTAKE.reviewUnparsed)}</div>`;
  }
  const include = checkbox({
    id: `item-${index}-include`,
    name: `item-${index}-include`,
    label: item.needsReview ? INTAKE.reviewNeedsAttention : INTAKE.reviewProposed,
    value: "on",
    checked: !item.needsReview,
  });
  const productControl =
    item.productCandidates.length > 1
      ? field({
          id: `item-${index}-product`,
          label: INTAKE.reviewCandidates,
          control: select({
            id: `item-${index}-product`,
            name: `item-${index}-product`,
            options: item.productCandidates.map((slug) => ({
              value: slug,
              label: getLexiconEntry(slug)?.displayName ?? slug,
            })),
          }),
        })
      : field({
          id: `item-${index}-product`,
          label: INTAKE.manualProduct,
          control: select({
            id: `item-${index}-product`,
            name: `item-${index}-product`,
            options: productOptions(p.productTypeSlug),
          }),
        });
  return html`<div class="review-item${item.needsReview ? " review-needs" : ""}">
<p class="review-original">${INTAKE.reviewOriginal}: ${item.originalText}</p>
<p>${INTAKE.reviewProposed} <strong>${item.interpretation}</strong> <span class="text-data-s muted">(${INTAKE.reviewConfidence} ${Math.round(p.sourceConfidence * 100)}%)</span></p>
${include}
${productControl}
${field({
    id: `item-${index}-quantity`,
    label: INTAKE.manualQuantity,
    control: textInput({
      id: `item-${index}-quantity`,
      name: `item-${index}-quantity`,
      type: "number",
      min: 1,
      max: 999,
      value: String(p.quantity),
      inputmode: "numeric",
    }),
  })}
${field({
    id: `item-${index}-unit`,
    label: INTAKE.manualUnit,
    control: select({
      id: `item-${index}-unit`,
      name: `item-${index}-unit`,
      options: UNITS.map((u) => ({ value: u, label: u, selected: u === p.unit })),
    }),
  })}
${field({
    id: `item-${index}-optionality`,
    label: INTAKE.manualOptionality,
    control: select({
      id: `item-${index}-optionality`,
      name: `item-${index}-optionality`,
      options: OPTIONALITIES.map((o) => ({ value: o, label: o, selected: o === p.optionality })),
    }),
  })}
<input type="hidden" name="item-${index}-color" value="${p.color ?? ""}">
<input type="hidden" name="item-${index}-ruling" value="${p.rulingStyle ?? ""}">
<input type="hidden" name="item-${index}-packCount" value="${p.packCount ?? ""}">
<input type="hidden" name="item-${index}-dimensions" value="${p.dimensions ?? ""}">
<input type="hidden" name="item-${index}-brandRequirement" value="${p.brandRequirement}">
<input type="hidden" name="item-${index}-brand" value="${p.requiredBrandSlug ?? ""}">
<input type="hidden" name="item-${index}-confidence" value="${p.sourceConfidence}">
</div>`;
}

function reviewSection(state: Extract<IntakeScreenState, { kind: "review" }>): Html {
  const { review, intakeId, itemProvenance } = state.envelope.data;
  const provenance = state.envelope.provenance;
  const provByLine = new Map(itemProvenance.map((ip) => [ip.lineNumber, ip.provenanceIds]));
  const ordinals = state.session?.memberOrdinals ?? [];
  const nextOrdinal = (ordinals.length > 0 ? Math.max(...ordinals) : 0) + 1;

  const items = review.items.map((item, index) => {
    const ids = provByLine.get(item.lineNumber);
    // §1.4: each parsed proposal is a fact — it renders only through the
    // guard, with its provenance line visible; refusals show the reason.
    return renderFact({
      provenanceIds: ids,
      provenance,
      render: () => reviewItemFields(item, index),
    });
  });

  const redaction =
    review.redaction.redactionCount > 0
      ? html`<p class="muted">${icon("shield-check", { size: 20 })} ${INTAKE.reviewRedaction(review.redaction.redactionCount)}</p>`
      : raw("");
  const skipped = review.skippedLineCount > 0 ? html`<p class="muted">${INTAKE.skipped(review.skippedLineCount)}</p>` : raw("");

  const confirmables = review.items.filter((i) => i.proposed !== null).length;

  const memberOptions = [
    ...ordinals.map((o) => ({ value: String(o), label: INTAKE.reviewChildOption(o) })),
    { value: String(nextOrdinal), label: INTAKE.reviewNewChild(nextOrdinal), selected: ordinals.length === 0 },
  ];

  return html`<h1>${INTAKE.reviewTitle}</h1>
<p class="lead">${INTAKE.reviewLead}</p>
${redaction}${skipped}
${form({
    action: "/intake/confirm",
    ariaLabel: INTAKE.reviewTitle,
    body: [
      html`<input type="hidden" name="intakeId" value="${intakeId}">`,
      html`<input type="hidden" name="intakeMethod" value="${state.intakeMethod}">`,
      html`<input type="hidden" name="itemCount" value="${review.items.length}">`,
      joinHtml(items),
      html`<fieldset><legend>${INTAKE.reviewChild}</legend>${joinHtml([
        field({
          id: "confirm-member",
          label: INTAKE.reviewChild,
          control: select({ id: "confirm-member", name: "memberOrdinal", options: memberOptions }),
        }),
        field({
          id: "confirm-year",
          label: INTAKE.reviewYear,
          control: textInput({ id: "confirm-year", name: "schoolYear", value: state.defaultSchoolYear, pattern: "\\d{4}-\\d{4}", required: true }),
        }),
        field({
          id: "confirm-grade",
          label: INTAKE.reviewGrade,
          control: select({
            id: "confirm-grade",
            name: "gradeLevel",
            options: [{ value: "", label: INTAKE.reviewGradeNone }, ...GRADE_LEVELS.map((g) => ({ value: g, label: g }))],
          }),
        }),
        field({
          id: "confirm-state",
          label: INTAKE.reviewState,
          control: textInput({ id: "confirm-state", name: "state", pattern: "[A-Z]{2}", hinted: true }),
          hint: INTAKE.reviewStateNone,
        }),
      ])}</fieldset>`,
      confirmables > 0
        ? button({ label: INTAKE.confirmSubmit(confirmables), icon: "list-checks" })
        : suppressionNotice(INTAKE.confirmNone),
    ],
  })}`;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function renderIntake(state: IntakeScreenState): Screen {
  const base = {
    title: INTAKE.title,
    description: INTAKE.lead,
    activeNav: "intake" as const,
    container: "flow" as const,
  };
  switch (state.kind) {
    case "loading":
      return { ...base, sections: [intro(INTAKE.title, INTAKE.lead), loadingSection(4)] };
    case "rate_limited":
      return { ...base, sections: [intro(INTAKE.title, INTAKE.lead), rateLimitedSection(state.retryAfterSeconds)] };
    case "error":
      return {
        ...base,
        sections: [
          intro(INTAKE.title, INTAKE.lead),
          errorSection(state.code),
          { kind: "form", body: html`${tabs("paste")}${pasteForm()}` },
        ],
      };
    case "review":
      return state.envelope.data.review.items.length === 0
        ? {
            ...base,
            sections: [
              intro(INTAKE.reviewTitle, INTAKE.emptyParse),
              { kind: "form", body: html`${tabs(state.intakeMethod === "upload" ? "upload" : "paste")}${pasteForm()}` },
            ],
          }
        : { ...base, sections: [{ kind: "form", body: reviewSection(state) }] };
    case "form": {
      const body =
        state.tab === "manual" ? manualForm() : state.tab === "upload" ? uploadForm() : pasteForm();
      return {
        ...base,
        sections: [
          intro(INTAKE.title, INTAKE.lead),
          { kind: "form", body: html`${tabs(state.tab)}${body}` },
        ],
      };
    }
  }
}
