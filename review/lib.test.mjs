// Run with: node --test review/*.test.mjs
// Only the pure helpers are tested; the page itself needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kvkUrl, verificationBadges, stateText, formatEuro, cancelRate, durationLabel,
  reasonLabel, reasonCounts, stripeTypeNote, sortPros, cancellationRows, proSubline,
  allowedDecisions, validateDecision, validateNote, parseEuroToCents, centsToInput, attentionLabel,
  openProblems, isOpenCase, refundableCents, splitAfterRefund, suggestedRefund, failedJobs,
  caseItems, waitingSince, bookingWhen, whenLabel, cancellationText, decisionPreview,
  confirmText, reverseConfirmText, retryConfirmText, problemDetails, refundRows, savedText,
  chatLines, asCaseRow, saveErrorText, problemKindLabel, transferLabel, methodLabel,
  paymentStatusLabel, disputeStatusLabel, resolutionText,
} from './lib.js';

// verification as admin_list_pro_applications and admin_list_pros return it:
// nothing started, then overridden per case.
const verification = (over = {}) => ({
  identity_status: 'none', connected: false, details_submitted: false,
  payouts_enabled: false, transfers_active: false, requirements_due: false,
  business_type: null, ...over,
});
const allDone = {
  identity_status: 'verified', connected: true, details_submitted: true,
  payouts_enabled: true, transfers_active: true,
};

test('kvk_url_only_for_8_digits', () => {
  assert.equal(kvkUrl('12345678'), 'https://www.kvk.nl/zoeken/?source=all&q=12345678');
  assert.equal(kvkUrl('01234567'), 'https://www.kvk.nl/zoeken/?source=all&q=01234567');
  // The server strips spaces before it checks the number, so the page does too.
  assert.equal(kvkUrl(' 1234 5678 '), 'https://www.kvk.nl/zoeken/?source=all&q=12345678');
  for (const bad of ['1234567', '123456789', '', 'NL123456789B01', '1234567a', '1234-5678', '12345678&x=1', null, undefined, 12345678, {}]) {
    assert.equal(kvkUrl(bad), null, `${JSON.stringify(bad)} must not make a link`);
  }
});

test('badges_from_verification', () => {
  const states = (v) => verificationBadges(v).map((b) => `${b.label}:${b.state}`);

  assert.deepEqual(verificationBadges(verification(allDone)), [
    { label: 'Identity', state: 'ok' },
    { label: 'Payouts', state: 'ok' },
  ]);
  assert.deepEqual(states(verification()), ['Identity:todo', 'Payouts:todo']);

  // Identity
  assert.equal(states(verification({ identity_status: 'pending' }))[0], 'Identity:pending');
  assert.equal(states(verification({ identity_status: 'processing' }))[0], 'Identity:pending');
  assert.equal(states(verification({ identity_status: 'requires_input' }))[0], 'Identity:attention');
  assert.equal(states(verification({ identity_status: 'canceled' }))[0], 'Identity:todo');
  assert.equal(states(verification({ identity_status: 'something_new' }))[0], 'Identity:todo');

  // Payouts: no Stripe account, started, submitted, almost active, active
  assert.equal(states(verification({ connected: false }))[1], 'Payouts:todo');
  assert.equal(states(verification({ connected: true }))[1], 'Payouts:pending');
  assert.equal(states(verification({ connected: true, details_submitted: true }))[1], 'Payouts:pending');
  assert.equal(states(verification({ connected: true, details_submitted: true, payouts_enabled: true }))[1], 'Payouts:pending');
  assert.equal(states(verification({ ...allDone }))[1], 'Payouts:ok');
  // Stripe asking for more information stops new bookings, even on an active account.
  assert.equal(states(verification({ ...allDone, requirements_due: true }))[1], 'Payouts:attention');
  assert.equal(states(verification({ connected: true, requirements_due: true }))[1], 'Payouts:attention');
  // The two badges are independent.
  assert.deepEqual(states(verification({ ...allDone, identity_status: 'requires_input', requirements_due: true })),
    ['Identity:attention', 'Payouts:attention']);

  // No verification (a database from before migration 107): no badges at all.
  for (const missing of [undefined, null, 'verified', 7, []]) {
    assert.deepEqual(verificationBadges(missing), []);
  }
});

test('badge_text', () => {
  assert.equal(stateText('Identity', 'ok'), 'Verified');
  assert.equal(stateText('Identity', 'pending'), 'In progress');
  assert.equal(stateText('Identity', 'todo'), 'Not started');
  assert.equal(stateText('Identity', 'attention'), 'Needs action');
  assert.equal(stateText('Payouts', 'ok'), 'Active');
  assert.equal(stateText('Payouts', 'pending'), 'In progress');
  assert.equal(stateText('Payouts', 'todo'), 'Not started');
  assert.equal(stateText('Payouts', 'attention'), 'Needs information');
});

test('format_euro', () => {
  assert.equal(formatEuro(2200), '€22');
  assert.equal(formatEuro(2250), '€22.50');
  assert.equal(formatEuro(2090), '€20.90');
  assert.equal(formatEuro(1999), '€19.99');
  assert.equal(formatEuro(5), '€0.05');
  assert.equal(formatEuro(0), '€0');
  assert.equal(formatEuro(100000), '€1000');
  assert.equal(formatEuro(1005), '€10.05');
  for (const bad of [null, undefined, NaN, Infinity, '2200', {}]) {
    assert.equal(formatEuro(bad), '—');
  }
});

test('cancel_rate', () => {
  assert.equal(cancelRate(0.25), '25%');
  assert.equal(cancelRate(0.16), '16%');
  assert.equal(cancelRate(0.07), '7%'); // 0.07 * 100 is 7.000000000000001
  assert.equal(cancelRate(0.29), '29%'); // 0.29 * 100 is 28.999999999999996
  assert.equal(cancelRate(0.33), '33%');
  assert.equal(cancelRate(0), '0%');
  assert.equal(cancelRate(1), '100%');
  // No bookings in 90 days: the server sends null.
  for (const none of [null, undefined, NaN, '0.25']) assert.equal(cancelRate(none), '—');
});

test('duration_label', () => {
  assert.equal(durationLabel(15), '15 min');
  assert.equal(durationLabel(30), '30 min');
  assert.equal(durationLabel(45), '45 min');
  assert.equal(durationLabel(60), '1 h');
  assert.equal(durationLabel(90), '1 h 30 min');
  assert.equal(durationLabel(120), '2 h');
  assert.equal(durationLabel(135), '2 h 15 min');
  assert.equal(durationLabel(1440), '24 h');
  // Not set (the hour, day and night prices need no duration) or not a duration.
  for (const none of [null, undefined, 0, -30, 12.5, NaN, '30']) assert.equal(durationLabel(none), null);
});

test('reason_labels', () => {
  // bookingProReason (EN)
  assert.equal(reasonLabel('not_available'), 'Not available any more');
  assert.equal(reasonLabel('unwell'), 'I’m ill');
  assert.equal(reasonLabel('cant_take_pet'), 'Can’t take this pet');
  assert.equal(reasonLabel('emergency'), 'Emergency');
  assert.equal(reasonLabel('other'), 'Other');
  // bookingCustomerReason (EN)
  assert.equal(reasonLabel('plans_changed'), 'Plans changed');
  assert.equal(reasonLabel('pet_unwell'), 'My pet is unwell');
  assert.equal(reasonLabel('found_other'), 'Found another option');
  // The customer cancelled without picking a reason.
  assert.equal(reasonLabel('customer'), 'No reason given');
  assert.equal(reasonLabel(null), 'No reason given');
  assert.equal(reasonLabel(''), 'No reason given');
  // A key this page doesn't know is shown as it is, never hidden.
  assert.equal(reasonLabel('hold_expired'), 'hold_expired');
  // Only the app's own keys count: names every object has are just unknown keys.
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(reasonLabel(key), key);
  }
});

test('reason_counts', () => {
  // Most first; ties follow the order of the app's reason list.
  assert.deepEqual(
    reasonCounts({ other: 1, emergency: 1, unwell: 1, not_available: 2 }),
    [
      { key: 'not_available', label: 'Not available any more', count: 2 },
      { key: 'unwell', label: 'I’m ill', count: 1 },
      { key: 'emergency', label: 'Emergency', count: 1 },
      { key: 'other', label: 'Other', count: 1 },
    ],
  );
  // Unknown keys come after the known ones; empty and invalid counts are dropped.
  assert.deepEqual(
    reasonCounts({ zzz: 1, aaa: 1, unwell: 1, other: 0, emergency: -1, cant_take_pet: 'x', not_available: 1.5 })
      .map((r) => r.key),
    ['unwell', 'aaa', 'zzz'],
  );
  for (const none of [null, undefined, {}, [], 'x']) assert.deepEqual(reasonCounts(none), []);
});

test('stripe_type_note', () => {
  // The form's choice and Stripe agree: nothing to say.
  assert.equal(stripeTypeNote(true, 'company'), null);
  assert.equal(stripeTypeNote(true, 'non_profit'), null);
  assert.equal(stripeTypeNote(true, 'government_entity'), null);
  assert.equal(stripeTypeNote(false, 'individual'), null);
  // They differ.
  assert.equal(stripeTypeNote(true, 'individual'), 'Stripe says: Private');
  assert.equal(stripeTypeNote(false, 'company'), 'Stripe says: Business');
  assert.equal(stripeTypeNote(false, 'non_profit'), 'Stripe says: Non-profit');
  // No Stripe account yet, or a type this page doesn't know.
  for (const none of [null, undefined, '', 'something_new']) {
    assert.equal(stripeTypeNote(true, none), null);
    assert.equal(stripeTypeNote(false, none), null);
  }
});

test('sort_pros', () => {
  // admin_list_pros rows, reduced to the keys that are sorted on.
  const row = (display_name, o) => ({
    display_name, bookings_90d: 0, bookings_total: 0, pro_cancels_90d: 0, pro_cancel_rate_90d: null,
    problems_open: 0, problems_total: 0, ...o,
  });
  const pros = [
    row('Ann’s Pet Care', { bookings_90d: 12, bookings_total: 12, pro_cancel_rate_90d: 0 }),
    row('Paws & Claws Grooming'),
    row('Lisa', { bookings_90d: 19, bookings_total: 19, pro_cancels_90d: 1, pro_cancel_rate_90d: 0.05, problems_open: 1, problems_total: 2 }),
    row('Bram’s Dog Care', { bookings_90d: 31, bookings_total: 40, pro_cancels_90d: 5, pro_cancel_rate_90d: 0.16, problems_open: 1, problems_total: 3 }),
    row('Happy Paws Walking', { bookings_90d: 64, bookings_total: 64, pro_cancels_90d: 1, pro_cancel_rate_90d: 0.02, problems_open: 1, problems_total: 1 }),
  ];
  const names = (key) => sortPros(pros, key).map((p) => p.display_name);
  const before = pros.map((p) => p.display_name);

  // Highest rate first; a pro with no bookings in 90 days (rate null) last.
  assert.deepEqual(names('rate'), ['Bram’s Dog Care', 'Lisa', 'Happy Paws Walking', 'Ann’s Pet Care', 'Paws & Claws Grooming']);
  assert.deepEqual(names('bookings'), ['Happy Paws Walking', 'Bram’s Dog Care', 'Lisa', 'Ann’s Pet Care', 'Paws & Claws Grooming']);
  assert.deepEqual(names('problems'), ['Bram’s Dog Care', 'Lisa', 'Happy Paws Walking', 'Ann’s Pet Care', 'Paws & Claws Grooming']);
  assert.deepEqual(names('name'), ['Ann’s Pet Care', 'Bram’s Dog Care', 'Happy Paws Walking', 'Lisa', 'Paws & Claws Grooming']);
  // An unknown key falls back to the default order.
  assert.deepEqual(names('nope'), names('rate'));
  // The list passed in is left alone.
  assert.deepEqual(pros.map((p) => p.display_name), before);
  // Rows with the same rate: more cancellations first.
  const tie = [row('B', { pro_cancels_90d: 1, pro_cancel_rate_90d: 0.1 }), row('A', { pro_cancels_90d: 2, pro_cancel_rate_90d: 0.1 })];
  assert.deepEqual(sortPros(tie, 'rate').map((p) => p.display_name), ['A', 'B']);
  assert.deepEqual(sortPros(null, 'rate'), []);
});

test('cancellation_rows', () => {
  // admin_pro_cancellations rows. 2026-10-04 is a Sunday and Amsterdam is on
  // summer time (UTC+2) until 25 October, then on UTC+1.
  const base = {
    booking_id: 'b1', cancelled_at: '2026-10-04T10:15:00Z', service_title: 'Dog walking, 45 min',
    start_at: '2026-10-05T07:00:00Z', end_at: '2026-10-05T07:45:00Z', reason: 'not_available',
    note: 'Double-booked myself, sorry.', refunded_cents: 2090,
  };
  assert.deepEqual(cancellationRows([base]), [{
    id: 'b1', cancelledOn: 'Sun 4 Oct', booking: 'Dog walking, 45 min · Mon 5 Oct, 09:00',
    reason: 'Not available any more', note: '“Double-booked myself, sorry.”', refunded: '€20.90',
  }]);

  const one = (over) => cancellationRows([{ ...base, ...over }])[0];
  // Days and times are Amsterdam's, not UTC's: 22:30 UTC is already Monday there.
  assert.equal(one({ cancelled_at: '2026-10-04T22:30:00Z' }).cancelledOn, 'Mon 5 Oct');
  assert.equal(one({ start_at: '2026-10-26T08:00:00Z' }).booking, 'Dog walking, 45 min · Mon 26 Oct, 09:00'); // winter time
  assert.equal(one({ start_at: '2026-10-04T22:05:00Z' }).booking, 'Dog walking, 45 min · Mon 5 Oct, 00:05');
  assert.equal(one({ cancelled_at: '2026-09-13T09:00:00Z' }).cancelledOn, 'Sun 13 Sep');

  // Note: quoted, or null for the page's "No note".
  assert.equal(one({ note: '  Car broke down.  ' }).note, '“Car broke down.”');
  for (const none of [null, undefined, '', '   ', 7]) assert.equal(one({ note: none }).note, null);
  // Whole euros, or not a number.
  assert.equal(one({ refunded_cents: 1900 }).refunded, '€19');
  assert.equal(one({ refunded_cents: 0 }).refunded, '€0');
  assert.equal(one({ refunded_cents: null }).refunded, '—');
  // Reasons use the app's words; no reason at all is said so.
  assert.equal(one({ reason: 'emergency' }).reason, 'Emergency');
  assert.equal(one({ reason: null }).reason, 'No reason given');
  // Bad or missing dates and titles never throw and never print "Invalid Date".
  assert.equal(one({ cancelled_at: 'nope' }).cancelledOn, '—');
  assert.equal(one({ cancelled_at: null }).cancelledOn, '—');
  assert.equal(one({ start_at: null }).booking, 'Dog walking, 45 min');
  assert.equal(one({ service_title: null }).booking, 'Mon 5 Oct, 09:00');
  assert.equal(one({ service_title: null, start_at: null }).booking, '—');
  // Order is kept (the server sends the newest first); rows that aren't objects are dropped.
  assert.deepEqual(cancellationRows([{ ...base, booking_id: 'x' }, null, 'y', { ...base, booking_id: 'z' }]).map((r) => r.id), ['x', 'z']);
  for (const none of [null, undefined, {}, 'x']) assert.deepEqual(cancellationRows(none), []);
});

test('pro_subline', () => {
  // The city goes under the name; the email only when there is no city.
  assert.equal(proSubline({ city: 'Utrecht', email: 'bram@example.com' }), 'Utrecht');
  assert.equal(proSubline({ city: ' Utrecht ', email: 'bram@example.com' }), 'Utrecht');
  for (const noCity of [null, undefined, '', '   ']) {
    assert.equal(proSubline({ city: noCity, email: 'bram@example.com' }), 'bram@example.com');
  }
  assert.equal(proSubline({ city: null, email: null }), null);
  assert.equal(proSubline({}), null);
  assert.equal(proSubline(null), null);
});

// ---------------------------------------------------------------------------
// The Problems tab
// ---------------------------------------------------------------------------

// One row of admin_list_problem_cases: a completed 23 euro booking (so 2300
// cents) with one open "something went wrong" report from the customer. 2026-10-07
// is a Wednesday and Amsterdam is on summer time (UTC+2) until 25 October.
const wentWrong = {
  id: 'p1', kind: 'went_wrong', reporter_role: 'customer', note: 'Max came back with a cut paw.',
  status: 'open', dispute_status: null, created_at: '2026-10-08T07:40:00Z',
  resolution: null, resolution_cents: null, resolution_note: null,
};
const dispute = {
  id: 'p2', kind: 'dispute', reporter_role: null, note: null, status: 'open',
  dispute_status: 'needs_response', created_at: '2026-10-09T10:00:00Z',
  resolution: null, resolution_cents: null, resolution_note: null,
};
const caseRow = (over = {}, booking = {}) => ({
  booking: {
    id: 'b1', service_title: 'Dog walking, 60 min', start_at: '2026-10-07T14:00:00Z',
    end_at: '2026-10-07T15:00:00Z', status: 'completed', price_cents: 2300, refunded_cents: 0,
    commission_cents: 460, payout_cents: 1840, payment_status: 'paid', payment_method: 'card',
    transfer_status: 'frozen', payout_due_at: '2026-10-09T15:00:00Z', conversation_id: 'c1',
    payment_intent_id: 'pi_1', transfer_id: null, cancelled_by: null, cancel_reason: null,
    cancel_note: null, cancelled_at: null, ...booking,
  },
  customer: { id: 'u1', name: 'Daan Visser', email: 'daan@example.com' },
  pro: { id: 'u2', display_name: 'Happy Paws Walking', email: 'sanne@example.com' },
  refunds: [],
  problems: [wentWrong],
  attention: 'problem',
  suggested_no_show_refund_cents: 0,
  ...over,
});
const NORMAL = ['full_refund', 'partial_refund', 'release'];
const NOTE = 'Checked the chat; the walk happened, so we refund half.';

test('allowed_decisions_dispute_vs_normal', () => {
  assert.deepEqual(allowedDecisions(caseRow()), NORMAL);
  // A card dispute can't be refunded: only release or withhold, also next to a customer's report.
  assert.deepEqual(allowedDecisions(caseRow({ problems: [dispute] })), ['release', 'withhold']);
  assert.deepEqual(allowedDecisions(caseRow({ problems: [wentWrong, dispute] })), ['release', 'withhold']);
  // A dispute that is already resolved no longer restricts the case.
  assert.deepEqual(allowedDecisions(caseRow({ problems: [{ ...dispute, status: 'resolved' }, wentWrong] })), NORMAL);
  // Nothing open: nothing to decide (the RPC would refuse with invalid_input).
  assert.deepEqual(allowedDecisions(caseRow({ problems: [] })), []);
  assert.deepEqual(allowedDecisions(caseRow({ problems: [{ ...wentWrong, status: 'resolved' }] })), []);
  for (const bad of [null, undefined, {}, { problems: 'x' }, { problems: [null, 3] }]) {
    assert.deepEqual(allowedDecisions(bad), []);
  }
  // The caller gets its own array.
  allowedDecisions(caseRow()).push('nope');
  assert.deepEqual(allowedDecisions(caseRow()), NORMAL);
});

test('validate_decision_rules', () => {
  const row = caseRow(); // price 2300, nothing refunded yet
  const check = (decision, cents, note, r = row) => validateDecision(r, decision, cents, note);

  // The note: required, 5 to 1000 characters after trimming; emoji count once (as Postgres counts them).
  assert.equal(check('release', null, NOTE), null);
  assert.equal(check('release', null, '12345'), null);
  assert.equal(check('release', null, '  12345  '), null);
  for (const short of ['1234', '    1234    ', '', '   ', null, undefined, 12345, '👍👍👍']) {
    assert.match(check('release', null, short), /note/i, `${JSON.stringify(short)} is too short`);
  }
  assert.equal(check('release', null, 'a'.repeat(1000)), null);
  assert.equal(check('release', null, '👍'.repeat(1000)), null);
  assert.match(check('release', null, 'a'.repeat(1001)), /1000/);
  assert.match(check('release', null, `  ${'a'.repeat(1001)}  `), /1000/);
  assert.equal(validateNote('12345'), null);
  assert.match(validateNote('1234'), /note/i);

  // Refund in full: needs something left to refund.
  assert.equal(check('full_refund', null, NOTE), null);
  assert.match(check('full_refund', null, NOTE, caseRow({}, { refunded_cents: 2300 })), /nothing is left/i);

  // Refund part: 1 cent up to price - refunded, whole cents only.
  assert.equal(check('partial_refund', 1, NOTE), null);
  assert.equal(check('partial_refund', 1150, NOTE), null);
  assert.equal(check('partial_refund', 2300, NOTE), null);
  for (const bad of [0, -1, 2301, 1.5, NaN, Infinity, null, undefined, '700']) {
    assert.match(check('partial_refund', bad, NOTE), /amount|refund/i, `${JSON.stringify(bad)} is not a valid amount`);
  }
  assert.match(check('partial_refund', 2301, NOTE), /€23\b/);
  const refunded = caseRow({}, { refunded_cents: 500 }); // 1800 left
  assert.equal(check('partial_refund', 1800, NOTE, refunded), null);
  assert.match(check('partial_refund', 1801, NOTE, refunded), /€18\b/);
  assert.match(check('partial_refund', 1801, NOTE, refunded), /€5 .*already refunded/i);
  assert.match(check('partial_refund', 1, NOTE, caseRow({}, { refunded_cents: 2300 })), /nothing is left/i);
  // A booking without a usable price can't be refunded from here.
  assert.match(check('partial_refund', 100, NOTE, caseRow({}, { price_cents: null })), /price/i);
  // The amount only matters for a partial refund.
  assert.equal(check('release', 99999, NOTE), null);
  assert.equal(check('full_refund', 99999, NOTE), null);

  // The note is checked before the amount, so the form tells the top problem first.
  assert.match(check('partial_refund', 0, ''), /note/i);

  // Decisions the case doesn't allow.
  const disputed = caseRow({ problems: [dispute] });
  assert.equal(check('release', null, NOTE, disputed), null);
  assert.equal(check('withhold', null, NOTE, disputed), null);
  assert.match(check('full_refund', null, NOTE, disputed), /not available|can't/i);
  assert.match(check('partial_refund', 500, NOTE, disputed), /not available|can't/i);
  assert.match(check('withhold', null, NOTE), /not available.*needs a card dispute/i); // withhold needs a dispute
  assert.match(check('full_refund', null, NOTE, disputed), /not available.*can only be released or withheld/i);
  assert.match(check('burn', null, NOTE), /not available|can't/i);
  assert.match(check('release', null, NOTE, caseRow({ problems: [] })), /no open problem/i);
});

test('parse_euro_to_cents', () => {
  const cases = {
    '7': 700, '7,50': 750, '7.50': 750, '7,5': 750, '7.5': 750, '0': 0, '0,01': 1, '0.99': 99,
    ' 7 ': 700, '007': 700, '1234.56': 123456, '11.50': 1150, '23': 2300, '21474836': 2147483600,
  };
  for (const [text, cents] of Object.entries(cases)) assert.equal(parseEuroToCents(text), cents, text);
  const invalid = [
    '', ' ', 'abc', '7,', ',50', '.5', '7.505', '7,505', '-7', '+7', '7,50,1', '7.5.0', '1.234,50',
    '1 234', '€7', '7 €', '1e3', '٣', '7 50', '0x10', 'NaN', 'Infinity',
    '21474837', // more than a 32-bit integer of cents: the RPC takes an integer
    '99999999999999999999',
    null, undefined, 7, {},
  ];
  for (const text of invalid) assert.equal(parseEuroToCents(text), null, `${JSON.stringify(text)} must not parse`);
});

test('cents_to_input_round_trips', () => {
  assert.equal(centsToInput(1150), '11.50');
  assert.equal(centsToInput(1100), '11.00');
  assert.equal(centsToInput(5), '0.05');
  assert.equal(centsToInput(0), '0.00');
  for (const cents of [1, 99, 100, 1150, 2300, 123456]) assert.equal(parseEuroToCents(centsToInput(cents)), cents);
  for (const bad of [null, undefined, -1, 1.5, NaN, '7']) assert.equal(centsToInput(bad), '');
});

test('attention_labels', () => {
  assert.equal(attentionLabel({ attention: 'problem' }), 'Problem open');
  assert.equal(attentionLabel({ attention: 'refund_failed' }), 'Refund failed');
  assert.equal(attentionLabel({ attention: 'transfer_failed' }), 'Transfer failed');
  for (const none of [{ attention: null }, { attention: 'other' }, { attention: 7 }, { attention: 'constructor' }, {}, null, undefined]) {
    assert.equal(attentionLabel(none), '', JSON.stringify(none));
  }
});

test('open_cases', () => {
  assert.deepEqual(openProblems(caseRow({ problems: [wentWrong, dispute, { ...wentWrong, id: 'x', status: 'resolved' }, null] })).map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(openProblems(null), []);
  // Open means an open problem or a failed refund or transfer (what the RPC lists).
  assert.equal(isOpenCase(caseRow()), true);
  assert.equal(isOpenCase(caseRow({ problems: [], attention: 'refund_failed' })), true);
  assert.equal(isOpenCase(caseRow({ problems: [], attention: 'transfer_failed' })), true);
  assert.equal(isOpenCase(caseRow({ problems: [{ ...wentWrong, status: 'resolved' }], attention: null })), false);
  assert.equal(isOpenCase(caseRow({ attention: null })), true); // an open problem is enough
  assert.equal(isOpenCase(null), false);
});

test('refundable_and_split_match_the_oracle', () => {
  assert.equal(refundableCents(caseRow()), 2300);
  assert.equal(refundableCents(caseRow({}, { refunded_cents: 500 })), 1800);
  assert.equal(refundableCents(caseRow({}, { refunded_cents: 2300 })), 0);
  assert.equal(refundableCents(caseRow({}, { refunded_cents: 9999 })), 0);
  assert.equal(refundableCents(caseRow({}, { refunded_cents: null })), 2300);
  assert.equal(refundableCents(caseRow({}, { price_cents: null })), null);
  assert.equal(refundableCents(caseRow({}, { price_cents: -5 })), null);
  assert.equal(refundableCents(null), null);

  // split(price, refunded): kept = price - refunded, commission = pct_of(kept, 20), payout = kept - commission.
  // Rows from the money oracle in the plan:
  assert.deepEqual(splitAfterRefund(2200, 700), { kept: 1500, commission: 300, payout: 1200 }); // team_partial
  assert.deepEqual(splitAfterRefund(2200, 1600), { kept: 600, commission: 120, payout: 480 }); // team_after_policy_refund
  assert.deepEqual(splitAfterRefund(2200, 1100), { kept: 1100, commission: 220, payout: 880 }); // no_show_at_start_moderate
  assert.deepEqual(splitAfterRefund(1999, 0), { kept: 1999, commission: 400, payout: 1599 }); // completed_odd_commission
  assert.deepEqual(splitAfterRefund(1105, 553), { kept: 552, commission: 110, payout: 442 }); // odd_price_half_rounds_up
  assert.deepEqual(splitAfterRefund(2200, 2200), { kept: 0, commission: 0, payout: 0 }); // a full refund: no commission
  assert.deepEqual(splitAfterRefund(2300, 1150), { kept: 1150, commission: 230, payout: 920 }); // the P4 mockup
  assert.equal(splitAfterRefund(2200, 2300).kept, 0);
  assert.equal(splitAfterRefund(null, 0), null);
  assert.equal(splitAfterRefund(2200, 1.5), null);
});

test('suggested_refund_only_for_customer_no_show', () => {
  const noShow = { ...wentWrong, id: 'p3', kind: 'customer_no_show', reporter_role: 'pro' };
  assert.equal(suggestedRefund(caseRow({ problems: [noShow], suggested_no_show_refund_cents: 1100 })), 1100);
  // Not for other kinds, not once the no-show report is resolved, and not when the policy suggests nothing.
  assert.equal(suggestedRefund(caseRow({ suggested_no_show_refund_cents: 1100 })), null);
  assert.equal(suggestedRefund(caseRow({ problems: [{ ...noShow, status: 'resolved' }], suggested_no_show_refund_cents: 1100 })), null);
  assert.equal(suggestedRefund(caseRow({ problems: [noShow], suggested_no_show_refund_cents: 0 })), null);
  for (const bad of [null, undefined, -5, 1.5, '1100']) {
    assert.equal(suggestedRefund(caseRow({ problems: [noShow], suggested_no_show_refund_cents: bad })), null);
  }
  // A suggestion above what is left to refund is not offered.
  assert.equal(suggestedRefund(caseRow({ problems: [noShow], suggested_no_show_refund_cents: 3000 })), null);
});

test('failed_jobs', () => {
  const row = caseRow({
    problems: [], attention: 'refund_failed',
    failed_jobs: [
      { id: 'j1', kind: 'refund', last_error: 'card closed' },
      { id: 'j2', kind: 'transfer', last_error: null },
      { id: 'j3', kind: 'something_else' },
      { kind: 'refund' }, null, 'x',
    ],
  });
  assert.deepEqual(failedJobs(row), [
    { id: 'j1', kind: 'refund', label: 'refund', error: 'card closed' },
    { id: 'j2', kind: 'transfer', label: 'transfer', error: null },
    { id: 'j3', kind: 'something_else', label: 'payment job', error: null },
  ]);
  assert.equal(failedJobs(caseRow({ failed_jobs: [{ id: 'j4', kind: 'transfer_reversal' }] }))[0].label, 'transfer reversal');
  for (const none of [caseRow(), null, { failed_jobs: 'x' }]) assert.deepEqual(failedJobs(none), []);
});

test('case_items_for_the_list', () => {
  assert.deepEqual(caseItems(caseRow()), [{ who: 'Daan Visser', role: 'pet parent', reason: 'Something went wrong' }]);
  const noShow = { ...wentWrong, id: 'p3', kind: 'customer_no_show', reporter_role: 'pro' };
  const items = caseItems(caseRow({ problems: [wentWrong, noShow, dispute, { ...wentWrong, id: 'old', status: 'resolved' }] }));
  assert.deepEqual(items, [
    { who: 'Daan Visser', role: 'pet parent', reason: 'Something went wrong' },
    { who: 'Happy Paws Walking', role: 'pro', reason: 'The customer didn’t show up' },
    { who: 'Card dispute', role: 'from the card issuer', reason: 'Card dispute' },
  ]);
  assert.deepEqual(caseItems(caseRow({ problems: [{ ...dispute, kind: 'suspension' }] })),
    [{ who: 'Pro suspended', role: 'opened automatically', reason: 'The pro was suspended' }]);
  // A deleted account is not an empty name.
  assert.equal(caseItems(caseRow({ customer: null }))[0].who, 'Pet parent');
  assert.equal(caseItems(caseRow({ problems: [{ ...wentWrong, reporter_role: 'pro' }], pro: null }))[0].who, 'Pro');
  // No open problem, but money failed: the system is the reporter.
  assert.deepEqual(caseItems(caseRow({ problems: [], attention: 'refund_failed' })),
    [{ who: 'Zoovo', role: 'automatic check', reason: 'Refund failed' }]);
  // Everything resolved (the page keeps the case on screen to show the answer): the resolved problems are named.
  const resolvedRow = caseRow({ problems: [{ ...wentWrong, status: 'resolved', resolution: 'release' }], attention: null });
  assert.deepEqual(caseItems(resolvedRow), [{ who: 'Daan Visser', role: 'pet parent', reason: 'Something went wrong' }]);
  // ...unless money failed after the decision: then that is what needs a person.
  assert.equal(caseItems({ ...resolvedRow, attention: 'transfer_failed' })[0].reason, 'Transfer failed');
  assert.equal(caseItems(caseRow({ problems: [], attention: null }))[0].reason, 'Nothing open');
  assert.equal(problemKindLabel('pro_no_show'), 'The pro didn’t show up');
  assert.equal(problemKindLabel('other'), 'Other');
  assert.equal(problemKindLabel('brand_new'), 'brand_new');
  assert.equal(problemKindLabel(null), 'Problem');
  assert.equal(problemKindLabel('constructor'), 'constructor');
});

test('waiting_since', () => {
  const older = { ...wentWrong, id: 'o', created_at: '2026-10-05T09:00:00Z' };
  assert.equal(waitingSince(caseRow({ problems: [wentWrong, older, { ...wentWrong, status: 'resolved', created_at: '2026-01-01T00:00:00Z' }] })), '2026-10-05T09:00:00Z');
  assert.equal(waitingSince(caseRow({ problems: [{ ...wentWrong, created_at: 'nope' }] })), null);
  // No open problem: the first failed refund.
  assert.equal(waitingSince(caseRow({
    problems: [], refunds: [{ status: 'succeeded', created_at: '2026-10-01T00:00:00Z' }, { status: 'failed', created_at: '2026-10-02T08:00:00Z' }],
  })), '2026-10-02T08:00:00Z');
  assert.equal(waitingSince(caseRow({ problems: [] })), null);
  assert.equal(waitingSince(null), null);
});

test('when_labels', () => {
  assert.equal(whenLabel('2026-10-08T07:40:00Z'), 'Thu 8 Oct, 09:40');
  assert.equal(whenLabel('2026-10-26T08:00:00Z'), 'Mon 26 Oct, 09:00'); // winter time
  for (const bad of [null, undefined, 'nope', 5]) assert.equal(whenLabel(bad), '—');
  // One day: the end shows only the time. Several days: both ends in full.
  assert.equal(bookingWhen('2026-10-07T14:00:00Z', '2026-10-07T15:00:00Z'), 'Wed 7 Oct, 16:00 – 17:00');
  assert.equal(bookingWhen('2026-10-23T06:00:00Z', '2026-10-25T18:00:00Z'), 'Fri 23 Oct, 08:00 – Sun 25 Oct, 19:00');
  // Amsterdam's day, not UTC's: 22:30 UTC is already the next morning.
  assert.equal(bookingWhen('2026-10-07T21:30:00Z', '2026-10-07T22:30:00Z'), 'Wed 7 Oct, 23:30 – Thu 8 Oct, 00:30');
  assert.equal(bookingWhen('2026-10-07T14:00:00Z', null), 'Wed 7 Oct, 16:00');
  assert.equal(bookingWhen(null, null), '—');
});

test('cancellation_text', () => {
  const cancelled = (over) => ({
    status: 'cancelled', cancelled_by: 'pro', cancel_reason: 'unwell', cancel_note: 'Flu, sorry.',
    cancelled_at: '2026-10-04T10:15:00Z', ...over,
  });
  assert.equal(cancellationText(cancelled({})), 'Cancelled by the pro on Sun 4 Oct, 12:15 · Reason: I’m ill · “Flu, sorry.”');
  assert.equal(cancellationText(cancelled({ cancelled_by: 'customer', cancel_reason: 'plans_changed', cancel_note: null })),
    'Cancelled by the pet parent on Sun 4 Oct, 12:15 · Reason: Plans changed');
  // A customer who gave no reason is stored as 'customer'.
  assert.equal(cancellationText(cancelled({ cancelled_by: 'customer', cancel_reason: 'customer', cancel_note: '  ' })),
    'Cancelled by the pet parent on Sun 4 Oct, 12:15 · Reason: No reason given');
  // The system (cancelled_by null) says so, and has no reason line unless it stored one.
  assert.equal(cancellationText(cancelled({ cancelled_by: null, cancel_reason: null, cancel_note: null })),
    'Cancelled automatically on Sun 4 Oct, 12:15');
  assert.equal(cancellationText(cancelled({ cancelled_by: null, cancel_reason: 'slot_taken', cancel_note: null })),
    'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: slot_taken');
  assert.equal(cancellationText(cancelled({ cancelled_at: null })), 'Cancelled by the pro · Reason: I’m ill · “Flu, sorry.”');
  for (const notCancelled of [{ status: 'completed' }, { status: 'confirmed', cancelled_by: 'pro' }, null, undefined]) {
    assert.equal(cancellationText(notCancelled), null);
  }
});

test('labels', () => {
  assert.equal(transferLabel('frozen'), 'On hold');
  assert.equal(transferLabel('sent'), 'Sent');
  assert.equal(transferLabel('withheld'), 'Withheld');
  assert.equal(transferLabel('none'), 'No payout');
  assert.equal(transferLabel('brand_new'), 'brand_new');
  assert.equal(transferLabel(null), '—');
  assert.equal(methodLabel('ideal'), 'iDEAL');
  assert.equal(methodLabel('apple_pay'), 'Apple Pay');
  assert.equal(methodLabel('card'), 'card');
  assert.equal(methodLabel(null), 'unknown');
  assert.equal(paymentStatusLabel('partially_refunded'), 'Partly refunded');
  assert.equal(paymentStatusLabel('paid'), 'Paid');
  assert.equal(paymentStatusLabel(null), '—');
  assert.equal(disputeStatusLabel('needs_response'), 'Needs a response');
  assert.equal(disputeStatusLabel('lost'), 'Lost');
  assert.equal(disputeStatusLabel('something_new'), 'something_new');
  assert.equal(disputeStatusLabel(null), null);
  assert.equal(resolutionText({ resolution: 'full_refund' }), 'Refunded in full');
  assert.equal(resolutionText({ resolution: 'partial_refund', resolution_cents: 1150 }), 'Refunded €11.50');
  assert.equal(resolutionText({ resolution: 'partial_refund', resolution_cents: null }), 'Partly refunded');
  assert.equal(resolutionText({ resolution: 'release' }), 'Payout released');
  assert.equal(resolutionText({ resolution: 'withhold' }), 'Payout withheld');
  assert.equal(resolutionText({ resolution: null }), null);
  assert.equal(resolutionText({ resolution: 'constructor' }), null);
});

test('refund_and_problem_rows', () => {
  const row = caseRow({
    refunds: [
      { amount_cents: 1100, reason: 'policy', status: 'succeeded', created_at: '2026-10-05T09:00:00Z', note: null },
      { amount_cents: 500, reason: 'team', status: 'failed', created_at: '2026-10-08T09:00:00Z', note: 'Half for the cut paw.' },
      { amount_cents: 50, reason: 'brand_new', status: 'requested', created_at: 'nope', note: '  ' },
      null,
    ],
    problems: [
      wentWrong,
      { ...dispute, status: 'resolved', dispute_status: 'lost', resolution: 'partial_refund', resolution_cents: 500, resolution_note: 'Half.' },
    ],
  });
  assert.deepEqual(refundRows(row), [
    { amount: '€11', reason: 'Cancellation policy', status: 'Refunded', failed: false, when: 'Mon 5 Oct, 11:00', note: null },
    { amount: '€5', reason: 'Team decision', status: 'Failed', failed: true, when: 'Thu 8 Oct, 11:00', note: 'Half for the cut paw.' },
    { amount: '€0.50', reason: 'brand_new', status: 'Queued', failed: false, when: '—', note: null },
  ]);
  assert.deepEqual(refundRows(caseRow()), []);
  const details = problemDetails(row);
  assert.equal(details.length, 2);
  assert.deepEqual(details[0], {
    id: 'p1', kind: 'Something went wrong', who: 'Daan Visser', role: 'pet parent', open: true,
    note: 'Max came back with a cut paw.', dispute: null, when: 'Thu 8 Oct, 09:40', resolution: null, resolutionNote: null,
  });
  assert.deepEqual(details[1], {
    id: 'p2', kind: 'Card dispute', who: 'Card dispute', role: 'from the card issuer', open: false,
    note: null, dispute: 'Lost', when: 'Fri 9 Oct, 12:00', resolution: 'Refunded €5', resolutionNote: 'Half.',
  });
});

test('decision_texts_name_the_amount', () => {
  const row = caseRow();
  // Refund in full.
  assert.equal(decisionPreview(row, 'full_refund', null), 'Daan Visser gets everything back. Happy Paws Walking receives nothing; no commission.');
  assert.match(confirmText(row, 'full_refund', null), /^Refund €23 in full to Daan Visser\?/);
  assert.match(confirmText(row, 'full_refund', null), /Happy Paws Walking will receive nothing/);
  // Part of it was refunded before: only the rest is refunded.
  const some = caseRow({}, { refunded_cents: 500 });
  assert.equal(decisionPreview(some, 'full_refund', null), 'Daan Visser gets the remaining €18 back. Happy Paws Walking receives nothing; no commission.');
  assert.match(confirmText(some, 'full_refund', null), /^Refund €18 in full/);
  // Refund part: the preview is the P4 mockup's sentence, and the question names the same amount.
  assert.equal(decisionPreview(row, 'partial_refund', 1150), 'Daan Visser gets €11.50 back. Happy Paws Walking receives €9.20 and Zoovo keeps €2.30.');
  assert.match(confirmText(row, 'partial_refund', 1150), /^Refund €11\.50 to Daan Visser\?/);
  assert.match(confirmText(row, 'partial_refund', 1150), /receive €9\.20 and Zoovo keeps €2\.30/);
  assert.match(confirmText(some, 'partial_refund', 700), /receive €8\.80 and Zoovo keeps €2\.20/); // 2300 - 500 - 700 = 1100 kept
  assert.equal(decisionPreview(row, 'partial_refund', 0), '');
  assert.equal(decisionPreview(row, 'partial_refund', 2301), '');
  assert.equal(decisionPreview(row, 'partial_refund', null), '');
  // Release and withhold name the payout.
  assert.equal(decisionPreview(row, 'release', null), 'No refund. Happy Paws Walking is paid €18.40 at the next payout run.');
  assert.match(confirmText(row, 'release', null), /^Release the payout of €18\.40 to Happy Paws Walking/);
  assert.equal(decisionPreview(row, 'withhold', null), 'No refund. Happy Paws Walking is not paid €18.40 for this booking.');
  assert.match(confirmText(row, 'withhold', null), /^Withhold the payout of €18\.40 from Happy Paws Walking\?/);
  assert.match(decisionPreview(caseRow({}, { transfer_status: 'sent' }), 'release', null), /already sent/);
  // Withholding a payout that was already sent only marks it; taking the money back is the reversal.
  const sentRow = caseRow({}, { transfer_status: 'sent' });
  assert.match(decisionPreview(sentRow, 'withhold', null), /does not take back money.*Reverse transfer/);
  assert.match(confirmText(sentRow, 'withhold', null), /^Withhold the payout of €18\.40 from Happy Paws Walking\? The transfer was already sent, and this does not take it back/);
  assert.match(decisionPreview(caseRow({}, { payout_cents: 0, transfer_status: 'none' }), 'release', null), /closes the case/);
  // Every confirmation says that both sides are told.
  for (const [decision, cents] of [['full_refund', null], ['partial_refund', 100], ['release', null], ['withhold', null]]) {
    assert.match(confirmText(row, decision, cents), /Both are notified/);
  }
  // A missing account still reads well.
  assert.match(confirmText(caseRow({ customer: null, pro: null }), 'partial_refund', 100), /^Refund €1 to the pet parent\? The pro will receive/);
  assert.equal(confirmText(row, 'burn', null), '');
  // The reversal and the retry.
  const sent = caseRow({}, { transfer_status: 'sent' });
  assert.match(reverseConfirmText(sent), /^Reverse the transfer of €18\.40 to Happy Paws Walking\?/);
  assert.match(retryConfirmText({ kind: 'refund', label: 'refund' }), /^Retry the failed refund\?/);
});

test('saved_text_comes_from_the_returned_row', () => {
  const resolved = caseRow({
    problems: [{ ...wentWrong, status: 'resolved', resolution: 'partial_refund', resolution_cents: 1150, resolution_note: NOTE }],
    refunds: [{ amount_cents: 1150, reason: 'team', status: 'requested', created_at: '2026-10-10T08:00:00Z', note: NOTE }],
    attention: null,
  }, { refunded_cents: 1150, payout_cents: 920, commission_cents: 230 });
  assert.equal(savedText(resolved), 'Decision saved: Refunded €11.50. The refund is queued; its status is below.');
  assert.equal(savedText(caseRow({
    problems: [{ ...wentWrong, status: 'resolved', resolution: 'release' }], attention: null,
  })), 'Decision saved: Payout released.');
  assert.equal(savedText(caseRow({
    problems: [{ ...wentWrong, status: 'resolved', resolution: 'full_refund' }],
    refunds: [{ amount_cents: 2300, reason: 'team', status: 'succeeded', created_at: '2026-10-10T08:00:00Z' }], attention: null,
  })), 'Decision saved: Refunded in full.');
  // A refund that Stripe has not finished is queued too, whether it is 'requested' or 'pending'.
  assert.match(savedText(caseRow({
    problems: [{ ...wentWrong, status: 'resolved', resolution: 'full_refund' }],
    refunds: [{ amount_cents: 2300, reason: 'team', status: 'pending', created_at: '2026-10-10T08:00:00Z' }], attention: null,
  })), /queued/);
  // Still open problems in the answer: the page must not claim a success, even when one is resolved.
  assert.equal(savedText(caseRow()), null);
  assert.equal(savedText(caseRow({ problems: [wentWrong, { ...dispute, status: 'resolved', resolution: 'release' }] })), null);
  assert.equal(savedText(null), null);
});

test('chat_lines', () => {
  const row = caseRow();
  // The RPC sends the newest first; the page reads oldest first.
  const lines = chatLines([
    { body: 'It was fine!', kind: 'text', sender_role: 'pro', created_at: '2026-10-08T08:00:00Z', deleted: false },
    { body: 'Max has a cut paw', kind: 'text', sender_role: 'customer', created_at: '2026-10-08T07:30:00Z', deleted: false },
    { body: 'oops', kind: 'text', sender_role: 'customer', created_at: '2026-10-08T07:10:00Z', deleted: true },
    { body: 'Booking: Dog walking, 60 min', kind: 'booking', sender_role: null, created_at: '2026-10-06T17:12:00Z', deleted: false },
  ], row);
  assert.deepEqual(lines, [
    { who: 'Booking', when: 'Tue 6 Oct, 19:12', text: 'Booking: Dog walking, 60 min', muted: true },
    { who: 'Daan Visser', when: 'Thu 8 Oct, 09:10', text: 'Message deleted', muted: true },
    { who: 'Daan Visser', when: 'Thu 8 Oct, 09:30', text: 'Max has a cut paw', muted: false },
    { who: 'Happy Paws Walking', when: 'Thu 8 Oct, 10:00', text: 'It was fine!', muted: false },
  ]);
  assert.equal(chatLines([{ body: 'hi', kind: 'text', sender_role: 'customer', created_at: 'nope' }], caseRow({ customer: null }))[0].who, 'Pet parent');
  assert.equal(chatLines([{ body: 'hi', kind: 'text', sender_role: 'someone', created_at: null }], row)[0].who, 'Someone');
  for (const none of [null, undefined, 'x', {}]) assert.deepEqual(chatLines(none, row), []);
});

test('case_rows_and_errors', () => {
  const row = caseRow();
  assert.equal(asCaseRow(row, 'b1'), row);
  for (const bad of [null, undefined, 'x', [], {}, { booking: { id: 'other' }, problems: [] }, { booking: { id: 'b1' } }, { booking: null, problems: [] }]) {
    assert.equal(asCaseRow(bad, 'b1'), null, JSON.stringify(bad));
  }
  assert.match(saveErrorText({ message: 'invalid_input' }), /refused|already/i);
  assert.match(saveErrorText({ code: '42501', message: 'Admins only' }), /admin/i);
  assert.equal(saveErrorText({ message: 'connection reset' }), 'Couldn’t save: connection reset');
  assert.equal(saveErrorText({}), 'Couldn’t save: unknown error');
  assert.equal(saveErrorText(null), 'Couldn’t save: unknown error');
});
