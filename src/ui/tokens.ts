/**
 * Design tokens — the typed source of truth for docs/design/direction.md §14.
 *
 * Every value below is transcribed from the Phase 6 design direction
 * (§1 palette, §2 status colors, §3 type scale, §4 layout). The CSS custom
 * properties served at /assets/ui.css are GENERATED from this module, so the
 * stylesheet cannot drift from the contract; tests/ui-tokens.test.ts asserts
 * these literals against the direction document's tables.
 *
 * Deviations from direction.md must route back through design-director —
 * there are none in this file.
 */

/* ------------------------------------------------------------------ */
/* §1 Brand palette                                                    */
/* ------------------------------------------------------------------ */

export const COLOR_TOKENS = {
  /** Blackboard — primary text, icon strokes, the sum rule, wordmark. */
  ink: "#25302A",
  /** Loose-leaf — page background. */
  paper: "#F7F8F2",
  /** Ream — cards, sheets, table surfaces. */
  surface: "#FFFFFF",
  /** Chalk Green — primary buttons, links, focus, selected, savings deltas. */
  action: "#1B6B54",
  /** Rule Blue — structural lines ONLY. Never text, never icons, never status. */
  rule: "#A7C4DE",
  /** Graphite — secondary text, captions, placeholders, disabled. */
  graphite: "#5C6660",
  /** Eraser Pink — background tint accent only; never text, never <24px areas. */
  accent: "#E5A49B",
} as const;

/* ------------------------------------------------------------------ */
/* §2 Status colors — separate family, never hue alone                 */
/* ------------------------------------------------------------------ */

export const STATUS_TOKENS = {
  recall: "#B3261E",
  restricted: "#5B4B8A",
  stale: "#8A5B00",
  staleTint: "#FBEFD2",
  stock: "#5C6660",
  signal: "#2C5F9E",
  sponsored: "#6E5527",
  sponsoredTint: "#F2E8D8",
} as const;

/* ------------------------------------------------------------------ */
/* §3 Typography                                                       */
/* ------------------------------------------------------------------ */

/** Self-hosted OFL families (public/assets/fonts); system-ui fallback only. */
export const FONT_FAMILIES = {
  display: '"Bricolage Grotesque", system-ui, sans-serif',
  body: '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif',
  data: '"Spline Sans Mono", ui-monospace, monospace',
} as const;
export type FontRole = keyof typeof FONT_FAMILIES;

export interface TypeStep {
  readonly face: FontRole;
  readonly sizePx: number;
  readonly linePx: number;
  readonly weight: number;
  readonly tracking: string;
  readonly uppercase?: boolean;
}

/** Modular scale from direction.md §3 (sizes/lines on the 4px baseline). */
export const TYPE_SCALE = {
  "display-xl": { face: "display", sizePx: 40, linePx: 44, weight: 800, tracking: "-0.02em" },
  "display-l": { face: "display", sizePx: 32, linePx: 36, weight: 700, tracking: "-0.015em" },
  title: { face: "display", sizePx: 24, linePx: 28, weight: 700, tracking: "-0.01em" },
  heading: { face: "display", sizePx: 20, linePx: 24, weight: 600, tracking: "-0.005em" },
  "body-l": { face: "body", sizePx: 18, linePx: 28, weight: 400, tracking: "0" },
  body: { face: "body", sizePx: 16, linePx: 24, weight: 400, tracking: "0" },
  label: { face: "body", sizePx: 14, linePx: 20, weight: 700, tracking: "+0.01em" },
  overline: { face: "data", sizePx: 12, linePx: 16, weight: 500, tracking: "+0.06em", uppercase: true },
  data: { face: "data", sizePx: 14, linePx: 20, weight: 400, tracking: "0" },
  "data-s": { face: "data", sizePx: 12, linePx: 16, weight: 400, tracking: "+0.01em" },
} as const satisfies Record<string, TypeStep>;
export type TypeStepName = keyof typeof TYPE_SCALE;

/** Totals promote to weight 500 within `data` (direction §3, §5). */
export const DATA_TOTAL_WEIGHT = 500;

/* ------------------------------------------------------------------ */
/* §4 Layout                                                           */
/* ------------------------------------------------------------------ */

/** --space-1 .. --space-9 in px. Nothing off-scale. */
export const SPACE_SCALE = [4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

/** --radius-0 .. --radius-3 in px. No pill shapes. */
export const RADII = [0, 4, 8, 16] as const;

export const BREAKPOINTS = { sm: 480, md: 768, lg: 1024, xl: 1280 } as const;

export const CONTAINERS = {
  /** Reading/flow column. */
  flow: 640,
  /** Plan + capsule views. */
  plan: 880,
  /** Basket comparison / Pareto views. */
  compare: 1120,
  /** Hard page max. */
  page: 1200,
} as const;
export type ContainerName = keyof typeof CONTAINERS;

export const ELEVATION = {
  card: "0 1px 2px rgba(37,48,42,0.08)",
  overlay: "0 8px 24px rgba(37,48,42,0.16)",
} as const;

/** 44px minimum hit target (direction §4 Touch). */
export const MIN_TOUCH_TARGET_PX = 44;

/** Focus-visible ring: 2px Chalk Green outline at 2px offset (direction §11). */
export const FOCUS_RING = { widthPx: 2, offsetPx: 2 } as const;

/* ------------------------------------------------------------------ */
/* Motion (direction §8)                                               */
/* ------------------------------------------------------------------ */

export const MOTION = {
  checkStrikeMs: 160,
  ledgerRecomputeMs: 120,
  sheetEntryMs: 200,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

/* ------------------------------------------------------------------ */
/* CSS custom-property generation                                      */
/* ------------------------------------------------------------------ */

export function tokensCss(): string {
  const lines: string[] = [":root {"];
  for (const [name, hex] of Object.entries(COLOR_TOKENS)) {
    lines.push(`  --color-${name}: ${hex};`);
  }
  for (const [name, hex] of Object.entries(STATUS_TOKENS)) {
    const prop = name === "staleTint" ? "stale-tint" : name === "sponsoredTint" ? "sponsored-tint" : name;
    lines.push(`  --status-${prop}: ${hex};`);
  }
  SPACE_SCALE.forEach((px, i) => lines.push(`  --space-${i + 1}: ${px}px;`));
  RADII.forEach((px, i) => lines.push(`  --radius-${i}: ${px}px;`));
  for (const [role, stack] of Object.entries(FONT_FAMILIES)) {
    lines.push(`  --font-${role}: ${stack};`);
  }
  for (const [step, def] of Object.entries(TYPE_SCALE) as [string, TypeStep][]) {
    lines.push(`  --text-${step}-size: ${def.sizePx}px;`);
    lines.push(`  --text-${step}-line: ${def.linePx}px;`);
    lines.push(`  --text-${step}-weight: ${def.weight};`);
    lines.push(`  --text-${step}-tracking: ${def.tracking.replace("+", "")};`);
  }
  for (const [name, px] of Object.entries(CONTAINERS)) {
    lines.push(`  --container-${name}: ${px}px;`);
  }
  lines.push(`  --elevation-card: ${ELEVATION.card};`);
  lines.push(`  --elevation-overlay: ${ELEVATION.overlay};`);
  lines.push(`  --touch-target: ${MIN_TOUCH_TARGET_PX}px;`);
  lines.push(`  --focus-ring-width: ${FOCUS_RING.widthPx}px;`);
  lines.push(`  --focus-ring-offset: ${FOCUS_RING.offsetPx}px;`);
  lines.push(`  --motion-check-strike: ${MOTION.checkStrikeMs}ms;`);
  lines.push(`  --motion-ledger: ${MOTION.ledgerRecomputeMs}ms;`);
  lines.push(`  --motion-sheet: ${MOTION.sheetEntryMs}ms;`);
  lines.push(`  --motion-easing: ${MOTION.easing};`);
  lines.push("}");
  return lines.join("\n");
}
