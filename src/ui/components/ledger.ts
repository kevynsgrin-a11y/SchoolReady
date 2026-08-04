/**
 * The signature element (direction.md §5): the Sum Rule and the
 * Net-Required Stack — hand-arithmetic ledger rules under every number the
 * engine computes, and ONLY under numbers the engine computes. Using these
 * components on non-computed values is a design regression; nothing here
 * accepts free-form prose.
 */
import type { Html } from "../html";
import { html, joinHtml } from "../html";

/** U+2212, the true minus sign (direction §5.2). */
export const MINUS_SIGN = "−";
/** U+00D7 multiplication sign for pack math. */
export const TIMES_SIGN = "×";

/** Deterministic cents -> dollars formatting for `data`-styled columns. */
export function moneyCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, "0");
  return `${negative ? MINUS_SIGN : ""}$${dollars}.${rem}`;
}

/** Fractional units render exactly (condition-weighted inventory math). */
export function formatUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : String(units);
}

export interface LedgerRow {
  label: string;
  /** Pre-formatted numeric string (moneyCents / formatUnits at call site). */
  value: string;
  /** Operator column: the true minus sign for subtractions. */
  operator?: string;
  /** Expandable receipt behind this operand (renders in a <details>). */
  receipt?: Html;
}

function ledgerRow(row: LedgerRow, emphasis: boolean): Html {
  const valueCell = html`<span class="ledger-value${emphasis ? " ledger-total-value" : ""}">${
    row.operator ? html`<span class="ledger-operator">${row.operator} </span>` : null
  }${row.value}</span>`;
  if (row.receipt) {
    return html`<details class="ledger-line-details"><summary class="ledger-line"><span class="ledger-label">${row.label}</span>${valueCell}</summary><div class="ledger-receipt">${row.receipt}</div></details>`;
  }
  return html`<div class="ledger-line"><span class="ledger-label">${row.label}</span>${valueCell}</div>`;
}

/**
 * §5.1 The Sum Rule: a computed subtotal sits directly beneath a single 1px
 * Ink rule; a FINAL total additionally carries the accountant's double rule
 * (1px, 3px gap, 2px) under the numeric column only.
 */
export function sumRuleTotal(args: {
  label: string;
  value: string;
  final?: boolean;
  rows?: readonly LedgerRow[];
}): Html {
  const rows = (args.rows ?? []).map((r) => ledgerRow(r, false));
  return html`<div class="ledger">${joinHtml(rows)}<div class="ledger-line sum-rule"><span class="ledger-label">${args.label}</span><span class="ledger-value ledger-total-value${args.final ? " double-rule" : ""}">${args.value}</span></div></div>`;
}

/**
 * §5.2 The Net-Required Stack: stacked subtraction, right-aligned mono,
 * true minus sign, single rule above the result. Tapping an operand expands
 * the line-item receipt behind that number (details/summary — no JS needed).
 */
export function netRequiredStack(args: {
  requiredLabel: string;
  requiredUnits: number;
  ownedLabel: string;
  ownedUnits: number;
  reserveLabel?: string;
  reserveUnits?: number;
  resultLabel: string;
  resultUnits: number;
  /** When buying rounds up to whole units, the rounded figure + its label. */
  wholeUnitsLabel?: string;
  wholeUnits?: number;
  requiredReceipt?: Html;
  ownedReceipt?: Html;
}): Html {
  const rows: Html[] = [
    ledgerRow(
      {
        label: args.requiredLabel,
        value: formatUnits(args.requiredUnits),
        receipt: args.requiredReceipt,
      },
      false,
    ),
    ledgerRow(
      {
        label: args.ownedLabel,
        value: formatUnits(args.ownedUnits),
        operator: MINUS_SIGN,
        receipt: args.ownedReceipt,
      },
      false,
    ),
  ];
  if (args.reserveUnits !== undefined && args.reserveUnits > 0 && args.reserveLabel) {
    rows.push(
      ledgerRow(
        { label: args.reserveLabel, value: formatUnits(args.reserveUnits), operator: MINUS_SIGN },
        false,
      ),
    );
  }
  const rounded =
    args.wholeUnits !== undefined && args.wholeUnitsLabel && args.wholeUnits !== args.resultUnits
      ? html`<div class="ledger-line"><span class="ledger-label">${args.wholeUnitsLabel}</span><span class="ledger-value ledger-total-value">${formatUnits(args.wholeUnits)}</span></div>`
      : null;
  return html`<div class="ledger net-required-stack">${joinHtml(rows)}<div class="ledger-line sum-rule"><span class="ledger-label">${args.resultLabel}</span><span class="ledger-value ledger-total-value">${formatUnits(args.resultUnits)}</span></div>${rounded}</div>`;
}

/**
 * §5.3 Pack-size conversion chip: "2 X 24 ct = 48" in data-s with the
 * result underlined by a 1px rule. All three numbers are engine output.
 */
export function packMathChip(args: { packs: number; packCount: number; units: number }): Html {
  return html`<span class="pack-chip">${args.packs} ${TIMES_SIGN} ${args.packCount} ct <span class="pack-equals">= <span class="pack-result">${args.units}</span></span></span>`;
}

/**
 * Budget bar: computed fill fraction (0..1) from engine numbers. The bar is
 * a Sum-Rule client: label + mono value + proportional fill, no decoration.
 */
export function budgetBar(args: { label: string; value: string; fraction: number }): Html {
  const clamped = Math.min(1, Math.max(0, args.fraction));
  const pctText = `${Math.round(clamped * 100)}%`;
  return html`<div class="budget-bar"><div class="ledger-line sum-rule"><span class="ledger-label">${args.label}</span><span class="ledger-value ledger-total-value">${args.value}</span></div><div class="budget-bar-track" role="img" aria-label="${args.label}: ${pctText}"><div class="budget-bar-fill" style="width:${pctText}"></div></div></div>`;
}
