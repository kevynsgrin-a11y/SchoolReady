/**
 * Loading states are SKELETONS, never spinners: fixed-dimension placeholder
 * blocks matching the layout they stand in for (zero layout shift when data
 * arrives). Skeleton containers carry aria-busy and a text status for
 * assistive tech; the pulse animation collapses to static under
 * prefers-reduced-motion. Skeletons contain NO facts and NO fact styling —
 * the sum rule never appears in a skeleton (§5.4).
 */
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import { COMMON } from "../copy/en";

/** One placeholder bar. Height/width fixed at call time — no reflow. */
export function skeletonBar(args: { widthPct: number; heightPx: number }): Html {
  return html`<div class="skeleton-bar" style="width:${args.widthPct}%;height:${args.heightPx}px"></div>`;
}

/** A list-row placeholder matching .list-row metrics (56px). */
export function skeletonRow(): Html {
  return html`<div class="skeleton-row">${skeletonBar({ widthPct: 8, heightPx: 16 })}${skeletonBar({ widthPct: 52, heightPx: 16 })}${skeletonBar({ widthPct: 14, heightPx: 16 })}</div>`;
}

/** Screen-level skeleton: n rows plus an optional ledger-shaped block. */
export function skeletonScreen(args: { rows: number; withLedger?: boolean }): Html {
  const rows: Html[] = [];
  for (let i = 0; i < args.rows; i += 1) rows.push(skeletonRow());
  return html`<div class="skeleton" role="status" aria-busy="true" aria-live="polite"><span class="visually-hidden">${COMMON.loading}</span>${joinHtml(rows)}${
    args.withLedger
      ? html`<div class="skeleton-ledger">${skeletonBar({ widthPct: 40, heightPx: 20 })}${skeletonBar({ widthPct: 40, heightPx: 20 })}${skeletonBar({ widthPct: 40, heightPx: 24 })}</div>`
      : null
  }</div>`;
}
