/**
 * Homepage — the five-second test: what this does + who it is for, with the
 * promise demonstrated within one interaction (the hero paste form parses a
 * real list into the review screen). No facts render here, so nothing needs
 * provenance; the page is static apart from the form.
 */
import { html } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { button } from "../components/forms";
import { form, textarea, field } from "../components/forms";
import { HOME, INTAKE } from "../copy/en";

export function renderHome(): Screen {
  const hero = html`<h1>${HOME.title}</h1>
<p class="lead">${HOME.lead}</p>
${form({
    action: "/intake/paste",
    ariaLabel: INTAKE.tabPaste,
    body: [
      field({
        id: "home-paste",
        label: HOME.heroInputLabel,
        control: textarea({ id: "home-paste", name: "text", rows: 6, required: true }),
      }),
      button({ label: HOME.heroCta, icon: "clipboard-paste" }),
    ],
  })}
<p class="muted">${HOME.heroAlt} <a href="/intake">${INTAKE.title}</a></p>`;

  const steps = html`<div class="card"><h3>${icon("scan-line", { size: 24 })} ${HOME.stepParseTitle}</h3><p>${HOME.stepParse}</p></div>
<div class="card"><h3>${icon("list-checks", { size: 24 })} ${HOME.stepMergeTitle}</h3><p>${HOME.stepMerge}</p></div>
<div class="card"><h3>${icon("store", { size: 24 })} ${HOME.stepCompareTitle}</h3><p>${HOME.stepCompare}</p></div>`;

  const safety = html`<h2>${HOME.safetyTitle}</h2><p>${HOME.safety}</p><p><a href="/methodology">${HOME.methodologyLink}</a></p>`;

  return {
    title: HOME.title,
    description: HOME.lead,
    activeNav: "home",
    container: "flow",
    sections: [
      { kind: "content", body: hero },
      { kind: "content", body: steps },
      { kind: "content", body: safety },
    ],
  };
}
