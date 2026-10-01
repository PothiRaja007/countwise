// G1 — template families and parameter vocabulary (design v2, Sections 5, 8-11).
//
// Scope of this first slice, stated honestly (same convention as the
// Phase G0 evaluation corpus): 6 family groups, covering 15 of the 19
// global categories with real ML-candidate examples. Not yet covered:
// Bills & Utilities (its remaining keyword-free surface is narrow enough
// that natural paraphrases keep colliding with Rent/Mobile Recharge/Wi-Fi's
// own keywords — needs its own careful pass) and a deeper Family
// 18/19/20-style set (multi-event, heavy noise). Flagged here, not hidden.
//
// A "family group" (design v2 Section 9) is the unit that gets assigned to
// train/validation/test — never an individual template. Every template
// inside one group is structurally similar enough that splitting them
// across train and test would leak.
//
// Every item below was checked BY HAND against categoryTruth.js's
// GLOBAL_KEYWORD_RULES to avoid an accidental keyword match; generate.js
// then checks this again programmatically for every generated sentence
// (design v2 Section 6), so a mistake here is caught, not trusted.
//
// slotPool shape: { train: [...], heldout: [...] }. 'heldout' words are
// used ONLY when generating validation/test examples for that family
// group (design v2 Section 10 — lexical holdout) — generate.js enforces
// this; nothing here decides it.

const pool = (train, heldout) => ({ train, heldout })

export const FAMILY_GROUPS = [
  // ------------------------------------------------------------------
  {
    id: 'purchase_direct',
    description: 'Item + amount, with common purchase verbs. The core keyword-evading case: a real category, a real item, just not the seeded word.',
    templates: [
      '{item} {amount}',
      '{item} for {amount}',
      'bought {item} for {amount}',
      'got {item} for {amount}',
      'paid {amount} for {item}',
      'picked up {item} for {amount}',
    ],
    // { category, items: pool }
    targets: [
      { category: 'Food', items: pool(
        ['biryani', 'dosa', 'idli', 'shawarma', 'fried rice', 'sandwich', 'noodles', 'pastry', 'momos', 'vada pav'],
        ['pongal', 'uttapam', 'kebab', 'burger', 'thali']) },
      { category: 'Shopping', items: pool(
        ['a jacket', 'a backpack', 'a watch', 'a wallet', 'sunglasses', 'a t-shirt', 'sneakers', 'a bag'],
        ['a cap', 'a belt', 'perfume', 'a scarf']) },
      { category: 'Health', items: pool(
        ['tablets', 'a checkup', 'a dental cleaning', 'an eye test', 'a vaccine shot', 'physio session'],
        ['a blood test', 'an x-ray', 'a consultation']) },
      { category: 'Groceries', items: pool(
        ['vegetables', 'rice and dal', 'household supplies', 'weekly essentials', 'cooking oil and spices'],
        ['fruits', 'cleaning supplies']) },
      { category: 'Juice/Refreshments', items: pool(
        ['a smoothie', 'sugarcane juice', 'a cold drink', 'lemon soda', 'a milkshake'],
        ['coconut water', 'iced tea']) },
      { category: 'Entertainment', items: pool(
        ['a movie ticket', 'an arcade session', 'a concert ticket', 'a bowling game', 'a video game'],
        ['a theatre pass', 'a gaming session']) },
      { category: 'Education', items: pool(
        ['a notebook set', 'a lab manual', 'drawing supplies', 'a reference guide', 'graph sheets'],
        ['a calculator', 'a dictionary']) },
      { category: 'Transport', items: pool(
        ['a ride to college', 'a lift to work', 'a commute payment', 'a trip to college', 'a shared ride'],
        ['a quick hop across town']) },
      { category: 'Other', items: pool(
        ['a repair job', 'a service charge', 'a small fix', 'an odd job payment'],
        ['a misc errand', 'a one-off task']) },
      { category: 'Fuel', items: pool(
        ['a bike top-up', 'a tank fill-up', 'a two-wheeler top-up', 'a pump stop', 'a scooter top-up', 'a full tank'],
        ['a vehicle fill-up', 'a station stop']) },
      { category: 'Rent', items: pool(
        ['the monthly house payment', 'the landlord payment', 'the flat payment for the month', "the owner's payment", 'the room payment for the month', 'the place payment'],
        ['the monthly place payment', 'the accommodation payment']) },
      { category: 'Bills & Utilities', items: pool(
        ['the power bill', 'the current bill', 'the utility payment', 'the apartment maintenance charge', 'the housing service charge', 'the monthly utility charge'],
        ['the society maintenance charge', 'the building service payment']) },
      // These three categories otherwise exist ONLY inside routine_purchase,
      // which is the entire family group held out for structural-generalization
      // testing. Without a train-side presence, the model would never see a
      // single labelled example and could not possibly predict them — that
      // tests "unknown category" (zero-shot), not "known category, new
      // sentence structure", which is what val_structural is actually meant
      // to measure. Different items from routine_purchase's own, so the two
      // groups don't just repeat each other's vocabulary.
      { category: 'Subscriptions', items: pool(
        ['a streaming plan', 'a cloud storage plan', 'a reading app plan', 'a music app plan renewal', 'an app membership'],
        ['a video app plan', 'a news app plan']) },
      { category: 'Wi-Fi/Internet', items: pool(
        ['the router connection', 'the home connection bill', 'the line rental payment', 'the connection charge'],
        ['the broadband connection charge', 'the household connection fee']) },
      { category: 'Mobile Recharge', items: pool(
        ['a data top-up', 'a phone top-up', 'a plan renewal', 'a number top-up for the month'],
        ['a number top-up', 'a line top-up']) },
    ],
  },
  // ------------------------------------------------------------------
  {
    id: 'place_led',
    description: 'Merchant or place named before or after the item — none of these place names are seeded keywords.',
    templates: [
      '{item} from {place} {amount}',
      'got {item} from {place} for {amount}',
      'ordered from {place} for {amount}',
      'paid {amount} at {place} for {item}',
    ],
    targets: [
      { category: 'Food', items: pool(['biryani', 'a meal', 'lunch combo', 'a wrap'], ['a thali', 'a set meal']),
        places: pool(['a canteen stall', 'the local joint', 'a food truck', 'the corner stall'], ['the udupi place', 'the dhaba']) },
      { category: 'Groceries', items: pool(['essentials', 'weekly groceries', 'supplies'], ['fresh produce']),
        places: pool(['the local store', 'the corner shop', 'the market'], ['the co-op store']) },
      { category: 'Shopping', items: pool(['a shirt', 'shoes', 'a gift item'], ['a cap']),
        places: pool(['the mall', 'the street market', 'a small boutique'], ['the outlet store']) },
      { category: 'Health', items: pool(['tablets', 'an ointment', 'a syrup'], ['a supplement']),
        places: pool(['the chemist', 'the local clinic'], ['the health store']) },
    ],
  },
  // ------------------------------------------------------------------
  {
    id: 'social_purchase',
    description: "Spending WITH other people. Deliberately spans several categories so 'social' never becomes a proxy for one of them (design v2 Section 15).",
    templates: [
      '{item} with {relation} {amount}',
      'went out with {relation} and spent {amount} on {item}',
      'had {item} with friends for {amount}',
      'spent {amount} with {relation} on {item}',
    ],
    targets: [
      { category: 'Food', items: pool(['dinner', 'biryani', 'a meal', 'snacks'], ['a thali', 'street food']),
        relations: pool(['friends', 'my bestie', 'my roommates', 'my cousins'], ['my classmates', 'my squad']) },
      { category: 'Entertainment', items: pool(['a movie', 'bowling', 'an arcade visit', 'a concert'], ['a game night']),
        relations: pool(['friends', 'my bro', 'my sis', 'my gang'], ['my batchmates']) },
      { category: 'Transport', items: pool(['a cab ride', 'a shared ride', 'a trip'], ['a road trip fuel share']),
        relations: pool(['friends', 'my roommates'], ['my colleagues']) },
      { category: 'Shopping', items: pool(['some shopping', 'new clothes', 'accessories'], ['gifts']),
        relations: pool(['my sister', 'my mom', 'friends'], ['my cousin']) },
    ],
  },
  // ------------------------------------------------------------------
  {
    id: 'routine_purchase',
    description: "Recurring/habitual framing. Paraphrases that avoid the Subscriptions/Bills & Utilities keywords outright, to test 'routine' against several categories, not just one (design v2 Section 15).",
    templates: [
      '{item} monthly {amount}',
      'renewed my {item} {amount}',
      '{item} as usual {amount}',
      'the usual {item} payment {amount}',
    ],
    targets: [
      { category: 'Subscriptions', items: pool(
        ['music app plan', 'streaming plan', 'cloud storage plan', 'reading app membership'],
        ['fitness app plan', 'news app plan']) },
      { category: 'Wi-Fi/Internet', items: pool(['home connection', 'router plan'], ['data plan renewal']) },
      { category: 'Health', items: pool(['gym membership', 'yoga class fee'], ['swimming membership']) },
      { category: 'Mobile Recharge', items: pool(['top-up', 'data pack'], ['SIM plan']) },
    ],
  },
  // ------------------------------------------------------------------
  {
    id: 'casual_slang',
    description: 'Informal register — slang should carry no category signal of its own.',
    templates: [
      'grabbed {item} bro {amount}',
      'got some {item} with bestie {amount}',
      '{item} with fam {amount}',
      'just got {item} {amount}',
    ],
    targets: [
      { category: 'Food', items: pool(['chai', 'rolls', 'momos', 'fries'], ['a shake']) },
      { category: 'Entertainment', items: pool(['a game', 'tickets'], ['an arcade pass']) },
      { category: 'Shopping', items: pool(['a hoodie', 'sneakers'], ['a cap']) },
    ],
  },
  // ------------------------------------------------------------------
  {
    id: 'income_paraphrase',
    description: "Income described without the seeded income keywords. Each item is a SELF-CONTAINED clause carrying its own income signal (a real detectType() trigger word: 'credited', 'received', 'earned', 'refund'), since the single template here has no verb of its own to supply one.",
    templates: ['{item} {amount}', 'today, {item}, {amount}'],
    targets: [
      { category: 'Salary', items: pool(
          ['my pay got credited', 'office credited my pay for the month', 'the company credited this month pay', 'my pay was credited today', 'received my pay for the month', 'the firm credited my monthly pay', 'received this month\'s earnings'],
          ['work credited my pay early this time', 'the firm credited this cycle pay', 'received my earnings for the cycle']) },
      { category: 'Tuition/Freelance income', items: pool(
          ['received payment for the design work', 'earned money from the gig', 'the client credited payment for the assignment', 'received money for the project work', 'earned this from a side gig', 'received payment for the extra work', 'earned money helping with a project'],
          ['received money for the project I finished', 'earned money for the extra work', 'received payment for the side task']) },
      { category: 'Allowance', items: pool(
          ['received money from dad for the week', 'my parents credited money for expenses', 'received some money from home', 'received weekly money from home', 'mom credited some money for expenses', 'received the usual money from home', 'dad credited some money for the week'],
          ['received extra money from home this week', 'received some money from family', 'received weekly money from parents']) },
      { category: 'Other income', items: pool(
          ['received an unexpected refund', 'got money credited back unexpectedly', 'earned some money unexpectedly', 'received money back from a return', 'earned a bit extra unexpectedly', 'received some money back from a friend', 'earned a small amount unexpectedly'],
          ['received a surprise refund today', 'earned some unplanned extra money', 'received an unplanned amount back']) },
    ],
  },
  // ------------------------------------------------------------------
  {
    id: 'indirect_description',
    description: 'The category is implied, not named or item-specific — the weakest-signal, hardest-to-classify family here on purpose, added for real structural diversity beyond the first six groups.',
    templates: [
      '{item} {amount}',
      'went for {item} {amount}',
    ],
    targets: [
      { category: 'Food', items: pool(
        ['a quick bite', 'something to eat', 'a little something to eat', 'a small snack run'],
        ['a bite on the way home']) },
      { category: 'Shopping', items: pool(
        ['new stuff', 'something new', 'a little something for myself'],
        ['a few new things']) },
      { category: 'Transport', items: pool(
        ['a way to get around', 'a way to get to college'],
        ['a way to get back home']) },
      { category: 'Entertainment', items: pool(
        ['a bit of fun', 'some downtime', 'a little entertainment'],
        ['a way to unwind']) },
    ],
  },
]

export const AMOUNTS = { train: [40, 60, 80, 120, 150, 180, 250, 300, 450, 600, 800, 1200], heldout: [55, 95, 175, 340, 520, 975] }
