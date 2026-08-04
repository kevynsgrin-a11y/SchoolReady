/**
 * Color mathematics for the Phase 11 contrast + color-vision audit.
 *
 * - WCAG 2.x relative luminance / contrast ratio (WCAG 2.2 §"contrast ratio"
 *   definition; identical math in 2.1 and 2.2).
 * - Color-vision-deficiency simulation using the published Machado,
 *   Oliveira & Fernandes matrices (severity 1.0) from "A Physiologically-
 *   based Model for Simulation of Color Vision Deficiency", IEEE TVCG 15(6),
 *   2009 — applied in linearized sRGB as the paper specifies.
 * - CIE L*a*b* conversion (D65) + CIE76 delta-E for perceptual-difference
 *   reporting in the audit document.
 *
 * Everything here is deterministic computation over the pinned design
 * tokens — no invented numbers.
 */

export type Rgb = readonly [number, number, number]; // 0..1 sRGB

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a 6-digit hex color: ${hex}`);
  return [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255) as unknown as Rgb;
}

const linearize = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const delinearize = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;

export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = [linearize(rgb[0]), linearize(rgb[1]), linearize(rgb[2])];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1..21. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ */
/* CVD simulation — Machado et al. 2009, severity 1.0                  */
/* ------------------------------------------------------------------ */

export type CvdKind = "protanopia" | "deuteranopia" | "tritanopia";

/** Published constants (Machado/Oliveira/Fernandes 2009, severity 1.0). */
export const MACHADO_2009: Readonly<Record<CvdKind, readonly number[]>> = {
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.01182, 0.04294, 0.968881,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.3039,
  ],
};

/** Simulates a hex color as seen with the given dichromacy; returns hex. */
export function simulateCvd(hex: string, kind: CvdKind): string {
  const m = MACHADO_2009[kind];
  const [r, g, b] = hexToRgb(hex).map(linearize);
  const out = [
    m[0]! * r + m[1]! * g + m[2]! * b,
    m[3]! * r + m[4]! * g + m[5]! * b,
    m[6]! * r + m[7]! * g + m[8]! * b,
  ].map((c) => Math.min(1, Math.max(0, c)));
  const toHexByte = (c: number): string =>
    Math.round(delinearize(c) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${out.map(toHexByte).join("")}`.toUpperCase();
}

/* ------------------------------------------------------------------ */
/* CIE L*a*b* + delta-E (CIE76) for perceptual-difference reporting    */
/* ------------------------------------------------------------------ */

function rgbToXyz(rgb: Rgb): readonly [number, number, number] {
  const [r, g, b] = rgb.map(linearize);
  return [
    0.4124564 * r! + 0.3575761 * g! + 0.1804375 * b!,
    0.2126729 * r! + 0.7151522 * g! + 0.072175 * b!,
    0.0193339 * r! + 0.119192 * g! + 0.9503041 * b!,
  ];
}

const D65 = [0.95047, 1.0, 1.08883] as const;

export function hexToLab(hex: string): readonly [number, number, number] {
  const xyz = rgbToXyz(hexToRgb(hex));
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(xyz[0] / D65[0]), f(xyz[1] / D65[1]), f(xyz[2] / D65[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 delta-E between two hex colors (rough guide: < 10 = hard to tell apart at a glance). */
export function deltaE76(hexA: string, hexB: string): number {
  const a = hexToLab(hexA);
  const b = hexToLab(hexB);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
