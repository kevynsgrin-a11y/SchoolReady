# Launch checklist — open preconditions with owners

- Owner of this list: release-qa (Phase 12). Status date: 2026-08-05.
- Plain statement, per the release mandate: **the beta is NOT releasable
  until every item below clears.** Each item is independently blocking.
  The congruence gate (docs/release/congruence-gate.md) passed every line
  this environment can prove; these are the lines it cannot, plus the
  product and legal blockers it surfaced. Nothing here is optional polish.

## 1. Brand, domain, legal entity — owner: repository owner

- **PARTIALLY DISCHARGED 2026-08-04.** The repository owner purchased the
  domain in `config/brand.ts` `domain` through Cloudflare Registrar;
  `config/brand.ts` now carries the real working name/wordmark, domain,
  and support email (the ONLY file that may carry them —
  `tests/config.test.ts` enforces isolation, including against this
  document). See the launch runbook alongside this file for the
  Cloudflare provisioning + deploy steps this unblocks.
- **Still open: `legalEntity: "UNSET — no legal entity formed"`.** No
  agent may invent a legal person — this needs the repository owner's
  actual business name (sole proprietorship under your legal name, an
  LLC, etc.). The privacy policy / incident contact have no legal person
  behind them until it clears. Still open: favicon + manifest icons
  (clears the only Lighthouse console error and PWA installability,
  Phase 7 §7) and the real wordmark/logo graphic (current wordmark is
  text-only).

## 2. Human assistive-technology pass — owner: repository owner (schedule); accessibility-qa (checklist author)

- No real screen reader exists in this environment. Phase 11 §9 is a
  labeled semantic analysis, NOT an AT recording; §10 of
  `docs/a11y/audit-phase-11.md` is the binding 8-item checklist
  (NVDA/JAWS/VoiceOver/TalkBack journey walks, recall-intercept
  announcement order, checklist live-region behavior, details-receipt
  announcement, forced-colors chip grammar, 200%-zoom/320px reflow, mobile
  screen reader in store mode, speech input).
- To clear: run all 8 items with real AT, record reader/browser/commands/
  outcomes per item. Any failure routes back through accessibility-qa
  before release. Re-verify item 2's announcement order against the
  P12-3-fixed intercept (card content inside the banner).

## 3. Real-device and cross-browser pass — owner: repository owner

- Congruence line 15 is BLOCKED-ENV (Chromium only here). To clear,
  execute the plan in congruence-gate.md line 15: WebKit + Firefox
  Playwright runs of both suites, real iPhone Safari + real Android
  Chrome first-time-user walks of the three journeys and congruence lines
  1/7/9, desktop Safari + Firefox walks. Record results per
  device/browser; any failure blocks.

## 4. Per-source licensing sign-offs — owner: repository owner + compliance-officer

- **Cloudflare infrastructure discharged 2026-08-05.** The D1 database, KV
  namespace, Queue, Worker routes, and R2 upload-buffer bucket are provisioned;
  see the launch runbook. No live-source flag may flip without a
  Permitted-fetch ruling recorded in
  `docs/compliance/licensing-register.md` — the test suite fails a flip
  without its ruling (this is enforced, not aspirational). Go-live
  preconditions are itemized per source in the register (NCES CCD, CPSC
  recalls, per-state tax holidays, affiliate feeds: deny-all until
  contracts + compliance review).
- Affiliate posture: the FIRST live affiliate link and the FIRST live
  checkout each require a fresh compliance-officer review recorded in a
  handoff (`src/ui/copy/en.ts` MONETIZATION block note).

## 5. `LHCI_ENABLED=true` repository variable — owner: repository owner (repo admin)

- The Lighthouse budget job is wired in CI and the config is proven
  runnable (Phase 11 D6 fix; all budgets green locally, Phase 12
  re-execution archived in docs/release/artifacts/). This environment has
  no repo-admin credentials. To clear: set the repository variable; watch
  one CI run go green.

## 6. Browser suites required in CI — owner: repository owner (repo admin)

- The `browser-suites` job (test:a11y 65 + test:e2e 14 after the item-7
  correction round) is wired
  NON-BLOCKING (`continue-on-error: true`) because it needs Chromium
  setup time and one proven-stable run on shared runners before it can
  gate merges. To clear: after its first green runs, remove
  `continue-on-error` and add the job to branch protection. The three §6
  journeys must be green in CI at launch — this is the acceptance
  criterion, and it is not met by local runs alone.

## 7. §6 journey-3 outcomes fully surfaced (P12-1, P12-2) — DISCHARGED 2026-08-04 (correction round)

- Was: P12-1 (cost-per-wear surfaced by no route or screen) and P12-2
  (buy-now-vs-wait unreachable — the capsule form sent `timing: null`,
  documented gap since Phase 7 §7).
- Discharged via option (a), the small additive work: `/api/capsule` now
  returns `costPerWear` per category line (`src/api/contracts.ts` +
  `src/api/routes.ts`, engine helpers verbatim, wears basis as labeled
  assumptions); the capsule form ships an optional price/timing fieldset
  (`src/ui/screens/capsule.ts`, wired in `src/ui/server.ts` `/capsule`
  POST, copy in `src/ui/copy/en.ts`); cost-per-wear renders as a Sum Rule
  money fact through `renderFact` and the timing verdict renders both
  branches with reasoning + no-forecast disclaimer in the deadline
  section.
- Evidence: journey-3 E2E extended (UI-driven cost-per-wear + both timing
  branches + response-contract assertions), `tests/ui-screens.test.ts`
  +5 capsule state tests, `tests/api-policy.test.ts` +2 contract tests,
  `docs/release/screenshots/capsule-cost-per-wear-mobile.png`;
  congruence-gate journey 3 = PASS. Erratum recorded in
  `docs/handoffs/13-release-qa-12.md`.

## 8. Live Turnstile + Stripe verification — owner: repository owner + monetization-engineer + compliance-officer

- The beta ships with fixture verifiers (labeled pass tokens / fixture
  webhook signatures); the LIVE verifiers are throwing stubs by
  construction, so nothing false can ship — but that also means upload
  bot-protection is fixture-grade at launch. Before any live checkout or
  real Turnstile enforcement: wire real keys as Worker secrets, implement
  the live verifiers, re-run the Phase 9 dark-pattern + paywall
  byte-identity suites against the live path, and record the
  compliance-officer review (see item 4).

---

Standing re-verification before the release commit: `npm run verify`
green (821 tests / 57 files as of the 2026-08-05 deployment),
`npm run test:a11y` 65/65, `npm run test:e2e` 14/14 (was 13/13),
congruence gate re-walked on the REAL staging URL (not local wrangler
dev) on a real phone and desktop browser as a first-time user — every
line must pass there too; any failure blocks release.
