/**
 * Safety, restriction, and correction banners. Direction §8: NO motion —
 * these render immediately, static, full contrast, and (composer-enforced,
 * slots.ts) above all other content. Red appears here and nowhere else.
 */
import type { Html } from "../html";
import { html } from "../html";
import { icon } from "../icons";
import { recalledBadge, schoolRestrictedBadge } from "./badges";

export function recallBanner(args: { title: string; body: Html }): Html {
  return html`<div class="banner banner-recall" role="alert">${icon("octagon-alert", {
    size: 24,
  })}<div class="banner-content"><p class="banner-title">${recalledBadge()} ${args.title}</p><div class="banner-body">${args.body}</div></div></div>`;
}

export function restrictionBanner(args: { title: string; body: Html }): Html {
  return html`<div class="banner banner-restricted" role="alert">${icon("shield-x", {
    size: 24,
  })}<div class="banner-content"><p class="banner-title">${schoolRestrictedBadge()} ${args.title}</p><div class="banner-body">${args.body}</div></div></div>`;
}

export function correctionBanner(args: { title: string; body: Html }): Html {
  return html`<div class="banner banner-correction" role="status">${icon("refresh-cw", {
    size: 24,
  })}<div class="banner-content"><p class="banner-title">${args.title}</p><div class="banner-body">${args.body}</div></div></div>`;
}
