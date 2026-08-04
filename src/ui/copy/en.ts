/**
 * All user-facing copy for the UI (single locale for the beta).
 *
 * Voice rules (direction.md §10, binding): plain, active, specific; second
 * person; sentence case everywhere including buttons and headings; numbers
 * over adjectives; no exclamation points in UI chrome; no urgency theatrics;
 * buttons say what happens; errors say what went wrong and how to fix it;
 * empty states invite action; suppression states explain the refusal.
 *
 * No numeral in this file is invented: every number rendered to users is
 * interpolated from engine output, envelope data, or an imported constant.
 * This directory sits under the banned-claims + no-emoji lint roots.
 */

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const COMMON = {
  skipToContent: "Skip to main content",
  fixtureNotice:
    "Validation beta: every price, list, and signal on this page comes from labeled synthetic fixture data, not live feeds.",
  navHome: "Home",
  navIntake: "Add a list",
  navPlan: "Shopping plan",
  navChecklist: "Checklist",
  navBasket: "Compare baskets",
  navCapsule: "Clothing capsule",
  navTrends: "Worth-it radar",
  navSafety: "Recalls and safety",
  navBudget: "Budget",
  navDeals: "Tax holidays",
  navHousehold: "Household",
  navAccount: "Alerts and privacy",
  navMethodology: "How the math works",
  navStatus: "Data sources",
  footerLicenses: "Type and icon licenses",
  offline: "You are offline. Your checklist keeps working; prices and lists will refresh when the connection returns.",
  backOnline: "Connection restored. Data on this page may be out of date until you reload.",
  loading: "Loading",
  retry: "Try again",
  print: "Print this checklist",
} as const;

export const ERRORS = {
  rateLimited: (retryAfterSeconds: number | null): string =>
    retryAfterSeconds === null
      ? "You sent requests faster than this beta allows. Wait a moment, then try again."
      : `You sent requests faster than this beta allows. Wait ${retryAfterSeconds} ${plural(retryAfterSeconds, "second", "seconds")}, then try again.`,
  generic:
    "Something went wrong on our side and nothing was saved. Reload the page to try again; if it keeps failing, the data sources page shows what is degraded.",
  validation:
    "Some fields could not be accepted. Check the highlighted entries against the allowed choices and submit again.",
  uploadUnavailable:
    "This upload expired before parsing finished. Uploads are held for a few minutes only, then deleted. Upload the photo again.",
  uploadUnreadable:
    "We could not read this file in the beta. Live photo parsing is off until its data source is licensed, so paste the list text or type the items in instead.",
  provenanceSuppressed:
    "We suppressed this response instead of showing a fact we could not source. Try again; if it persists, check the data sources page.",
  notFound: "There is no page at this address. Use the navigation to get back to your plan.",
  basketTooLarge:
    "This plan has too many item and store combinations to compare at once. Split the list across two runs, or remove optional items, then compare again.",
} as const;

export const SUPPRESSION = {
  heading: "Held back, and why",
  missingProvenance:
    "Not shown: this fact arrived without a complete source record, so we will not display it.",
  unresolvedProvenance:
    "Not shown: this fact cites a source record we could not resolve, so we will not display it.",
  incompleteRecord:
    "Not shown: this fact's source record is missing required fields, so we will not display it.",
  expired:
    "Not shown: this fact's source data has expired. We show nothing rather than a stale value; it returns once the source refreshes.",
  retracted:
    "Not shown: the source retracted this fact. It will not return unless the source republishes it.",
  underReview:
    "Not shown: this fact is under review at its source. It returns when the review resolves.",
  totalsHeldBackNote: (count: number): string =>
    count === 1
      ? "1 required line was held back above and is not counted in these totals; the note on that line explains why."
      : `${count} required lines were held back above and are not counted in these totals; the notes on those lines explain why.`,
  reasonLabels: {
    stale_or_unverified_list: "This list is stale or not yet confirmed, so its items render as unverified.",
    unresolved_product_variant:
      "This product's exact variant is not confirmed, so we are not counting it toward your total yet.",
    price_stock_stale: "This price or stock reading is older than our threshold, so it is hidden or flagged.",
    single_signal_family_trend:
      "Not enough independent evidence to call this trending, so no trend label is shown.",
    unconfirmable_school_policy:
      "We cannot confirm this school policy from an official source, so the policy filter is off.",
    recalled_or_under_review: "This product matches a recall or is under safety review, so it is excluded.",
    affiliate_neutral_conflict:
      "A retailer-fed value conflicts with a neutral source, so we show neither until they agree.",
    deadline_unmeetable: "This option cannot meet your deadline with confidence, so it is flagged.",
  } as Record<string, string>,
} as const;

export const BADGES = {
  required: "Required",
  useful: "Useful",
  optional: "Optional",
  trending: (passing: number, total: number): string => `Trending (${passing} of ${total} signal families)`,
  cooling: "Cooling",
  insufficientEvidence: "Not enough evidence",
  sponsored: "Sponsored",
  recalled: "Recalled",
  outOfStock: "Out of stock",
  schoolRestricted: "Restricted by school policy",
  schoolRestrictedShort: "School-restricted",
  stale: (lastCheckedDate: string): string => `Prices last checked ${lastCheckedDate} — rechecking`,
  paidCampaign: "Driven by paid promotion",
  locallyPopular: "Popular in one region",
} as const;

export const PROVENANCE = {
  observed: "observed",
  retrieved: "retrieved",
  confidence: "confidence",
  limitations: "Limitations",
  correctionCorrected: "Corrected by the source",
  moreSources: (n: number): string => `and ${n} more ${plural(n, "source", "sources")}`,
} as const;

export const HOME = {
  title: "Turn the supply list into a finished errand",
  lead:
    "For parents of K-8 kids: paste the school supply list and get back a checked, de-duplicated shopping plan across stores — with every number's math shown and every price's source dated.",
  heroCta: "Parse this list",
  heroInputLabel: "Paste your school's supply list",
  heroAlt: "Or type items in one by one, or upload a photo of the handout.",
  stepParseTitle: "You confirm what we read",
  stepParse:
    "The parser proposes a structured reading of every line and you approve it. Nothing is saved until you confirm.",
  stepMergeTitle: "We subtract what you own",
  stepMerge:
    "Lists from every child merge into one plan, minus what is already at home. The subtraction is shown, not summarized.",
  stepCompareTitle: "You choose among honest baskets",
  stepCompare:
    "Store comparisons include pack sizes, tax, shipping, and stop count — and return a set of trade-offs, never a single answer we picked for you.",
  safetyTitle: "Checked against CPSC recalls",
  safety:
    "Every plan is checked against the CPSC recall feed, and recall warnings always render above anything commercial.",
  methodologyLink: "Read how every number is computed",
} as const;

export const INTAKE = {
  title: "Add a supply list",
  lead: "Paste the list, type items in, or upload a photo or PDF of the handout. You review everything before it is saved.",
  tabPaste: "Paste text",
  tabManual: "Type items",
  tabUpload: "Upload a photo or PDF",
  pasteLabel: "Supply list text",
  pasteSubmit: "Parse this list",
  manualLegend: "One item",
  manualProduct: "Product",
  manualQuantity: "Quantity",
  manualUnit: "Unit",
  manualColor: "Color (if the list names one)",
  manualRuling: "Ruling (paper and notebooks)",
  manualOptionality: "Is it required?",
  manualSubmit: "Add this item and review",
  uploadLabel: "Photo or PDF of the list",
  uploadSubmit: "Upload and parse",
  uploadPrivacy:
    "Uploads are parsed in memory, held for minutes at most, then deleted. Names, teachers, and room numbers are stripped before anything is shown back to you.",
  reviewTitle: "Confirm what we read",
  reviewLead:
    "The parser proposes; you decide. Fix anything it got wrong, resolve the flagged lines, then save the list. Unresolved lines are left out rather than guessed at.",
  reviewOriginal: "The list said",
  reviewProposed: "We read that as",
  reviewConfidence: "confidence",
  reviewNeedsAttention: "Needs your call",
  reviewUnparsed: "We could not read this line. Add it with the item form if it matters.",
  reviewCandidates: "Which product did the list mean?",
  reviewExclude: "Leave this line out",
  reviewRedaction: (count: number): string =>
    `${count} personal ${plural(count, "detail was", "details were")} removed before display and will never be stored.`,
  reviewChild: "Whose list is this?",
  reviewChildOption: (ordinal: number): string => `Child ${ordinal}`,
  reviewNewChild: (ordinal: number): string => `Add child ${ordinal}`,
  reviewGrade: "Grade",
  reviewGradeNone: "Not set",
  reviewYear: "School year",
  reviewState: "State (for tax estimates, optional)",
  reviewStateNone: "Not set",
  confirmSubmit: (count: number): string =>
    `Save ${count} confirmed ${plural(count, "item", "items")}`,
  confirmNone: "Resolve at least one line to save this list",
  emptyParse:
    "Nothing parseable came out of that input. Paste the list text itself (not a link), or type the first item in.",
  skipped: (count: number): string =>
    `${count} ${plural(count, "line was", "lines were")} skipped as headings or notes.`,
} as const;

export const HOUSEHOLD = {
  title: "Your household",
  lead:
    "Children are numbered, never named. Mark what is already at home and we subtract it from every child's list.",
  membersTitle: "Children",
  membersEmpty: "No lists yet, so no children yet. Save a supply list and its child appears here.",
  memberLabel: (ordinal: number): string => `Child ${ordinal}`,
  stateTitle: "State",
  stateLead: "Used only to estimate sales tax and tax-holiday timing. Leave it unset and we skip tax math.",
  stateCurrent: (state: string): string => `State on file: ${state}`,
  stateUnset:
    "No state on file. Set it when you save a list, or per comparison on the basket page — never required.",
  inventoryTitle: "Already at home",
  inventoryEmpty:
    "Nothing marked as owned. Walk through what is already at home and we subtract it from every child's list.",
  inventoryProduct: "Product",
  inventoryQuantity: "How many",
  inventoryCondition: "Condition",
  conditionNew: "New",
  conditionUsable: "Usable",
  conditionWornOut: "Worn out (will not count)",
  inventoryAdd: "Mark as already owned",
  inventoryListed: (count: number): string =>
    `${count} ${plural(count, "item", "items")} marked as already at home`,
} as const;

export const PLAN = {
  title: "Merged shopping plan",
  lead: "Every child's list, merged and de-duplicated, minus what you already own. Tap any number to see the receipt behind it.",
  empty:
    "No lists yet. Paste your school's supply list, snap a photo of it, or type the first item.",
  emptyCta: "Add the first list",
  requiredLine: "Required",
  ownedLine: "Already at home",
  reserveLine: "Reserved for later in the year",
  toBuyLine: "To buy",
  toBuyWholeLine: "To buy (whole units)",
  perChild: (ordinal: number): string => `Child ${ordinal}`,
  wholePlanTitle: "Whole plan",
  planRequired: (memberCount: number): string =>
    memberCount === 1 ? "Required (one child)" : `Required (${memberCount} children)`,
  mixedShareability: "Members disagreed on sharing this; we summed conservatively.",
  goChecklist: "Open the in-store checklist",
  goBasket: "Compare baskets across stores",
  listFindingsTitle: "List status",
} as const;

export const CHECKLIST = {
  title: "In-store checklist",
  lead: "Big targets, works offline, and crossing an item off is the point.",
  empty: "The checklist is empty because no plan exists yet. Save a supply list first.",
  emptyCta: "Add a list to build the checklist",
  storeMode: "Switch to aisle mode (bigger targets)",
  fullMode: "Switch to full view",
  progress: (done: number, total: number): string => `${done} of ${total} crossed off`,
  /** Client-enhancement template; app.js substitutes engine-counted values. */
  progressTemplate: "{done} of {total} crossed off",
  itemToBuy: (units: number): string => `Buy ${units}`,
  offlineReady: "Saved for offline use. Losing signal in the aisle will not lose this list.",
  generatedAt: (date: string): string => `Checklist generated ${date}`,
} as const;

export const BASKET = {
  title: "Compare baskets across stores",
  lead:
    "Landed cost means items plus tax plus shipping, counted per store trip. There are four honest ways to slice it — we never collapse them into one answer.",
  emptyNoPlan: "Nothing to compare yet. Save a supply list and the stores line up here.",
  emptyNothingToBuy: "Nothing left to buy: your inventory already covers every required item on the plan.",
  infeasible:
    "No store combination covers every required item right now. The gaps are listed below; fix what you can or check back after prices refresh.",
  viewLowestCost: "Lowest cost",
  viewFewestStops: "Fewest stops",
  viewFastest: "Fastest",
  viewHighestConfidence: "Highest confidence",
  viewExplainer:
    "Each view is the frontier option that wins on that one axis. Every option shown is undominated: nothing beats it on cost, stops, speed, and confidence at once.",
  frontierTitle: (n: number): string => `${n} undominated ${plural(n, "option", "options")}`,
  landedCost: "Landed cost",
  itemsSubtotal: "Items",
  tax: "Tax",
  shipping: "Shipping",
  stops: (n: number): string => `${n} ${plural(n, "stop", "stops")}`,
  deliveryDays: (n: number): string => `up to ${n} ${plural(n, "day", "days")} to deliver`,
  deliveryUnknown: "delivery time unknown",
  costIncomplete: "Shipping unknown for part of this option, so the landed cost is incomplete.",
  lowConfidence: (n: number): string => `${n} low-confidence ${plural(n, "price", "prices")}`,
  taxCaveatsTitle: "Tax caveats",
  assumptionsTitle: "Labeled assumptions in this math",
  excludedTitle: "Why some offers are not shown",
  unfulfillableTitle: "Items no store can cover",
  coveredTitle: (n: number): string =>
    `${n} required ${plural(n, "line is", "lines are")} already covered by inventory`,
  optionalExcludedTitle: (n: number): string =>
    `${n} optional ${plural(n, "line", "lines")} left out of the default basket on purpose`,
  deadlineLabel: (days: number): string => `Needed in ${days} ${plural(days, "day", "days")}`,
  deadlineForm: "Days until you need everything",
  deadlineApply: "Recheck deadlines",
  stateForm: "State for tax math",
  perRetailer: (retailer: string): string => `${retailer} trip`,
} as const;

export const CAPSULE = {
  title: "Clothing capsule",
  lead:
    "How many tops, bottoms, and layers actually cover a school week for your wash cadence. Results are ranges, because the inputs are ranges.",
  formLegend: "Your inputs",
  category: "Garment",
  categoryTops: "Tops",
  categoryBottoms: "Bottoms",
  categoryOuter: "Outer layer",
  categorySocks: "Socks",
  climate: "Climate",
  climateHot: "Hot",
  climateTemperate: "Temperate",
  climateCold: "Cold",
  washDays: "Days between washes",
  reserveDays: "Buffer days (spills, missed laundry)",
  usableExisting: "Usable pieces already owned",
  uniformRequired: "School requires a uniform",
  submit: "Compute the capsule range",
  rangeUnits: (min: number, max: number): string =>
    min === max ? `${min} to ${min}` : `${min} to ${max}`,
  rewears: (min: number, max: number): string =>
    `assumes ${min} to ${max} wears per piece between washes`,
  dressCodeOff:
    "We cannot confirm this school's dress code from an official source, so the capsule filter is off. You can apply the district's published policy manually.",
  timingTitle: "Buy now or wait?",
  timingBuyNow: "Buy now",
  timingWait: "Waiting is reasonable",
  timingInsufficient: "Not enough price history to compare",
  empty: "Enter a wash cadence and at least one garment category to compute a range.",
} as const;

export const TRENDS = {
  title: "Worth-it radar",
  lead: (min: number): string =>
    `Separates popular from worth buying. A trend label needs at least ${min} independent signal families with organic evidence; anything less says so plainly.`,
  empty:
    "No plan items to evaluate yet. Save a supply list and each item's evidence shows up here.",
  emptyCta: "Add a list to see evidence",
  cardEvidence: "Evidence by signal family",
  familyPasses: "passes",
  familyFails: "does not pass",
  confidence: "Evidence confidence",
  reasonsTitle: "How this label was decided",
  insufficientBody: (passing: number, needed: number): string =>
    `Not enough evidence to call this trending. It has organic signal in ${passing} ${plural(passing, "family", "families")}; we need at least ${needed} independent ones.`,
  detailLink: "Full evidence and provenance",
} as const;

export const ITEM = {
  titleSuffix: "evidence and safety",
  trendTitle: "Trend evidence",
  recallTitle: "Recall status",
  recallNoUpc:
    "The fixture catalog has no UPC on file for this product type, so no recall match can be attempted here. Check a specific UPC on the recalls page.",
  recallCheckLink: "Check a UPC against CPSC recalls",
  disclosureTitle: "How we make money on this page",
  disclosureNone:
    "Nothing on this page is paid placement. No affiliate relationship exists in this beta; if links ever pay us, they will be labeled Sponsored right here, and commissions will still never touch rankings.",
  unknownProduct: "This product type is not in the beta catalog. The worth-it radar lists the ones that are.",
} as const;

export const SAFETY = {
  title: "Recalls and safety",
  lead:
    "CPSC recall matches for school products. Safety warnings always render above everything else on every page, and no payment or setting can hide them.",
  checkLegend: "Check a product's UPC",
  checkLabel: "UPC from the product's barcode",
  checkSubmit: "Check this UPC against recalls",
  matches: (n: number): string => `${n} recall ${plural(n, "match", "matches")} for this UPC`,
  noMatch:
    "No recall match for this UPC in the current CPSC data. That is a check against known recalls, not a safety endorsement.",
  listTitle: "Recalls affecting school products",
  listEmpty: "No recalls in the current data set. The source and its retrieval date are shown below.",
  hazard: "Hazard",
  remedy: "Remedy",
  credit: "Recall data: U.S. Consumer Product Safety Commission (public domain), retrieved as dated.",
  alertCta: "Get an in-app alert if a recall lands on your plan",
} as const;

export const BUDGET = {
  title: "Budget",
  lead:
    "Required spend only — optional items never inflate the plan total. Ranges come from the basket frontier, not from one store we picked.",
  empty: "No plan, no budget yet. Save a supply list and the ledger appears here.",
  emptyCta: "Start with a list",
  requiredSpendTitle: "Required items to buy",
  perChildTitle: "Units by child",
  frontierTitle: "What the plan costs across honest options",
  frontierRange: (n: number): string =>
    `Across ${n} undominated basket ${plural(n, "option", "options")}:`,
  rangeLabel: "Landed-cost range",
  costIncompleteMark: "* shipping unknown for part of this option",
  noBasket: "No priced basket yet. Prices attach once you run the store comparison.",
  goBasket: "Run the store comparison",
  optionalNote: (n: number): string =>
    `${n} optional ${plural(n, "line is", "lines are")} tracked but never added to required spend.`,
} as const;

export const DEALS = {
  title: "Sales-tax holidays",
  lead:
    "State tax-holiday windows can remove sales tax from school supplies. Calendars here are fixture data and unverified; verify with your state's revenue department before counting on a date.",
  noState:
    "No state on file, so no calendar applies. Set your state on the household page and tax math turns on.",
  setState: "Set your state",
  empty:
    "No verified tax-holiday window for your state in the current data. When a verified window exists, it appears here with its source and dates.",
  caveatsTitle: "Caveats that apply to every date below",
  windowApplied: "Applied to your basket math as a caveated estimate — never as a promise.",
  basketLink: "See the effect in your basket comparison",
} as const;

export const METHODOLOGY = {
  title: "How the math works",
  lead:
    "Every number this product shows is computed from a cited source or labeled as an assumption. This page is the audit trail.",
  parsingTitle: "Parsing: propose, never guess",
  parsingBody:
    "List parsing proposes a structured reading and routes every ambiguity to you. Nothing persists until you confirm it, and unresolved lines stay out of the math.",
  netTitle: "Net-required math",
  netBody:
    "Requirements merge across children by product and variant; usable inventory subtracts; what remains is what you buy. The subtraction renders as written arithmetic so you can check it.",
  basketTitle: "Landed cost and the frontier",
  basketBody:
    "A basket's cost is items plus tax plus shipping per store trip. We return every undominated option across cost, stops, delivery time, and confidence. Collapsing that into one winner would mean hiding a trade-off, so we refuse.",
  trendTitle: "Trend evidence",
  trendBody: (minFamilies: number, totalFamilies: number): string =>
    `A trend label requires at least ${minFamilies} of ${totalFamilies} independent signal families to pass minimum evidence thresholds with organic (not paid) signal. Below that, the honest label is "not enough evidence" — and that is the default.`,
  suppressionTitle: "When we refuse to show a number",
  suppressionBody:
    "Suppression beats guessing. These triggers hide or downgrade output, each with its reason shown in place of the fact:",
  provenanceTitle: "Provenance on every fact",
  provenanceBody: (fieldCount: number): string =>
    `Every rendered fact carries a ${fieldCount}-field source record: source, source type, observation date, retrieval time, geography, transform version, freshness, confidence, limitations, and correction status. A fact without one does not render — the interface refuses.`,
  stalenessTitle: "Freshness thresholds",
  stalenessBody: (downgradeHours: number, suppressDays: number): string =>
    `Prices and stock older than ${downgradeHours} hours render only with a stale flag; older than ${suppressDays} days they do not render at all.`,
  moneyTitle: "How money works here",
  moneyBody:
    "Commissions never touch match scores, worth-it labels, or basket math — that separation is enforced by automated tests, not policy. Nothing commercial ever sits between you and a required item, a safety warning, or a deadline.",
  recallTitle: "Recall checking",
  recallBody:
    "Products are matched against CPSC recall data by UPC. A recalled product leaves every basket before optimization starts.",
} as const;

export const ACCOUNT = {
  title: "Alerts, privacy, and your data",
  lead: "There is no account and none is ever required. Your plan lives behind an anonymous cookie.",
  alertsTitle: "In-app alerts",
  alertsLead:
    "Alerts surface here when you return — there is no email or phone number to give us, on purpose.",
  alertKind: "Alert me about",
  alertRecall: "A recall matching my plan",
  alertPrice: "A price change on a plan item",
  alertDeadline: "A shopping deadline at risk",
  alertCorrection: "A correction to a saved list",
  alertSubmit: "Add this alert",
  alertsEmpty: "No alerts set. Add one and it shows up here on your next visit.",
  alertsListed: (n: number): string => `${n} active ${plural(n, "alert", "alerts")}`,
  privacyTitle: "What we know about you",
  privacyBody:
    "An anonymous cookie links this browser to its plan. Child names, teacher names, classrooms, addresses, exact sizes, and budgets are stripped at the door and never stored, logged, or sent to anyone.",
  exportTitle: "Take your plan with you",
  exportBody: "The printable checklist is the export: every net quantity with its math.",
  exportCta: "Open the printable checklist",
  deleteTitle: "Walk away",
  deleteBody:
    "Clearing this site's cookies detaches this browser from its plan permanently; nothing identifies you to re-link it. A one-click server-side purge ships with the compliance phase of this beta and will appear here.",
  passTitle: "Season Pass",
  passActive: "Season Pass active: extras are ad-free. Core data was identical before you paid.",
  passNone: "No Season Pass. Nothing on the core plan is behind it.",
} as const;

/**
 * PROVISIONAL COPY — Phase 9 (monetization-engineer). compliance-officer
 * (Phase 10) owns the final FTC-facing wording of every string in this block
 * and must review it before ANY live affiliate link or paid checkout ships.
 * Voice §10 applies; no urgency theatrics, no scarcity, no countdowns (§5).
 */
export const MONETIZATION = {
  /** Rendered ADJACENT to every monetized link by renderMonetizedLink — never footnote-only. */
  affiliateDisclosure:
    "Paid link: the retailer pays this site a commission if you buy through it. Commissions never change the prices shown or how options are ordered.",
  /** Accessible name prefix for monetized anchors ("<retailer> (paid link)"). */
  affiliateLinkSuffix: "(paid link)",
  passExplainer:
    "The Season Pass is a one-time purchase that removes sponsored units from editorial extras. It never changes your plan, prices, comparisons, safety warnings, or deadlines — those are identical for everyone, pass or no pass.",
  passCheckoutTitle: "Season Pass checkout",
  passCheckoutUnavailable:
    "Checkout is switched off in this validation beta: no payment can be taken and no card form exists. This entry point activates when payments launch.",
  passActiveThrough: (date: string): string => `Active through ${date}.`,
  passAdFree: "Sponsored units are off for you, including on editorial pages.",
} as const;

export const STATUS = {
  title: "Data sources",
  lead:
    "Live health of every data source this beta reads, including what is stale, what is degraded, and what is deliberately switched off.",
  sourceCol: "Source",
  freshnessCol: "Freshness",
  circuitCol: "Circuit",
  modeCol: "Mode",
  fresh: "Fresh",
  staleAged: (hours: number): string => `Stale (${hours} ${plural(hours, "hour", "hours")} old)`,
  ageUnknown: "Age unknown",
  circuitClosed: "Closed (healthy)",
  circuitOpen: "Open (failing, cooling down)",
  circuitHalfOpen: "Half-open (probing)",
  live: "Live",
  fixture: "Fixture data (live feed off)",
  degradedCache: "Serving from cache fallback",
  degradedUnavailable: "Unavailable",
  none: "No source-fed responses observed for this page load.",
} as const;
