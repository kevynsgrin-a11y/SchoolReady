/**
 * Form primitives. Every control is a NATIVE element (keyboard-reachable by
 * default), every input has a visible <label>, every button states what
 * happens (voice §10). Hit targets are >= 44px via .control sizing (§4).
 */
import type { Html, HtmlValue } from "../html";
import { html, joinHtml } from "../html";
import type { IconName } from "../icons";
import { icon } from "../icons";

export function button(args: {
  label: string;
  type?: "submit" | "button";
  variant?: "primary" | "secondary";
  icon?: IconName;
  name?: string;
  value?: string;
  id?: string;
}): Html {
  return html`<button type="${args.type ?? "submit"}" class="button button-${args.variant ?? "primary"}"${
    args.name ? html` name="${args.name}"` : null
  }${args.value !== undefined ? html` value="${args.value}"` : null}${
    args.id ? html` id="${args.id}"` : null
  }>${args.icon ? icon(args.icon, { size: 20 }) : null}<span>${args.label}</span></button>`;
}

export function linkButton(args: {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
  icon?: IconName;
}): Html {
  return html`<a class="button button-${args.variant ?? "primary"}" href="${args.href}">${
    args.icon ? icon(args.icon, { size: 20 }) : null
  }<span>${args.label}</span></a>`;
}

export function field(args: { id: string; label: string; control: Html; hint?: string }): Html {
  return html`<div class="field"><label class="field-label" for="${args.id}">${args.label}</label>${
    args.hint ? html`<p class="field-hint" id="${args.id}-hint">${args.hint}</p>` : null
  }${args.control}</div>`;
}

export function textInput(args: {
  id: string;
  name: string;
  type?: "text" | "number" | "date";
  value?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: undefined;
  inputmode?: "numeric" | "decimal";
  pattern?: string;
  hinted?: boolean;
}): Html {
  return html`<input class="control text-input" id="${args.id}" name="${args.name}" type="${args.type ?? "text"}"${
    args.value !== undefined ? html` value="${args.value}"` : null
  }${args.required ? html` required` : null}${args.min !== undefined ? html` min="${args.min}"` : null}${
    args.max !== undefined ? html` max="${args.max}"` : null
  }${args.step !== undefined ? html` step="${args.step}"` : null}${
    args.inputmode ? html` inputmode="${args.inputmode}"` : null
  }${args.pattern ? html` pattern="${args.pattern}"` : null}${
    args.hinted ? html` aria-describedby="${args.id}-hint"` : null
  }>`;
}

export function textarea(args: {
  id: string;
  name: string;
  rows: number;
  required?: boolean;
  hinted?: boolean;
}): Html {
  return html`<textarea class="control textarea" id="${args.id}" name="${args.name}" rows="${args.rows}"${
    args.required ? html` required` : null
  }${args.hinted ? html` aria-describedby="${args.id}-hint"` : null}></textarea>`;
}

export interface SelectOption {
  value: string;
  label: string;
  selected?: boolean;
}

export function select(args: {
  id: string;
  name: string;
  options: readonly SelectOption[];
  required?: boolean;
}): Html {
  const options = args.options.map(
    (o) => html`<option value="${o.value}"${o.selected ? html` selected` : null}>${o.label}</option>`,
  );
  return html`<select class="control select" id="${args.id}" name="${args.name}"${
    args.required ? html` required` : null
  }>${joinHtml(options)}</select>`;
}

export function checkbox(args: {
  id: string;
  name: string;
  label: string;
  value?: string;
  checked?: boolean;
}): Html {
  return html`<label class="checkbox-row" for="${args.id}"><input class="checkbox" type="checkbox" id="${args.id}" name="${args.name}"${
    args.value !== undefined ? html` value="${args.value}"` : null
  }${args.checked ? html` checked` : null}><span>${args.label}</span></label>`;
}

export function form(args: {
  action: string;
  method?: "post" | "get";
  body: readonly HtmlValue[];
  ariaLabel?: string;
  /**
   * Required on any form carrying a file input. Without it a browser encodes
   * the file as application/x-www-form-urlencoded and transmits only the
   * FILENAME, so the server receives a string instead of a File and blames the
   * user for a client-side encoding fault.
   */
  enctype?: "multipart/form-data";
}): Html {
  return html`<form action="${args.action}" method="${args.method ?? "post"}"${
    args.enctype ? html` enctype="${args.enctype}"` : null
  }${args.ariaLabel ? html` aria-label="${args.ariaLabel}"` : null}>${args.body}</form>`;
}
