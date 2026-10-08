// P1 (Money Inbox command layer) — the CONTRACTS.
//
// DATA ONLY plus tiny lookups. No database, no React, no router, no clock, no
// randomness. Every contract here is deeply frozen.
//
// WHAT A CONTRACT IS: a written-down promise about one kind of thing the user can
// ask Money Inbox for — who owns it, what it can turn into, how risky it is, what
// the layer must know to prepare it, and what the OWNER'S OWN FORM will insist on
// before it lets the user save. The command layer never writes data itself: it
// understands, prepares, and hands off. The owning feature confirms and writes.
//
// THE FOUR STATES (the app's own words — see components/ui/ValueBadge.jsx):
//   becomes   what the thing turns into IF the owner confirms:
//             'actual' (a record of something that happened), 'planned', or
//             'none' (a read-only answer).
//   kind      the state of one FIELD's value: actual | planned | calculated |
//             estimated | suggested.
//   origin    where a field's value came from: typed (the user's own words) |
//             matched (found by name in the user's own data) | default (a
//             documented default was applied) | engine (an existing engine
//             produced it).
// 'calculated' means an existing engine worked it out from RECORDED data (a spend
// total); 'estimated' means it is not a record (take-home pay, PF figures).
//
// required vs ownerRequires: `required` is what THIS LAYER needs before it can
// prepare or hand off. `ownerRequires` is what the owner's own form insists on
// before it lets the user save — the layer never fills those itself.

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

// ---------- vocabulary ----------
export const INTENT_CLASSES = deepFreeze(['RECORD', 'CREATE', 'MODIFY', 'QUERY', 'NAVIGATE'])
export const OWNERS = deepFreeze(['transactions', 'goals', 'budgets', 'learning', 'queries', 'router'])
export const FLOWS = deepFreeze(['review-drawer', 'owner-dialog', 'owner-page-flow', 'result-dialog', 'router'])
export const HANDOFF_FLOWS = deepFreeze(['owner-dialog', 'owner-page-flow', 'router'])
export const RISKS = deepFreeze(['read', 'create', 'change', 'financial-write'])
export const BECOMES = deepFreeze(['actual', 'planned', 'none'])
export const FIELD_KINDS = deepFreeze(['actual', 'planned', 'calculated', 'estimated', 'suggested'])
export const FIELD_ORIGINS = deepFreeze(['typed', 'matched', 'default', 'engine'])
export const ANSWER_KINDS = deepFreeze(['calculated', 'estimated'])
export const NOTICES = deepFreeze(['ESTIMATE_NOT_PAYMENT_RECORD', 'SALARY_ESTIMATE_NOT_RECEIVED'])

// Situations in which the layer must ask instead of guessing.
export const ASK_CONDITIONS = deepFreeze([
  'competing_meaning', 'goal_ambiguous', 'goal_reference_unresolved', 'month_unclear',
  'category_unknown', 'category_ambiguous', 'budget_not_found', 'item_ambiguous',
  'item_not_found', 'item_name_unclear', 'period_unclear', 'account_unclear', 'page_ambiguous',
])

// Why a clarification ("what did you mean?") is shown.
export const CLARIFY_REASONS = deepFreeze([
  'competing_meaning', // "I need 50000 for a laptop"
  'bare_word', // "laptop"
  'mixed_input', // a command and a transaction in one message (decision 5)
  'ambiguous_reference', // several goals, or "it" with nothing to refer to
  'missing_required', // a command with a required field absent
])

// The only pages NAVIGATE may open (decision 2). Aliases such as "PF" are P3's job.
export const ALLOWED_PAGES = deepFreeze([
  { id: 'transactions', route: '/transactions', label: 'Transactions' },
  { id: 'goals', route: '/goals', label: 'Goals' },
  { id: 'budgets', route: '/budgets', label: 'Budgets' },
  { id: 'learning', route: '/learning', label: 'Learning ROI' },
  { id: 'salary', route: '/salary', label: 'Salary' },
  { id: 'pension', route: '/pf-pension', label: 'PF / Pension' },
])

export function pageRoute(pageId) {
  const page = ALLOWED_PAGES.find((p) => p.id === pageId)
  if (!page) throw new Error(`Not an allowed page: ${pageId}`)
  return page.route
}

// ---------- phases and availability ----------
export const PHASE_ORDER = deepFreeze(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13'])
// The last phase that has been BUILT. Each phase changes this one line, on purpose,
// and the test that pins it changes with it. It stops the screen from ever handing
// off to an owner that is not built yet.
export const BUILT_THROUGH = 'P9'

export function phaseIndex(phase) {
  const i = PHASE_ORDER.indexOf(phase)
  if (i < 0) throw new Error(`Unknown phase: ${phase}`)
  return i
}

// ---------- the 15 contracts ----------
const defaults = () => ({
  required: [], requireOneOf: [], optional: [], ownerRequires: [], askWhen: [],
  mayBeEstimated: [], mayBeSuggested: [], answerKind: null, notice: null,
  ownerRules: [], stateRules: [], seeMore: null, followUp: null, examples: [],
})
const make = (c) => ({ ...defaults(), ...c })

// What the review screen (ReviewDrawer.canConfirmRow) insists on. Drift-checked.
const REVIEW_SCREEN_REQUIRES = ['amount', 'type', 'account', 'toAccount']
const TRANSFER_NOTE = 'A destination account is only required when the type is transfer'

const LIST = [
  make({
    id: 'RECORD_TRANSACTION', class: 'RECORD', owner: 'transactions', flow: 'review-drawer', route: null,
    becomes: 'actual', risk: 'financial-write', needsConfirmation: true, confirmedIn: 'review-drawer',
    required: ['amount'], optional: ['type', 'date', 'account', 'toAccount', 'category', 'spendingContext'],
    ownerRequires: REVIEW_SCREEN_REQUIRES, ownerRules: [TRANSFER_NOTE],
    stateRules: ['Today\'s path: the existing parser and review screen, unchanged'],
    availableFrom: 'P0',
    examples: [
      'coffee 80', 'salary 25000', 'rent 8000', 'moved 2000 from SBI to wallet',
      'salary 25k received and rent 4k paid', 'had dinner with friends and spent 600',
    ],
  }),
  make({
    id: 'RECORD_SALARY', class: 'RECORD', owner: 'transactions', flow: 'review-drawer', route: null,
    becomes: 'actual', risk: 'financial-write', needsConfirmation: true, confirmedIn: 'review-drawer',
    optional: ['amount', 'date', 'account'], mayBeEstimated: ['amount'], notice: 'SALARY_ESTIMATE_NOT_RECEIVED',
    ownerRequires: REVIEW_SCREEN_REQUIRES, ownerRules: [TRANSFER_NOTE],
    stateRules: ['With no active salary structure the amount stays blank', 'An estimated amount is never actual until the user confirms it'],
    availableFrom: 'P10', examples: ['Received my salary'],
  }),
  make({
    id: 'RECORD_LEARNING_PAYMENT', class: 'RECORD', owner: 'transactions', flow: 'review-drawer', route: null,
    becomes: 'actual', risk: 'financial-write', needsConfirmation: true, confirmedIn: 'review-drawer',
    required: ['amount', 'itemName'], optional: ['date', 'account', 'targetDate'],
    ownerRequires: REVIEW_SCREEN_REQUIRES, askWhen: ['item_name_unclear'],
    ownerRules: [TRANSFER_NOTE, 'Exactly one transaction is written', 'No link is stored between the payment and a learning item (decision 3)'],
    followUp: { owner: 'learning', route: '/learning', prefills: ['itemName', 'amount'] },
    availableFrom: 'P8', examples: ['Paid ₹8,000 for a Power BI certification'],
  }),
  make({
    id: 'CREATE_GOAL', class: 'CREATE', owner: 'goals', flow: 'owner-dialog', route: '/goals',
    becomes: 'planned', risk: 'create', needsConfirmation: true, confirmedIn: 'owner-dialog',
    required: ['name'], optional: ['targetAmount', 'targetDate'], ownerRequires: ['name', 'targetAmount'],
    askWhen: ['competing_meaning'], ownerRules: ['At most 10 active goals (checked on the Goals page)'],
    availableFrom: 'P7',
    examples: ['Create a goal for a laptop worth ₹50,000', 'Create a goal called Laptop for 50000 by December'],
  }),
  make({
    id: 'MODIFY_GOAL_CONTRIBUTE', class: 'MODIFY', owner: 'goals', flow: 'owner-dialog', route: '/goals',
    becomes: 'actual', risk: 'financial-write', needsConfirmation: true, confirmedIn: 'owner-dialog',
    required: ['goal', 'amount'], optional: ['account'], ownerRequires: ['account', 'amount'],
    askWhen: ['goal_ambiguous', 'goal_reference_unresolved'],
    ownerRules: ['Capped at the chosen account\'s available balance', 'The goal completes when its target is reached', 'An allocation of money, never an expense'],
    availableFrom: 'P7', examples: ['Add ₹2,000 to that goal', 'Add 2000 to my laptop goal', 'Add ₹2,000 to it'],
  }),
  make({
    id: 'CREATE_BUDGET_MONTH', class: 'CREATE', owner: 'budgets', flow: 'owner-page-flow', route: '/budgets',
    becomes: 'planned', risk: 'create', needsConfirmation: true, confirmedIn: 'owner-page-flow',
    required: ['month'], mayBeSuggested: ['amounts'], ownerRequires: ['category', 'amount'],
    askWhen: ['month_unclear'],
    ownerRules: ['One budget per category per month', 'Suggestions come only from the user\'s own history, rounded to the nearest 50, and are never derived from income'],
    availableFrom: 'P9', examples: ['Create next month\'s budget'],
  }),
  make({
    id: 'MODIFY_BUDGET_AMOUNT', class: 'MODIFY', owner: 'budgets', flow: 'owner-dialog', route: '/budgets',
    becomes: 'planned', risk: 'change', needsConfirmation: true, confirmedIn: 'owner-dialog',
    required: ['category'], requireOneOf: [['newAmount', 'relativeChange']], optional: ['month'],
    ownerRequires: ['category', 'amount', 'month'], askWhen: ['category_unknown', 'budget_not_found'],
    ownerRules: ['The category cannot be changed when editing', 'A relative change is worked out by the owner page from its own row and labelled calculated'],
    availableFrom: 'P9', examples: ['Increase my food budget to 5000', 'Set my food budget to ₹5,000'],
  }),
  make({
    id: 'CREATE_LEARNING_ITEM', class: 'CREATE', owner: 'learning', flow: 'owner-dialog', route: '/learning',
    becomes: 'planned', risk: 'create', needsConfirmation: true, confirmedIn: 'owner-dialog',
    required: ['name'], optional: ['cost', 'targetDate', 'status', 'relevanceTag'], ownerRequires: ['name'],
    askWhen: ['competing_meaning'],
    ownerRules: ['Cost defaults to 0 and status to planned', 'Cost is information only and is never added to balances'],
    availableFrom: 'P8', examples: ['Add Power BI certification to my learning'],
  }),
  make({
    id: 'MODIFY_LEARNING_STATUS', class: 'MODIFY', owner: 'learning', flow: 'owner-dialog', route: '/learning',
    becomes: 'actual', risk: 'change', needsConfirmation: true, confirmedIn: 'owner-dialog',
    required: ['item', 'newStatus'], ownerRequires: ['name'], askWhen: ['item_ambiguous', 'item_not_found'],
    ownerRules: ['Status is one of planned, in_progress, completed, dropped'],
    availableFrom: 'P8', examples: ['Mark my Power BI course as completed'],
  }),
  make({
    id: 'QUERY_SPEND', class: 'QUERY', owner: 'queries', flow: 'result-dialog', route: null,
    becomes: 'none', risk: 'read', needsConfirmation: false, confirmedIn: null,
    optional: ['category', 'period'], askWhen: ['category_unknown', 'category_ambiguous', 'period_unclear'],
    answerKind: 'calculated', seeMore: '/transactions',
    stateRules: ['The period used is always stated in the answer', 'Default period: the current calendar month'],
    availableFrom: 'P5', examples: ['How much did I spend on food this month?', 'How much did I spend last month?'],
  }),
  make({
    id: 'QUERY_BUDGET_LEFT', class: 'QUERY', owner: 'queries', flow: 'result-dialog', route: null,
    becomes: 'none', risk: 'read', needsConfirmation: false, confirmedIn: null,
    required: ['category'], optional: ['month'], askWhen: ['category_unknown'],
    answerKind: 'calculated', seeMore: '/budgets',
    stateRules: ['No budget for that category and month: say so, never show zero'],
    availableFrom: 'P5', examples: ['How much is left in my food budget?'],
  }),
  make({
    id: 'QUERY_GOAL_PROGRESS', class: 'QUERY', owner: 'queries', flow: 'result-dialog', route: null,
    becomes: 'none', risk: 'read', needsConfirmation: false, confirmedIn: null,
    required: ['goal'], askWhen: ['goal_ambiguous', 'goal_reference_unresolved'],
    answerKind: 'calculated', seeMore: '/goals',
    availableFrom: 'P5', examples: ['How much have I put into my laptop goal?'],
  }),
  make({
    id: 'QUERY_BALANCE', class: 'QUERY', owner: 'queries', flow: 'result-dialog', route: null,
    becomes: 'none', risk: 'read', needsConfirmation: false, confirmedIn: null,
    optional: ['account'], askWhen: ['account_unclear'], answerKind: 'calculated',
    stateRules: ['There is no accounts page, so the answer has no page to link to'],
    availableFrom: 'P5', examples: ['How much is in my SBI account?', 'What is my total balance?'],
  }),
  make({
    id: 'QUERY_PENSION_ESTIMATE', class: 'QUERY', owner: 'queries', flow: 'result-dialog', route: null,
    becomes: 'none', risk: 'read', needsConfirmation: false, confirmedIn: null,
    answerKind: 'estimated', notice: 'ESTIMATE_NOT_PAYMENT_RECORD', seeMore: '/pf-pension',
    stateRules: ['No active salary structure: say so rather than showing a figure', 'Never says the user paid an amount (decision 4)'],
    availableFrom: 'P10', examples: ['How much did I pay for my pension?'],
  }),
  make({
    id: 'NAVIGATE', class: 'NAVIGATE', owner: 'router', flow: 'router', route: null,
    becomes: 'none', risk: 'read', needsConfirmation: false, confirmedIn: null,
    required: ['page'], askWhen: ['page_ambiguous'],
    availableFrom: 'P6', examples: ['Open my goals', 'Take me to budgets', 'Show my learning', 'Go to salary'],
  }),
]

export const CONTRACT_KEYS = deepFreeze([
  'id', 'class', 'owner', 'flow', 'route', 'becomes', 'risk', 'needsConfirmation', 'confirmedIn',
  'required', 'requireOneOf', 'optional', 'ownerRequires', 'askWhen', 'mayBeEstimated', 'mayBeSuggested',
  'answerKind', 'notice', 'ownerRules', 'stateRules', 'seeMore', 'followUp', 'availableFrom', 'examples',
])

export const CONTRACTS = deepFreeze(Object.fromEntries(LIST.map((c) => [c.id, c])))
export const INTENT_IDS = deepFreeze(LIST.map((c) => c.id))

export function getContract(id) {
  const contract = CONTRACTS[id]
  if (!contract) throw new Error(`Unknown intent: ${id}`)
  return contract
}

/** Every field name a pending action for this intent may carry. */
export function allowedFields(contract) {
  return [...new Set([
    ...contract.required, ...contract.requireOneOf.flat(), ...contract.optional,
    ...contract.mayBeEstimated, ...contract.mayBeSuggested,
  ])]
}

export function isIntentAvailable(id) {
  return phaseIndex(getContract(id).availableFrom) <= phaseIndex(BUILT_THROUGH)
}
