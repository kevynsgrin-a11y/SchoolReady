/**
 * Admin / provider status: per-source freshness, circuit state, and mode.
 * Data comes from envelope meta.sources (Phase 5 SourceStatus) plus the
 * shipped flag defaults — nothing here is styled as a computed fact because
 * source health IS meta, not user-facing product data; freshness badges use
 * the same stale grammar as everywhere else.
 */
import type { SourceStatus } from "../../api/contracts";
import { DEFAULT_FLAGS } from "../../../config/flags";
import type { SourceId } from "../../../config/flags";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { staleBadge } from "../components/badges";
import type { ScreenState } from "../state";
import { foldState, intro } from "./shared";
import { STATUS } from "../copy/en";

export interface StatusData {
  sources: SourceStatus[];
}

export type StatusScreenState = ScreenState<StatusData>;

function circuitLabel(state: SourceStatus["circuitState"]): string {
  switch (state) {
    case "closed":
      return STATUS.circuitClosed;
    case "open":
      return STATUS.circuitOpen;
    case "half_open":
      return STATUS.circuitHalfOpen;
  }
}

function sourceRow(source: SourceStatus): ReturnType<typeof html> {
  const live = DEFAULT_FLAGS.liveSources[source.sourceId as SourceId] === true;
  const freshness =
    source.ageSeconds === null
      ? STATUS.ageUnknown
      : source.stale
        ? STATUS.staleAged(Math.round(source.ageSeconds / 3600))
        : STATUS.fresh;
  return html`<tr><td>${icon("activity", { size: 14, stroke: 1.75 })} ${source.sourceId}</td><td>${freshness}${
    source.stale && source.storedAt ? html` ${staleBadge(source.storedAt.slice(0, 10))}` : null
  }</td><td>${circuitLabel(source.circuitState)}${
    source.degraded === "cache_fallback"
      ? html` <span class="text-data-s muted">${STATUS.degradedCache}</span>`
      : source.degraded === "unavailable"
        ? html` <span class="text-data-s muted">${STATUS.degradedUnavailable}</span>`
        : null
  }</td><td>${live ? STATUS.live : STATUS.fixture}</td></tr>`;
}

export function renderStatus(state: StatusScreenState): Screen {
  const base = {
    title: STATUS.title,
    description: STATUS.lead,
    activeNav: "status" as const,
    container: "plan" as const,
  };
  const sections = foldState(state, { loadingRows: 4 }, (envelope) => {
    const { sources } = envelope.data;
    if (sources.length === 0) {
      return [{ kind: "content" as const, body: html`<p>${STATUS.none}</p>` }];
    }
    return [
      {
        kind: "content" as const,
        body: html`<table class="status-table"><caption class="visually-hidden">${STATUS.title}</caption><thead><tr><th scope="col">${STATUS.sourceCol}</th><th scope="col">${STATUS.freshnessCol}</th><th scope="col">${STATUS.circuitCol}</th><th scope="col">${STATUS.modeCol}</th></tr></thead><tbody>${joinHtml(
          sources.map(sourceRow),
        )}</tbody></table>`,
      },
    ];
  });
  return { ...base, sections: [intro(STATUS.title, STATUS.lead), ...sections] };
}
