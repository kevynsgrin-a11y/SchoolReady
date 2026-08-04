/**
 * PII redaction at the intake boundary (SS1.7).
 *
 * Runs BEFORE anything else sees intake text: child names, teacher names,
 * classroom identifiers, addresses, exact (person) sizes, budget amounts,
 * gift recipients, and contact strings are replaced with [redacted:<category>]
 * tokens. The report carries categories and counts, NEVER values.
 *
 * Defense in depth, because pattern redaction can never be exhaustive:
 *  1. this redactor scrubs the transient text (review payload, nothing else);
 *  2. persistence is STRUCTURAL — only controlled-vocabulary fields ever
 *     reach D1 (no free-prose column exists on requirements), so a missed
 *     name cannot persist;
 *  3. upload bytes live only in the hard-TTL buffer and are deleted after
 *     processing (upload-buffer.ts).
 * The zero-PII cycle tests prove the combination end to end.
 */
import type { PiiCategory, PiiRedactionReport } from "./types";

export const REDACTION_TOKEN_RE = /\[redacted:[a-z_]+\]/g;

const token = (category: PiiCategory): string => `[redacted:${category}]`;

interface RedactionRule {
  category: PiiCategory;
  re: RegExp;
}

/**
 * Order matters: explicit labeled fields first (they swallow whole values),
 * then structural patterns. All regexes are global.
 */
const RULES: readonly RedactionRule[] = [
  // Contact strings (emails before addresses: both contain dots/digits).
  { category: "contact", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { category: "contact", re: /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  // Labeled child-name fields ("Student Name: ...", "Child's name - ...").
  {
    category: "child_name",
    re: /\b(?:student|child|kid|pupil)(?:'s)?\s+name\s*[:-]\s*[^\n]+/gi,
  },
  { category: "child_name", re: /\bname\s*:\s*[^\n]+/gi },
  // Possessive list headers ("Jordan's supply list").
  {
    category: "child_name",
    re: /\b[A-Z][a-z]+'s\s+(?:supply\s+list|supplies|list|backpack)/g,
  },
  // Teacher honorifics + surname, and labeled teacher fields.
  {
    category: "teacher_name",
    re: /\b(?:Mr|Mrs|Ms|Miss|Dr|Coach|Prof|Professor)\.?\s+[A-Z][A-Za-z'-]+(?:'s)?/g,
  },
  { category: "teacher_name", re: /\bteacher\s*[:-]\s*[^\n,;]+/gi },
  // Classroom identifiers ("Room 214", "Rm 12B", "Homeroom 7A", "Portable 3").
  {
    category: "classroom_id",
    re: /\b(?:room|rm\.?|classroom|homeroom|portable)\s*#?\s*[A-Za-z]?\d+[A-Za-z]?\b/gi,
  },
  // Street addresses and state+ZIP pairs.
  {
    category: "address",
    re: /\b\d{1,6}\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl)\b\.?(?:,?\s+(?:Apt|Suite|Unit)\s*\S+)?/g,
  },
  { category: "address", re: /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g },
  // Exact person sizes ("size 13", "shoe size 2", "youth medium").
  { category: "exact_size", re: /\b(?:shoe\s+|clothing\s+)?size\s+\d+(?:\.\d+)?[A-Za-z]?\b/gi },
  { category: "exact_size", re: /\byouth\s+(?:x-?small|small|medium|large|x-?large)\b/gi },
  { category: "exact_size", re: /\b(?:women's|men's|kids')\s+size\s+\S+/gi },
  // Gift recipients.
  { category: "gift_recipient", re: /\bgift\s+for\s+[^\n,.;]+/gi },
  // Budget/dollar amounts. Deliberately conservative: user-entered dollar
  // amounts at list intake are budget-shaped (SS1.7 household budgets);
  // prices only ever come from retailer sources, never from intake text.
  { category: "budget_amount", re: /\$\s*\d[\d,]*(?:\.\d{2})?/g },
];

export interface RedactionResult {
  text: string;
  report: PiiRedactionReport;
}

export function redactPii(rawText: string): RedactionResult {
  let text = rawText;
  const counts: Partial<Record<PiiCategory, number>> = {};
  let redactionCount = 0;

  for (const rule of RULES) {
    text = text.replace(rule.re, () => {
      counts[rule.category] = (counts[rule.category] ?? 0) + 1;
      redactionCount += 1;
      return token(rule.category);
    });
  }

  const categoriesHit = (Object.keys(counts) as PiiCategory[]).sort();
  return {
    text,
    report: { categoriesHit, counts, redactionCount },
  };
}
