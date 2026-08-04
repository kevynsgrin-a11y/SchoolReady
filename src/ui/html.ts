/**
 * Minimal escaped-by-default HTML templating for Worker-side rendering.
 *
 * Every interpolated string is HTML-escaped unless explicitly wrapped in
 * raw() — which components use only for output they themselves rendered.
 * There is no client framework: pages are complete HTML documents and the
 * only client JavaScript is the progressive-enhancement layer in /public.
 */

export interface Html {
  readonly __html: string;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

export function raw(markup: string): Html {
  return { __html: markup };
}

export const EMPTY_HTML: Html = { __html: "" };

export type HtmlValue =
  | string
  | number
  | Html
  | null
  | undefined
  | false
  | readonly HtmlValue[];

function renderValue(value: HtmlValue): string {
  if (value === null || value === undefined || value === false) return "";
  if (typeof value === "string") return escapeHtml(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((v) => renderValue(v as HtmlValue)).join("");
  return (value as Html).__html;
}

/** Tagged template: interpolations are escaped unless they are Html. */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): Html {
  let out = "";
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) out += renderValue(values[i]);
  }
  return raw(out);
}

export function joinHtml(parts: readonly Html[], separator = ""): Html {
  return raw(parts.map((p) => p.__html).join(separator));
}

/** Attribute-safe escape (same table; kept named for call-site clarity). */
export const attr = escapeHtml;
