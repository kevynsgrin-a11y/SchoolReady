/**
 * Dark-pattern markers as code — Phase 9 (monetization-engineer), §5 of the
 * phase brief: no fake countdowns, no fabricated scarcity, no pre-checked
 * consent, no confirm-shaming, no interstitial takeovers. The route-tree
 * scan (src/monetization/route-scan.ts) sweeps every rendered page for
 * these; a hit is a build failure, exactly like a banned claim.
 *
 * Patterns match RENDERED HTML (entities escaped by src/ui/html.ts), so
 * they avoid apostrophes and use word boundaries to stay false-positive
 * safe. Extend the list rather than weakening a pattern.
 */

export interface DarkPatternMarker {
  readonly id: string;
  readonly pattern: RegExp;
  readonly description: string;
}

export const DARK_PATTERN_MARKERS: readonly DarkPatternMarker[] = [
  {
    id: "countdown",
    pattern: /data-countdown|class="[^"]*\bcountdown\b/i,
    description: "Countdown timers pressuring a purchase decision.",
  },
  {
    id: "fabricated_scarcity",
    pattern: /\b(only \d+ left|selling fast|almost gone|going fast|while supplies last|last chance)\b/i,
    description: "Scarcity claims we hold no sourced stock data to support.",
  },
  {
    id: "urgency_theatrics",
    pattern: /\b(hurry|act now|offer ends|expires soon|limited time)\b/i,
    description: "Urgency copy in commercial context (voice SS10 also bans it).",
  },
  {
    id: "prechecked_consent",
    pattern:
      /<input[^>]*type="checkbox"[^>]*name="[^"]*(consent|marketing|newsletter|subscribe|opt)[^"]*"[^>]*\schecked\b/i,
    description: "Consent or marketing checkboxes that default to checked.",
  },
  {
    id: "confirm_shaming",
    pattern: /\bno thanks, i (do not|don&#39;t) (want|need)\b/i,
    description: "Decline links worded to shame the user for declining.",
  },
] as const;

/** Returns the ids of every marker present in a rendered page. */
export function findDarkPatterns(page: string): string[] {
  return DARK_PATTERN_MARKERS.filter((m) => m.pattern.test(page)).map((m) => m.id);
}
