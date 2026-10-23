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
  paymentStatusLabel, disputeStatusLabel, resolutionText, createRequestTracker,
  transferredCents, reverseLabel, notifiedText, decisionButtonLabel, moneyFlags,
  recordRefundConfirmText, recordedText, requeueableRefunds, canRequeue, requeueConfirmText,
  requeuedText, seenLogId, decisionNoticeText, canCheckTransfer, checkTransferConfirmText,
  stripeRefundStatusLabel, decisionArgs, CASE_CHANGED, retryLabel, paymentHealth, strayPayments,
  strayPaymentNotes, onlyStrayPayments, waitedFor, waitingTexts, keepWaiting, markHandledArgs,
  markHandledConfirmText, markedHandledText, markHandledErrorText,
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
  seen_log_id: 7,
  ...over,
});
// The same row without the key at all (a server that doesn't send it).
const withoutSeen = (row) => {
  const { seen_log_id: _gone, ...rest } = row;
  return rest;
};
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

test('allowed_decisions_follow_the_servers_list', () => {
  // The case row says which decisions the database accepts (booking_decision_refusal): exactly those are offered,
  // in the server's order, whatever the client-side rule would say.
  assert.deepEqual(allowedDecisions(caseRow({ allowed_decisions: ['full_refund', 'release'] })), ['full_refund', 'release']);
  // An attention-only case (money flagged, no open problem) can be closed with release.
  assert.deepEqual(allowedDecisions(caseRow({ problems: [], attention: 'refund_failed', allowed_decisions: ['release'] })), ['release']);
  // Nothing allowed although a problem is open (a payout that is sent or failed, a Stripe refund not recorded yet).
  assert.deepEqual(allowedDecisions(caseRow({ allowed_decisions: [] })), []);
  // A booking that was never confirmed gets no partial refund; the server leaves it out.
  assert.deepEqual(allowedDecisions(caseRow({ allowed_decisions: ['full_refund', 'release'] })).includes('partial_refund'), false);
  // A dispute: the server's list wins, even if it holds something the old rule wouldn't.
  assert.deepEqual(allowedDecisions(caseRow({ problems: [dispute], allowed_decisions: ['release', 'withhold'] })), ['release', 'withhold']);
  assert.deepEqual(allowedDecisions(caseRow({ problems: [dispute], allowed_decisions: ['full_refund'] })), ['full_refund']);
  // Acknowledge: a payout mismatch or money flagged without a report, which no refund or release settles.
  assert.deepEqual(allowedDecisions(caseRow({ problems: [], attention: 'payout_mismatch', allowed_decisions: ['acknowledge'] })), ['acknowledge']);
  assert.deepEqual(allowedDecisions(caseRow({ problems: [], attention: 'refund_failed', allowed_decisions: ['release', 'acknowledge'] })), ['release', 'acknowledge']);
  // Names the page doesn't know, duplicates and junk are dropped.
  assert.deepEqual(allowedDecisions(caseRow({ allowed_decisions: ['release', 'burn', 'release', 7, null, 'withhold'] })), ['release', 'withhold']);
  // Without the key (a database from before it) the client-side rule is the fallback.
  for (const noKey of ['release', null, {}, 7]) assert.deepEqual(allowedDecisions(caseRow({ allowed_decisions: noKey })), NORMAL);
  assert.deepEqual(allowedDecisions(caseRow({ allowed_decisions: undefined, problems: [] })), []);
  // The caller gets its own array.
  const own = allowedDecisions(caseRow({ allowed_decisions: ['release'] }));
  own.push('nope');
  assert.deepEqual(allowedDecisions(caseRow({ allowed_decisions: ['release'] })), ['release']);
  // validateDecision offers what the server offers.
  const flagOnly = caseRow({ problems: [], attention: 'refund_failed', allowed_decisions: ['release'] });
  assert.equal(validateDecision(flagOnly, 'release', null, NOTE), null);
  assert.match(validateDecision(flagOnly, 'full_refund', null, NOTE), /not available/);
  assert.equal(validateDecision(caseRow({ allowed_decisions: ['full_refund'] }), 'full_refund', null, NOTE), null);
  assert.match(validateDecision(caseRow({ allowed_decisions: ['full_refund'] }), 'release', null, NOTE), /not available/);
  assert.match(validateDecision(caseRow({ allowed_decisions: [] }), 'release', null, NOTE), /no decision can be made/i);
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
  // The payout that was sent isn't the payout owed, or a lookup at Stripe found something else.
  assert.equal(attentionLabel({ attention: 'payout_mismatch' }), 'Payout amount differs');
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
      { id: 'j1', kind: 'refund', last_error: 'card closed', amount_cents: 700 },
      { id: 'j2', kind: 'transfer', last_error: null, amount_cents: 1200 },
      { id: 'j3', kind: 'something_else' },
      { kind: 'refund' }, null, 'x',
    ],
  });
  // The database says which failed jobs can be retried (payment_job_retry_refusal): retryable, else the reason.
  assert.deepEqual(failedJobs(row), [
    { id: 'j1', kind: 'refund', label: 'refund', cents: 700, error: 'card closed', retryable: false, refusal: null },
    { id: 'j2', kind: 'transfer', label: 'transfer', cents: 1200, error: null, retryable: false, refusal: null },
    { id: 'j3', kind: 'something_else', label: 'payment job', cents: null, error: null, retryable: false, refusal: null },
  ]);
  const shaped = failedJobs(caseRow({
    failed_jobs: [
      { id: 'a', kind: 'transfer', last_error: 'balance_insufficient', retryable: true, retry_refusal: null },
      { id: 'b', kind: 'refund', last_error: null, retryable: false, retry_refusal: ' Refund 9 failed for good: requeue it (admin_requeue_refund) or decide the case ' },
      { id: 'c', kind: 'transfer', retryable: 'true', retry_refusal: null }, // only the boolean true is a yes
      { id: 'd', kind: 'transfer', retryable: true, retry_refusal: 'A case is open on this booking: decide it first' }, // contradictory: a refusal is a no
    ],
  }));
  assert.deepEqual(shaped.map((j) => [j.id, j.retryable, j.refusal]), [
    ['a', true, null],
    ['b', false, 'Refund 9 failed for good: requeue it (admin_requeue_refund) or decide the case'],
    ['c', false, null],
    ['d', false, 'A case is open on this booking: decide it first'],
  ]);
  assert.equal(failedJobs(caseRow({ failed_jobs: [{ id: 'j4', kind: 'transfer_reversal' }] }))[0].label, 'transfer reversal');
  // A lookup of a transfer at Stripe is a job too (its retryable and retry_refusal mean what they do for the others).
  assert.deepEqual(failedJobs(caseRow({ failed_jobs: [{ id: 'j5', kind: 'transfer_lookup', last_error: 'timeout', retryable: true, retry_refusal: null }] })),
    [{ id: 'j5', kind: 'transfer_lookup', label: 'transfer lookup', cents: null, error: 'timeout', retryable: true, refusal: null }]);
  // amount_cents (what a retry asks Stripe for) only as a whole number of at least 0.
  for (const bad of ['700', -1, 1.5, null, undefined]) {
    assert.equal(failedJobs(caseRow({ failed_jobs: [{ id: 'j6', kind: 'refund', amount_cents: bad }] }))[0].cents, null, String(bad));
  }
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
  // A refund that failed for good opens a case of its own, with no reporter.
  assert.equal(problemKindLabel('refund_failed'), 'Refund failed');
  assert.deepEqual(caseItems(caseRow({ problems: [{ ...wentWrong, kind: 'refund_failed', reporter_role: null }], attention: 'refund_failed' })),
    [{ who: 'Zoovo', role: 'opened automatically', reason: 'Refund failed' }]);
  assert.equal(problemKindLabel('other'), 'Other');
  assert.equal(problemKindLabel('brand_new'), 'brand_new');
  assert.equal(problemKindLabel(null), 'Problem');
  assert.equal(problemKindLabel('constructor'), 'constructor');
});

test('waiting_since', () => {
  // The server's own sort key (admin_list_problem_cases: waiting_since), whatever the problems say.
  const older = { ...wentWrong, id: 'o', created_at: '2026-10-05T09:00:00Z' };
  assert.equal(waitingSince(caseRow({ problems: [wentWrong, older], waiting_since: '2026-10-04T07:15:00Z' })), '2026-10-04T07:15:00Z');
  // A case with no open problem has one too: a failed transfer, a payout mismatch, a stray payment.
  for (const attention of ['transfer_failed', 'payout_mismatch', 'refund_failed']) {
    assert.equal(waitingSince(caseRow({ problems: [], attention, waiting_since: '2026-10-20T07:30:00Z' })), '2026-10-20T07:30:00Z', attention);
  }
  // Nothing is worked out any more: a row without the key (an action's answer) or with null (a resolved row) has no time,
  // even when it has open problems or failed refunds whose dates could be used.
  assert.equal(waitingSince(caseRow({ problems: [wentWrong, older] })), null);
  assert.equal(waitingSince(caseRow({ problems: [wentWrong], waiting_since: null })), null);
  assert.equal(waitingSince(caseRow({
    problems: [], attention: 'refund_failed', refunds: [{ status: 'failed', created_at: '2026-10-02T08:00:00Z' }],
  })), null);
  // No time on a case nobody waits on, even if the value is still there.
  const closed = caseRow({ problems: [{ ...wentWrong, status: 'resolved', resolution: 'release' }], attention: null, waiting_since: '2026-10-04T07:15:00Z' });
  assert.equal(waitingSince(closed), null);
  // Only a date is a time.
  for (const bad of ['nope', '', 5, {}, [], true, '<b>2026-10-04</b>']) assert.equal(waitingSince(caseRow({ waiting_since: bad })), null, String(bad));
  assert.equal(waitingSince(null), null);
  assert.equal(waitingSince('x'), null);
});

test('waiting_texts', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  // The card gives the day and time in Amsterdam, the list only how long. 22:30 UTC is already the next day there.
  assert.deepEqual(waitingTexts(caseRow({ waiting_since: '2026-10-21T22:30:00Z' }), now),
    { list: 'waiting 37 h', card: 'Waiting since Thu 22 Oct, 00:30 · 37 h' });
  assert.deepEqual(waitingTexts(caseRow({ problems: [], attention: 'transfer_failed', waiting_since: '2026-10-20T09:00:00Z' }), now),
    { list: 'waiting 3 days', card: 'Waiting since Tue 20 Oct, 11:00 · 3 days' });
  assert.deepEqual(waitingTexts(caseRow({ waiting_since: '2026-10-23T11:30:00Z' }), now),
    { list: 'waiting less than an hour', card: 'Waiting since Fri 23 Oct, 13:30 · less than an hour' });
  // After the clocks go back (25 Oct) Amsterdam is one hour ahead of UTC, not two.
  assert.equal(waitingTexts(caseRow({ waiting_since: '2026-10-25T23:30:00Z' }), Date.parse('2026-10-26T12:00:00Z')).card,
    'Waiting since Mon 26 Oct, 00:30 · 12 h');
  // A time that is a little ahead (clocks differ) is not a negative wait.
  assert.equal(waitingTexts(caseRow({ waiting_since: '2026-10-23T12:05:00Z' }), now).list, 'waiting less than an hour');
  // Resolved rows, rows without a time and rows that aren't cases show nothing.
  assert.equal(waitingTexts(caseRow({ problems: [], attention: null, waiting_since: null }), now), null);
  assert.equal(waitingTexts(caseRow(), now), null);
  assert.equal(waitingTexts(null, now), null);
  // The wording the other tabs use: whole hours up to two days, then days.
  const at = (hours) => waitedFor(new Date(now - hours * 36e5).toISOString(), now);
  assert.deepEqual([0, 0.99, 1, 47.9, 48, 49, 120].map(at), ['less than an hour', 'less than an hour', '1 h', '47 h', '2 days', '2 days', '5 days']);
});

test('answers_keep_the_waiting_time_while_the_case_is_open', () => {
  // An action's answer is a case row without waiting_since; the list's value for that case is kept while it is still open.
  const listed = caseRow({ waiting_since: '2026-10-05T09:00:00Z' });
  const answered = caseRow();
  const kept = keepWaiting(answered, listed);
  assert.equal(kept.waiting_since, '2026-10-05T09:00:00Z');
  assert.equal(Object.hasOwn(answered, 'waiting_since'), false); // the answer itself is not changed
  // A case the answer closed has no time to keep.
  const closed = caseRow({ problems: [{ ...wentWrong, status: 'resolved', resolution: 'release' }], attention: null });
  assert.equal(Object.hasOwn(keepWaiting(closed, listed), 'waiting_since'), false);
  // An answer that does say (null included), or a list row with no usable time, is left as it is.
  assert.equal(keepWaiting({ ...answered, waiting_since: null }, listed).waiting_since, null);
  assert.equal(keepWaiting({ ...answered, waiting_since: '2026-10-06T09:00:00Z' }, listed).waiting_since, '2026-10-06T09:00:00Z');
  assert.equal(keepWaiting(answered, caseRow()), answered);
  assert.equal(keepWaiting(answered, caseRow({ waiting_since: 'nope' })), answered);
  assert.equal(keepWaiting(answered, null), answered);
  assert.equal(keepWaiting(null, listed), null);
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
  const system = (reason) => cancellationText(cancelled({ cancelled_by: null, cancel_reason: reason, cancel_note: null }));
  assert.equal(system('slot_taken'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: Time no longer available');
  // The reasons the database gives for cancelling by itself, in words.
  assert.equal(system('pro_suspended'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: Pro suspended');
  assert.equal(system('account_deleted'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: Account deleted');
  assert.equal(system('hold_expired'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: Payment not completed in time');
  assert.equal(system('payment_cancelled'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: Payment cancelled');
  assert.equal(system('payment_mismatch'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: Payment amount mismatch');
  assert.equal(system('something_new'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: something_new'); // unknown: as it is
  assert.equal(system('constructor'), 'Cancelled automatically on Sun 4 Oct, 12:15 · Reason: constructor');
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
      { amount_cents: 2300, reason: 'hold_expired', status: 'pending', created_at: '2026-10-08T10:00:00Z', note: null },
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
    { amount: '€23', reason: 'Payment too late', status: 'Pending', failed: false, when: 'Thu 8 Oct, 12:00', note: null },
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
  // The payout is due Fri 9 Oct, 17:00 Amsterdam. Before that it waits for the date; after it, for the next payout run.
  const beforeDue = Date.parse('2026-10-08T12:00:00Z');
  const afterDue = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(decisionPreview(row, 'release', null, beforeDue), 'No refund. Happy Paws Walking is paid €18.40 once it is due (Fri 9 Oct, 17:00).');
  assert.equal(decisionPreview(row, 'release', null, afterDue), 'No refund. Happy Paws Walking is paid €18.40 at the next payout run.');
  assert.equal(decisionPreview(row, 'release', null, Date.parse('2026-10-09T15:00:00Z')), 'No refund. Happy Paws Walking is paid €18.40 at the next payout run.'); // due now
  for (const noDate of [null, 'nope', undefined]) {
    assert.match(decisionPreview(caseRow({}, { payout_due_at: noDate }), 'release', null, beforeDue), /at the next payout run/);
  }
  assert.match(confirmText(row, 'release', null), /^Release the payout of €18\.40 to Happy Paws Walking/);
  assert.equal(decisionPreview(row, 'withhold', null), 'No refund. Happy Paws Walking is not paid €18.40 for this booking.');
  assert.match(confirmText(row, 'withhold', null), /^Withhold the payout of €18\.40 from Happy Paws Walking\?/);
  assert.match(decisionPreview(caseRow({}, { transfer_status: 'sent' }), 'release', null), /already sent/);
  // Withholding a payout that was already sent only marks it; taking the money back is the reversal.
  const sentRow = caseRow({}, { transfer_status: 'sent' });
  // The preview says the payout was sent, that withholding only records the decision, and that Reverse takes money back.
  assert.equal(decisionPreview(sentRow, 'withhold', null),
    'The payout of €18.40 was already sent to Happy Paws Walking. Withholding only records the decision and takes nothing back: use Reverse transfer to take the money back.');
  assert.equal(confirmText(sentRow, 'withhold', null),
    'Withhold the payout of €18.40 from Happy Paws Walking? It was already sent: withholding only records the decision and takes nothing back (Reverse transfer does). Both are notified.');
  // The amount of a sent payout is what was transferred, not what the booking's payout reads now.
  const sentOther = caseRow({}, { transfer_status: 'sent', transferred_cents: 1750 });
  assert.equal(decisionPreview(sentOther, 'release', null), 'No refund. The payout of €17.50 was already sent to Happy Paws Walking.');
  assert.match(decisionPreview(sentOther, 'withhold', null), /^The payout of €17\.50 was already sent/);
  assert.match(confirmText(sentOther, 'release', null), /payout of €17\.50 was already sent/);
  assert.match(confirmText(sentOther, 'withhold', null), /^Withhold the payout of €17\.50 from/);
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
  // The reversal takes back what was transferred (booking.transferred_cents), not the booking's payout.
  const transferred = caseRow({}, { transfer_status: 'sent', transferred_cents: 1760 });
  assert.equal(reverseConfirmText(transferred),
    'Reverse the transfer of €17.60 to Happy Paws Walking? The money is taken back from their Stripe account.');
  // Without it the amount is not known, so none is named (never the payout's).
  assert.equal(reverseConfirmText(sent), 'Reverse the transfer to Happy Paws Walking? The money is taken back from their Stripe account.');
});

test('saved_text_names_the_decision_just_made', () => {
  const resolved = (over) => ({ ...wentWrong, status: 'resolved', resolution_note: NOTE, ...over });
  const team = (amount, status) => ({ amount_cents: amount, reason: 'team', status, created_at: '2026-10-10T08:00:00Z', note: NOTE });
  const sent = (decision, ...ids) => ({ decision, ids });

  const partial = caseRow({
    problems: [resolved({ resolution: 'partial_refund', resolution_cents: 1150 })],
    refunds: [team(1150, 'requested')], attention: null,
  }, { refunded_cents: 1150, payout_cents: 920, commission_cents: 230 });
  assert.equal(savedText(partial, sent('partial_refund', 'p1')), 'Decision saved: Refunded €11.50. The refund is queued; its status is below.');
  assert.equal(savedText(caseRow({ problems: [resolved({ resolution: 'release' })], attention: null }), sent('release', 'p1')),
    'Decision saved: Payout released.');
  assert.equal(savedText(caseRow({
    problems: [resolved({ resolution: 'full_refund', resolution_cents: 2300 })], refunds: [team(2300, 'succeeded')], attention: null,
  }), sent('full_refund', 'p1')), 'Decision saved: Refunded in full.');
  // A refund that Stripe has not finished is queued too, whether it is 'requested' or 'pending'.
  assert.match(savedText(caseRow({
    problems: [resolved({ resolution: 'full_refund', resolution_cents: 2300 })], refunds: [team(2300, 'pending')], attention: null,
  }), sent('full_refund', 'p1')), /queued/);

  // The banner is about the problems this request closed, not an earlier decision: an old resolved partial
  // refund of 5 euro sits next to a release that was just made, with an unrelated pending policy refund.
  const older = resolved({ id: 'old', created_at: '2026-10-01T08:00:00Z', resolution: 'partial_refund', resolution_cents: 500 });
  const release = caseRow({
    problems: [older, resolved({ resolution: 'release' })],
    refunds: [
      { amount_cents: 500, reason: 'team', status: 'pending', created_at: '2026-10-02T08:00:00Z' },
      { amount_cents: 1100, reason: 'policy', status: 'requested', created_at: '2026-10-03T08:00:00Z' },
    ], attention: null,
  });
  assert.equal(savedText(release, sent('release', 'p1')), 'Decision saved: Payout released.');
  // ...and it only mentions a queued refund when this decision made one: this team refund is 5 euro, not the 11.50 decided.
  assert.doesNotMatch(savedText(caseRow({
    problems: [older, resolved({ resolution: 'partial_refund', resolution_cents: 1150 })], refunds: [team(500, 'pending')], attention: null,
  }), sent('partial_refund', 'p1')), /queued/);

  // Only the team's own refund counts: a pending policy refund of the same amount is somebody else's.
  assert.doesNotMatch(savedText(caseRow({
    problems: [resolved({ resolution: 'partial_refund', resolution_cents: 1150 })],
    refunds: [{ amount_cents: 1150, reason: 'policy', status: 'pending', created_at: '2026-10-03T08:00:00Z' }], attention: null,
  }), sent('partial_refund', 'p1')), /queued/);

  // One request can close two reports (the customer's and the pro's): all must be resolved the way it was sent.
  const both = [resolved({ resolution: 'release' }), resolved({ id: 'p2', reporter_role: 'pro', kind: 'customer_no_show', resolution: 'release' })];
  assert.equal(savedText(caseRow({ problems: both, attention: null }), sent('release', 'p1', 'p2')), 'Decision saved: Payout released.');
  assert.equal(savedText(caseRow({ problems: [both[0], { ...both[1], resolution: 'withhold' }], attention: null }), sent('release', 'p1', 'p2')), null);

  // The page must not claim a success it can't see: a problem still open, one that was sent but isn't resolved,
  // a different decision than the one sent, or nothing to say which problems were sent.
  assert.equal(savedText(caseRow(), sent('release', 'p1')), null);
  assert.equal(savedText(caseRow({ problems: [wentWrong, resolved({ id: 'p9', resolution: 'release' })] }), sent('release', 'p9')), null); // p1 still open
  assert.equal(savedText(caseRow({ problems: [resolved({ resolution: 'release' })], attention: null }), sent('release', 'p1', 'p2')), null);
  assert.equal(savedText(caseRow({ problems: [resolved({ resolution: 'release' })], attention: null }), sent('partial_refund', 'p1')), null);
  assert.equal(savedText(caseRow({ problems: [resolved({ resolution: 'release' })], attention: null }), sent('release')), null);
  assert.equal(savedText(caseRow({ problems: [resolved({ resolution: 'release' })], attention: null })), null);
  assert.equal(savedText(null, sent('release', 'p1')), null);
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
  // Every refusal carries a hint (the error contract); it is read first, the message second.
  const refused = saveErrorText({ code: '22023', hint: 'invalid_input', message: 'the note must have 5 to 1000 characters' });
  assert.match(refused, /refused|already/i);
  assert.match(refused, /the note must have 5 to 1000 characters/); // the message names the field
  assert.match(saveErrorText({ hint: 'invalid_input', message: '' }), /refused/i);
  assert.match(saveErrorText({ hint: 'invalid_input' }), /refused/i);
  assert.match(saveErrorText({ hint: 'not_participant', message: 'invalid_input' }), /refused/i);
  assert.equal(saveErrorText({ hint: 'payment_unavailable', message: 'Stripe is down' }), 'Couldn’t save: Stripe is down');
  assert.match(saveErrorText({ message: 'invalid_input' }), /refused|already/i);
  assert.match(saveErrorText({ code: '42501', message: 'Admins only' }), /admin/i);
  assert.equal(saveErrorText({ message: 'connection reset' }), 'Couldn’t save: connection reset');
  assert.equal(saveErrorText({}), 'Couldn’t save: unknown error');
  assert.equal(saveErrorText(null), 'Couldn’t save: unknown error');
});

test('request_tracker_sends_once_and_ignores_stale_answers', () => {
  const requests = createRequestTracker();
  // A case with a request on its way can't be sent for again.
  const first = requests.start('b1');
  assert.notEqual(first, null);
  assert.equal(requests.isBusy('b1'), true);
  assert.equal(requests.start('b1'), null);
  assert.equal(requests.start('b1'), null);
  // Other cases are independent.
  const other = requests.start('b2');
  assert.notEqual(other, null);
  assert.equal(requests.isBusy('b3'), false);
  // The answer of the open request clears it; a second copy of the answer is stale.
  assert.equal(requests.finish('b1', first), true);
  assert.equal(requests.isBusy('b1'), false);
  assert.equal(requests.finish('b1', first), false);
  assert.equal(requests.isBusy('b2'), true);
  // After the answer the case can be sent for again, with a new token that the old one can't finish.
  const again = requests.start('b1');
  assert.notEqual(again, null);
  assert.notEqual(again, first);
  assert.equal(requests.finish('b1', first), false);
  assert.equal(requests.isBusy('b1'), true);
  assert.equal(requests.finish('b1', again), true);
  // An answer for a case that has no open request, or with another case's token, is ignored.
  assert.equal(requests.finish('nope', 1), false);
  assert.equal(requests.finish('b2', first), false);
  assert.equal(requests.finish('b2', undefined), false);
  assert.equal(requests.finish('never-started', undefined), false);
  assert.equal(requests.isBusy('b2'), true);
  // A reset (sign-out) makes every answer still on its way stale.
  requests.reset();
  assert.equal(requests.isBusy('b2'), false);
  assert.equal(requests.finish('b2', other), false);
  // Only a booking id can be sent for.
  for (const bad of [null, undefined, '', 7, {}]) assert.equal(requests.start(bad), null);
});

// ---------------------------------------------------------------------------
// Following the server's final case row (Task 10)
// ---------------------------------------------------------------------------

// A case that is only on the list because money was flagged: no open problem, and the database allows release.
const flagOnly = (over = {}, booking = {}) => caseRow({
  problems: [], attention: 'refund_failed', allowed_decisions: ['release'], ...over,
}, booking);

test('transferred_amount_for_the_reversal', () => {
  assert.equal(transferredCents(caseRow({}, { transfer_status: 'sent', transferred_cents: 1760 })), 1760);
  assert.equal(transferredCents(caseRow({}, { transferred_cents: 0 })), 0);
  for (const bad of [null, undefined, -1, 1.5, '1760', NaN]) {
    assert.equal(transferredCents(caseRow({}, { transferred_cents: bad })), null, JSON.stringify(bad));
  }
  assert.equal(transferredCents(null), null);
  assert.equal(reverseLabel(caseRow({}, { transferred_cents: 1760 })), 'Reverse transfer · €17.60');
  assert.equal(reverseLabel(caseRow({}, { transferred_cents: null })), 'Reverse transfer');
});

test('attention_only_cases_say_what_release_does', () => {
  const row = flagOnly({}, { payout_cents: 1840 });
  // No report is open, so nobody is told (the RPC notifies only when a problem was open).
  assert.equal(notifiedText(row), 'No one is notified.');
  assert.equal(notifiedText(caseRow()), 'Both are notified.');
  assert.equal(notifiedText(caseRow({ problems: [{ ...wentWrong, status: 'resolved' }] })), 'No one is notified.');
  assert.equal(notifiedText(null), 'No one is notified.');
  // A booking that was never confirmed was never the pro's: the RPC tells only the pet parent.
  assert.equal(notifiedText(caseRow({}, { confirmed_at: null })), 'Only the pet parent is notified; the pro never saw this booking.');
  assert.equal(notifiedText(caseRow({}, { confirmed_at: '2026-10-06T17:12:00Z' })), 'Both are notified.');
  assert.equal(notifiedText(flagOnly({}, { confirmed_at: null })), 'No one is notified.');
  assert.equal(decisionPreview(row, 'release', null),
    'No refund. This clears the flag on the booking’s money. A payout that is on hold goes back to pending.');
  assert.equal(confirmText(row, 'release', null),
    'Clear the flag on this booking with no refund? A payout that is on hold goes back to pending. No one is notified.');
  // A refund the database allows on such a case also says nobody is told.
  assert.match(confirmText(flagOnly({ allowed_decisions: ['full_refund', 'release'] }), 'full_refund', null), /No one is notified\. A refund can’t be taken back\.$/);
  // With a report open it is as before.
  assert.match(confirmText(caseRow(), 'release', null), /^Release the payout of €18\.40 to Happy Paws Walking, with no refund\? Both are notified\.$/);
});

test('decision_button_labels', () => {
  const row = caseRow();
  assert.equal(decisionButtonLabel(row, 'full_refund'), 'Refund in full · €23');
  assert.equal(decisionButtonLabel(caseRow({}, { refunded_cents: 500 }), 'full_refund'), 'Refund in full · €18');
  assert.equal(decisionButtonLabel(row, 'partial_refund'), 'Refund part');
  assert.equal(decisionButtonLabel(row, 'release'), 'Release payout · €18.40');
  assert.equal(decisionButtonLabel(row, 'withhold'), 'Withhold payout · €18.40');
  assert.equal(decisionButtonLabel(caseRow({}, { payout_cents: 0, transfer_status: 'none' }), 'release'), 'Release payout');
  // A payout that was sent can't be released any more: the decision only closes the case.
  assert.equal(decisionButtonLabel(caseRow({}, { transfer_status: 'sent' }), 'release'), 'Release (keep the payout)');
  // With no report open, release is the way to take the flag off the list.
  assert.equal(decisionButtonLabel(flagOnly(), 'release'), 'Clear flag (no refund)');
  assert.equal(decisionButtonLabel(row, 'burn'), '');
});

test('record_an_outside_refund', () => {
  // money_flags as the case row has them: the unanswered rows, each with recordable and record_refusal.
  const flag = (over) => ({ log_id: 7, event: 'refund_external', stripe_refund_id: 're_ext1', amount_cents: 500, reported_status: 'succeeded', recordable: true, record_refusal: null, ...over });
  const flags = [
    flag({}),
    flag({ log_id: 8, event: 'refund_status_conflict', stripe_refund_id: ' re_conf2 ', amount_cents: null, reported_status: 'failed' }),
    flag({ log_id: 9, stripe_refund_id: 're_pend3', reported_status: 'pending', recordable: false, record_refusal: ' Stripe has not finished refund re_pend3 (pending): wait for its result ' }),
    flag({ log_id: 10, event: 'refund_failed', stripe_refund_id: 're_failed', amount_cents: 100 }), // flagged, but not a refund to record
    flag({ stripe_refund_id: '', amount_cents: 100 }),
    flag({ stripe_refund_id: undefined }),
    flag({ log_id: 11 }), // the same Stripe refund twice
    flag({ log_id: 12, stripe_refund_id: 're_norec', recordable: 'true', record_refusal: null }), // only the boolean true is a yes
    flag({ log_id: 13, stripe_refund_id: 're_both', recordable: true, record_refusal: 'A transfer is being sent: try again shortly' }), // a refusal is a no
    null, 'x',
  ];
  const row = flagOnly({ money_flags: flags });
  // The Stripe id comes from the case, trimmed; it is never typed.
  assert.deepEqual(moneyFlags(row), [
    { stripeId: 're_ext1', logId: 7, event: 'refund_external', cents: 500, label: 'Refund made outside Zoovo', status: 'made', recordable: true, refusal: null },
    { stripeId: 're_conf2', logId: 8, event: 'refund_status_conflict', cents: null, label: 'Refund Stripe reports differently', status: 'failed', recordable: true, refusal: null },
    { stripeId: 're_pend3', logId: 9, event: 'refund_external', cents: 500, label: 'Refund made outside Zoovo', status: 'pending', recordable: false,
      refusal: 'Stripe has not finished refund re_pend3 (pending): wait for its result' },
    { stripeId: 're_norec', logId: 12, event: 'refund_external', cents: 500, label: 'Refund made outside Zoovo', status: 'made', recordable: false,
      refusal: 'The database did not say why this refund can’t be recorded yet.' },
    { stripeId: 're_both', logId: 13, event: 'refund_external', cents: 500, label: 'Refund made outside Zoovo', status: 'made', recordable: false,
      refusal: 'A transfer is being sent: try again shortly' },
  ]);
  // Stripe's amount is a whole number of cents above zero, or it isn't named.
  const amounts = moneyFlags(flagOnly({ money_flags: [0, -5, 1.5, '500', undefined].map((a, i) => flag({ stripe_refund_id: `re_${i}`, amount_cents: a })) }));
  assert.deepEqual(amounts.map((r) => r.cents), [null, null, null, null, null]);
  for (const none of [flagOnly(), flagOnly({ money_flags: [] }), flagOnly({ money_flags: 'x' }), null]) {
    assert.deepEqual(moneyFlags(none), []);
  }
  assert.equal(stripeRefundStatusLabel('succeeded'), 'made');
  assert.equal(stripeRefundStatusLabel('pending'), 'pending');
  assert.equal(stripeRefundStatusLabel('requires_action'), 'needs action');
  assert.equal(stripeRefundStatusLabel('failed'), 'failed');
  assert.equal(stripeRefundStatusLabel('canceled'), 'canceled');
  assert.equal(stripeRefundStatusLabel('constructor'), 'constructor');
  assert.equal(stripeRefundStatusLabel(null), null);

  const [outside, conflict] = moneyFlags(row);
  assert.equal(recordRefundConfirmText(row, outside),
    'Record Stripe refund re_ext1 (€5) as a refund made outside Zoovo? It is counted in the refunded amount and the payout split. Nothing is sent to Stripe and no one is notified.');
  assert.equal(recordRefundConfirmText(row, conflict),
    'Record what Stripe reports for refund re_conf2? Zoovo’s books are brought in line with Stripe, so the refunded amount and the payout can change. Nothing is sent to Stripe and no one is notified.');
  assert.match(recordRefundConfirmText(row, { ...conflict, cents: 3500 }), /^Record what Stripe reports for refund re_conf2 \(€35\)\?/);

  // After the call: the banner is true only if the returned row no longer lists that refund.
  const after = flagOnly({ money_flags: [flag({ stripe_refund_id: 're_other', amount_cents: 100 })] }, { refunded_cents: 500 });
  assert.equal(recordedText(after, { stripeId: 're_ext1' }), 'Refund re_ext1 recorded. Refunded so far: €5.');
  assert.equal(recordedText(flagOnly({ money_flags: [] }, { refunded_cents: 0 }), { stripeId: 're_ext1' }), 'Refund re_ext1 recorded. Refunded so far: €0.');
  assert.equal(recordedText(row, { stripeId: 're_ext1' }), null); // still listed
  assert.equal(recordedText(flagOnly(), { stripeId: 're_ext1' }), null); // no list to check
  assert.equal(recordedText(after, {}), null);
  assert.equal(recordedText(after, null), null);
  assert.equal(recordedText(null, { stripeId: 'x' }), null);
});

test('requeue_a_refund_that_failed_for_good', () => {
  const refund = (over) => ({ amount_cents: 3500, reason: 'team', status: 'failed', created_at: '2026-10-09T09:00:00Z', note: null, ...over });
  const withRefunds = (refunds, over = {}) => caseRow({ problems: [], attention: 'refund_failed', refunds, ...over });

  assert.deepEqual(requeueableRefunds(withRefunds([refund()])), [{ amount: 3500, reason: 'team' }]);
  assert.deepEqual(requeueableRefunds(withRefunds([refund({ status: 'canceled' })])), [{ amount: 3500, reason: 'team' }]);
  // Nothing to send again: refunds that are fine, or still on their way.
  for (const status of ['succeeded', 'pending', 'requested']) assert.deepEqual(requeueableRefunds(withRefunds([refund({ status })])), [], status);
  // A later refund of the same amount and reason is the requeue of it, whatever became of that one.
  assert.deepEqual(requeueableRefunds(withRefunds([refund(), refund({ status: 'requested', created_at: '2026-10-10T09:00:00Z' })])), []);
  // ...and when the requeue failed too, only that one can be sent again.
  const again = withRefunds([refund(), refund({ created_at: '2026-10-10T09:00:00Z' })]);
  assert.deepEqual(requeueableRefunds(again), [{ amount: 3500, reason: 'team' }]);
  // A different amount or reason is somebody else's refund.
  assert.equal(requeueableRefunds(withRefunds([refund(), refund({ amount_cents: 500, status: 'succeeded' })])).length, 1);
  assert.equal(requeueableRefunds(withRefunds([refund(), refund({ reason: 'policy', status: 'succeeded' })])).length, 1);
  // A chain of requeues that each failed again: only the last one can be sent again, and nothing while it is on its way.
  assert.equal(requeueableRefunds(withRefunds([refund(), refund({ created_at: '2026-10-10T09:00:00Z' }), refund({ created_at: '2026-10-11T09:00:00Z' })])).length, 1);
  assert.equal(requeueableRefunds(withRefunds([refund(), refund({ created_at: '2026-10-10T09:00:00Z' }), refund({ status: 'requested', created_at: '2026-10-11T09:00:00Z' })])).length, 0);
  for (const none of [null, caseRow({ refunds: 'x' }), caseRow()]) assert.deepEqual(requeueableRefunds(none), []);

  // Without the server's key, offered only when nothing must be recorded first (the database refuses it then).
  const flagged = withRefunds([refund()], { money_flags: [{ event: 'refund_external', stripe_refund_id: 're_1', amount_cents: 100, recordable: true }] });
  assert.equal(canRequeue(withRefunds([refund()])), true);
  assert.equal(canRequeue(flagged), false);
  assert.equal(canRequeue(withRefunds([refund({ status: 'succeeded' })])), false);

  // The case row says itself which refunds the requeue would send (refunds[].requeueable): exactly those.
  const served = withRefunds([
    refund({ requeueable: true }),
    refund({ amount_cents: 500, requeueable: false }), // failed, but the database won't send it (a sent payout, a running transfer...)
    refund({ amount_cents: 700, status: 'succeeded', requeueable: false }),
  ]);
  assert.deepEqual(requeueableRefunds(served), [{ amount: 3500, reason: 'team' }]);
  assert.equal(canRequeue(served), true);
  assert.equal(canRequeue(withRefunds([refund({ requeueable: false })])), false);
  // The database's answer already allows for a flag waiting to be recorded: when it says yes, it is yes.
  assert.equal(canRequeue(withRefunds([refund({ requeueable: true })], { money_flags: [{ event: 'refund_external', stripe_refund_id: 're_1', amount_cents: 100, recordable: false, record_refusal: 'x' }] })), true);
  // ...even where the old guess would say yes, or no.
  assert.equal(canRequeue(withRefunds([refund({ requeueable: false }), refund({ status: 'requested', created_at: '2026-10-10T09:00:00Z' })])), false);
  assert.equal(canRequeue(withRefunds([refund({ requeueable: true }), refund({ status: 'requested', requeueable: false, created_at: '2026-10-10T09:00:00Z' })])), true);
  // A requeueable that isn't the boolean true is a no.
  assert.deepEqual(requeueableRefunds(withRefunds([refund({ requeueable: 'true' }), refund({ requeueable: false })])), []);
  assert.equal(requeueConfirmText(served), 'Send the failed refund of €35 again to Daan Visser? It goes to Stripe as a new refund request. A refund can’t be taken back.');

  assert.equal(requeueConfirmText(withRefunds([refund()])),
    'Send the failed refund of €35 again to Daan Visser? It goes to Stripe as a new refund request. A refund can’t be taken back.');
  assert.equal(requeueConfirmText(withRefunds([refund(), refund({ id: 2, amount_cents: 500, created_at: '2026-10-09T10:00:00Z' })])),
    'Send 2 failed refunds again (€40 in all) to Daan Visser? Each goes to Stripe as a new refund request. A refund can’t be taken back.');
  assert.equal(requeueConfirmText(caseRow()), '');

  // After the call: the banner is true only if nothing is left to send again.
  const sent = { cents: 3500 };
  assert.equal(requeuedText(withRefunds([refund(), refund({ status: 'requested', created_at: '2026-10-10T09:00:00Z' })]), sent),
    'Refund sent again: €35 is queued; its status is below.');
  assert.equal(requeuedText(withRefunds([refund()]), sent), null);
  assert.equal(requeuedText(again, sent), null); // the requeue failed straight away
  assert.equal(requeuedText(withRefunds([refund(), refund({ status: 'requested', created_at: '2026-10-10T09:00:00Z' })]), {}), null);
});

test('saved_text_for_a_case_with_no_report', () => {
  const team = (amount, status) => ({ amount_cents: amount, reason: 'team', status, created_at: '2026-10-10T08:00:00Z', note: NOTE });
  const answer = (over, booking) => flagOnly({ attention: null, allowed_decisions: [], ...over }, booking);
  const sent = (decision, extra = {}) => ({ decision, ids: [], ...extra });

  // Nothing was open to resolve, so the proof is in the returned row: the database allows no decision any more.
  assert.equal(savedText(answer({}), sent('release')), 'Decision saved: the flag is cleared, no refund.');
  assert.equal(savedText(answer({ allowed_decisions: ['release'] }), sent('release')), null); // still decidable
  assert.equal(savedText(flagOnly({ attention: null, allowed_decisions: undefined }), sent('release')), null); // no list to check
  assert.equal(savedText(answer({}), sent('withhold')), null); // withholding needs a dispute, so never here
  assert.equal(savedText(answer({}), sent('burn')), null);
  assert.equal(savedText(answer({ refunds: [team(500, 'requested')] }, { refunded_cents: 500 }), sent('withhold', { cents: 500, refundedBefore: 0 })), null);

  // A refund the database allowed: its effect is checked in the returned booking.
  const refunded = answer({ refunds: [team(500, 'requested')] }, { refunded_cents: 500 });
  assert.equal(savedText(refunded, sent('partial_refund', { cents: 500, refundedBefore: 0 })),
    'Decision saved: Refunded €5. The refund is queued; its status is below.');
  assert.equal(savedText(refunded, sent('partial_refund', { cents: 600, refundedBefore: 0 })), null); // another amount
  // Only the refund of that amount is the one queued: a pending refund of another amount isn't mentioned.
  assert.doesNotMatch(savedText(answer({ refunds: [team(700, 'pending')] }, { refunded_cents: 500 }), sent('partial_refund', { cents: 500, refundedBefore: 0 })), /queued/);
  assert.equal(savedText(refunded, sent('partial_refund', { cents: 500 })), null); // nothing to compare with
  assert.equal(savedText(answer({ refunds: [team(2300, 'succeeded')] }, { refunded_cents: 2300 }),
    sent('full_refund', { cents: 2300, refundedBefore: 0 })), 'Decision saved: Refunded in full.');
  assert.equal(savedText(answer({ refunds: [team(500, 'succeeded')] }, { refunded_cents: 0 }),
    sent('partial_refund', { cents: 500, refundedBefore: 0 })), null);

  // With a report that was open the problems are the proof, as before.
  assert.equal(savedText(caseRow({ problems: [{ ...wentWrong, status: 'resolved', resolution: 'release' }], attention: null, allowed_decisions: [] }),
    { decision: 'release', ids: ['p1'] }), 'Decision saved: Payout released.');
});

// ---------------------------------------------------------------------------
// Seen events, acknowledge and checking a transfer (Task 10, rounds 2 to 4)
// ---------------------------------------------------------------------------

test('seen_log_id_is_sent_with_every_decision', () => {
  // The case row's seen_log_id goes back as p_seen_log_id: the money log the reviewer's row reflected.
  assert.equal(seenLogId(caseRow({ seen_log_id: 41 })), 41);
  assert.equal(seenLogId(caseRow({ seen_log_id: 0 })), 0);
  // A booking with nothing in its money log has none: 0, "I have seen nothing", which the RPC accepts.
  assert.equal(seenLogId(caseRow({ seen_log_id: null })), 0);
  // A row without the key: nothing to send.
  assert.equal(seenLogId(withoutSeen(caseRow())), null);
  assert.equal(seenLogId(null), null);
  // A value that is not a whole number of at least 0 is not sent.
  for (const bad of ['41', -1, 1.5, NaN, Infinity, {}, [], 2 ** 60]) assert.equal(seenLogId(caseRow({ seen_log_id: bad })), null, String(bad));

  // validateDecision refuses to send a decision on a row that can't say what was seen: missing or unusable.
  const check = (over, decision = 'release') => validateDecision(caseRow(over), decision, null, NOTE);
  assert.equal(check({ seen_log_id: 41 }), null);
  assert.equal(check({ seen_log_id: null }), null);
  assert.equal(validateDecision(withoutSeen(caseRow()), 'release', null, NOTE), CASE_CHANGED);
  assert.equal(check({ seen_log_id: 'x' }), CASE_CHANGED);
  assert.equal(check({ seen_log_id: -3 }), CASE_CHANGED);
});

test('acknowledge_a_mismatch', () => {
  const mismatch = caseRow({
    problems: [], attention: 'payout_mismatch', allowed_decisions: ['acknowledge'], seen_log_id: 12,
  }, { transfer_status: 'sent', transferred_cents: 1700, payout_cents: 1760 });
  // Allowed only as the case row says; it needs the note like every decision.
  assert.equal(validateDecision(mismatch, 'acknowledge', null, NOTE), null);
  assert.match(validateDecision(mismatch, 'acknowledge', null, ''), /note/i);
  assert.match(validateDecision(mismatch, 'release', null, NOTE), /not available/);
  assert.match(validateDecision(caseRow(), 'acknowledge', null, NOTE), /not available/); // the fallback rule never offers it
  assert.equal(decisionButtonLabel(mismatch, 'acknowledge'), 'Acknowledge');
  assert.equal(decisionPreview(mismatch, 'acknowledge', null),
    'Records that the team has seen the payout mismatch (€17 was sent, €17.60 is owed) and handled it outside the app. No money moves, no report is resolved and no one is notified.');
  assert.equal(confirmText(mismatch, 'acknowledge', null),
    'Acknowledge the payout mismatch (€17 was sent, €17.60 is owed)? You have handled it outside the app. It is recorded with your note; no money moves, no report is resolved and no one is notified.');
  // Without a transferred amount none is named.
  const noAmount = caseRow({ problems: [], attention: 'payout_mismatch', allowed_decisions: ['acknowledge'] });
  assert.equal(confirmText(noAmount, 'acknowledge', null),
    'Acknowledge the payout mismatch? You have handled it outside the app. It is recorded with your note; no money moves, no report is resolved and no one is notified.');
  // Money flagged with no report open: the same decision, said for what it is.
  const flagged = flagOnly({ allowed_decisions: ['release', 'acknowledge'] });
  assert.equal(confirmText(flagged, 'acknowledge', null),
    'Acknowledge the flagged money on this booking? You have handled it outside the app. It is recorded with your note; no money moves, no report is resolved and no one is notified.');
  assert.match(decisionPreview(flagged, 'acknowledge', null), /^Records that the team has seen the flagged money/);

  // After the call the returned row must show it: the database no longer offers acknowledge.
  const done = { ...mismatch, attention: null, allowed_decisions: [] };
  assert.equal(savedText(done, { decision: 'acknowledge', ids: [] }), 'Acknowledged: the team has seen it and handled it outside the app. No money moved.');
  assert.equal(savedText({ ...done, allowed_decisions: ['release'] }, { decision: 'acknowledge', ids: [] }), 'Acknowledged: the team has seen it and handled it outside the app. No money moved.');
  assert.equal(savedText({ ...done, allowed_decisions: ['acknowledge'] }, { decision: 'acknowledge', ids: [] }), null); // still on offer: not answered
  assert.equal(savedText({ ...done, allowed_decisions: undefined }, { decision: 'acknowledge', ids: [] }), null); // nothing to check
  // A report that was open stays open: acknowledging resolves none, and the banner doesn't wait for that.
  const withReport = { ...mismatch, problems: [wentWrong], allowed_decisions: [] };
  assert.equal(savedText(withReport, { decision: 'acknowledge', ids: ['p1'] }), 'Acknowledged: the team has seen it and handled it outside the app. No money moved.');
  assert.equal(savedText(done, { decision: 'release', ids: [] }), 'Decision saved: the flag is cleared, no refund.'); // the others are as before

  // The line above the note.
  assert.equal(decisionNoticeText(mismatch), 'No one is notified when you acknowledge.');
  assert.equal(decisionNoticeText(caseRow({ allowed_decisions: ['release', 'acknowledge'] })), 'Both the pet parent and the pro are notified when you decide.');
  assert.equal(decisionNoticeText(caseRow({ allowed_decisions: ['release', 'acknowledge'] }, { confirmed_at: null })),
    'Only the pet parent is notified when you decide; the pro never saw this booking.');
  assert.equal(decisionNoticeText(flagged), 'No one is notified when you decide: no report is open on this booking.');
  assert.equal(decisionNoticeText(caseRow({ allowed_decisions: [] })), '');
  assert.equal(decisionNoticeText(null), '');
});

test('check_a_transfer_at_stripe', () => {
  // Offered where the case shows a transfer that failed, a payout that differs (a lookup conflict is one), or a failed transfer job.
  const withAttention = (attention, over = {}, booking = {}) => caseRow({ problems: [], attention, allowed_decisions: [], ...over }, booking);
  assert.equal(canCheckTransfer(withAttention('transfer_failed')), true);
  assert.equal(canCheckTransfer(withAttention('payout_mismatch')), true);
  assert.equal(canCheckTransfer(withAttention('refund_failed')), false);
  assert.equal(canCheckTransfer(withAttention(null)), false);
  assert.equal(canCheckTransfer(caseRow()), false); // a report is open and nothing is wrong with the money
  assert.equal(canCheckTransfer(withAttention('refund_failed', { failed_jobs: [{ id: 'j1', kind: 'transfer', last_error: 'x', retryable: false, retry_refusal: 'x' }] })), true);
  assert.equal(canCheckTransfer(withAttention('refund_failed', { failed_jobs: [{ id: 'j2', kind: 'transfer_lookup' }] })), true);
  assert.equal(canCheckTransfer(withAttention('refund_failed', { failed_jobs: [{ id: 'j3', kind: 'refund' }] })), false);
  assert.equal(canCheckTransfer(caseRow({ failed_jobs: [{ id: 'j4', kind: 'transfer' }] })), true);
  assert.equal(canCheckTransfer(null), false);
  assert.equal(checkTransferConfirmText(caseRow()),
    'Ask Stripe whether the transfer to Happy Paws Walking exists? The worker only looks it up and reports what it finds. Nothing is sent to the pro and no money moves.');
  assert.match(checkTransferConfirmText(caseRow({ pro: null })), /^Ask Stripe whether the transfer to the pro exists\?/);
});

test('reload_errors_say_so', () => {
  // The two refusals of a decision made on a case that has moved on (22023 invalid_input, M4-R17).
  const events = saveErrorText({ code: '22023', hint: 'invalid_input', message: 'new payment events arrived, reload' });
  assert.equal(events, CASE_CHANGED);
  const stale = saveErrorText({ code: '22023', hint: 'invalid_input', message: 'stale or foreign case row: reload it' });
  assert.equal(stale, CASE_CHANGED);
  assert.equal(saveErrorText({ message: 'New payment events arrived, reload' }), CASE_CHANGED); // by message alone, any case
  assert.match(saveErrorText({ hint: 'invalid_input', message: 'p_seen_log_id is required: send the case row’s seen_log_id' }), /refused.*p_seen_log_id is required/);
});

// ---------------------------------------------------------------------------
// Final review: the decision's arguments, the stale view, retries, payment
// health and a payment on another PaymentIntent
// ---------------------------------------------------------------------------

test('decision_args', () => {
  // Exactly what admin_resolve_booking_problems takes: the booking, the decision, the cents, the trimmed note, the seen money log.
  assert.deepEqual(decisionArgs(caseRow({ seen_log_id: 41 }), 'partial_refund', 1150, `  ${NOTE}\n`), {
    p_booking_id: 'b1', p_decision: 'partial_refund', p_refund_cents: 1150, p_note: NOTE, p_seen_log_id: 41,
  });
  // The cents go only with a partial refund; a full refund's amount is the server's to work out.
  for (const decision of ['full_refund', 'release', 'withhold', 'acknowledge']) {
    assert.deepEqual(decisionArgs(caseRow(), decision, 1150, NOTE), {
      p_booking_id: 'b1', p_decision: decision, p_refund_cents: null, p_note: NOTE, p_seen_log_id: 7,
    });
  }
  assert.equal(decisionArgs(caseRow(), 'partial_refund', 1.5, NOTE).p_refund_cents, null);
  // A booking with nothing in its money log (seen_log_id null) sends 0, which the RPC accepts.
  assert.equal(decisionArgs(caseRow({ seen_log_id: null }), 'release', null, NOTE).p_seen_log_id, 0);
  // Nothing is built for a row that can't say what was seen, or that names no booking: the call is never sent.
  assert.equal(decisionArgs(withoutSeen(caseRow()), 'release', null, NOTE), null);
  for (const bad of ['41', -1, 1.5, {}]) assert.equal(decisionArgs(caseRow({ seen_log_id: bad }), 'release', null, NOTE), null, String(bad));
  assert.equal(decisionArgs(caseRow({}, { id: null }), 'release', null, NOTE), null);
  assert.equal(decisionArgs(caseRow({}, { id: '' }), 'release', null, NOTE), null);
  assert.equal(decisionArgs(null, 'release', null, NOTE), null);
});

test('stale_view_says_the_case_changed', () => {
  // One message for the server's two stale-view refusals and for a row the page can't send at all.
  assert.match(CASE_CHANGED, /^This case changed/);
  assert.match(CASE_CHANGED, /nothing was saved/);
  // The row is checked first: with no usable seen_log_id nothing about the form matters, since nothing can be sent.
  assert.equal(validateDecision(withoutSeen(caseRow()), 'release', null, ''), CASE_CHANGED);
  assert.equal(validateDecision(withoutSeen(caseRow()), 'partial_refund', 0, NOTE), CASE_CHANGED);
  assert.equal(validateDecision(withoutSeen(caseRow({ allowed_decisions: [] })), 'release', null, NOTE), CASE_CHANGED);
  // Other refusals keep their own words.
  assert.match(saveErrorText({ hint: 'invalid_input', message: 'The note is 5 to 1000 characters' }), /refused.*note is 5 to 1000/);
});

test('retry_confirm_names_the_amount', () => {
  const jobs = failedJobs(caseRow({
    problems: [], attention: 'refund_failed',
    failed_jobs: [
      { id: 'r', kind: 'refund', amount_cents: 700, retryable: true, retry_refusal: null },
      { id: 'v', kind: 'transfer_reversal', amount_cents: 1760, retryable: true, retry_refusal: null },
      { id: 't', kind: 'transfer', amount_cents: 1200, retryable: true, retry_refusal: null },
      { id: 'l', kind: 'transfer_lookup', amount_cents: null, retryable: true, retry_refusal: null },
      { id: 'c', kind: 'cancel_intent', amount_cents: null, retryable: true, retry_refusal: null },
      { id: 'n', kind: 'refund', retryable: true, retry_refusal: null },
    ],
  }));
  const row = caseRow();
  const text = (id) => retryConfirmText(jobs.find((j) => j.id === id), row);
  // A refund and a reversal run again under their own key: Stripe can't make them twice.
  assert.equal(text('r'), 'Retry the failed refund of €7 to Daan Visser? Stripe receives it again with the same key, so it can’t happen twice.');
  assert.equal(text('v'), 'Retry the failed transfer reversal of €17.60 from Happy Paws Walking? Stripe receives it again with the same key, so it can’t happen twice.');
  // A transfer goes out at the payout as it is now (under a new key when that changed): no such promise.
  assert.equal(text('t'), 'Retry the failed transfer to Happy Paws Walking? It is sent again at the current payout amount, €12.');
  assert.doesNotMatch(text('t'), /same key|twice/);
  // A lookup and a cancellation move no money and name none.
  assert.equal(text('l'), 'Retry the failed transfer lookup? It only asks Stripe whether the transfer exists; no money moves.');
  assert.equal(text('c'), 'Retry the failed payment cancellation? Stripe is asked again to cancel the payment that was never taken; no money moves.');
  for (const id of ['l', 'c']) assert.doesNotMatch(text(id), /same key|€/);
  // Without an amount in the row none is named, but the promise still holds for a refund.
  assert.equal(text('n'), 'Retry the failed refund to Daan Visser? Stripe receives it again with the same key, so it can’t happen twice.');
  assert.equal(retryConfirmText({ id: 'x', kind: 'transfer', label: 'transfer', cents: null }, row),
    'Retry the failed transfer to Happy Paws Walking? It is sent again at the current payout amount.');
  // Deleted accounts and unknown kinds still read well.
  assert.match(retryConfirmText(jobs[0], caseRow({ customer: null })), /^Retry the failed refund of €7 to the pet parent\?/);
  assert.equal(retryConfirmText({ id: 'z', kind: 'mystery', label: 'payment job', cents: 500 }, row), 'Retry the failed payment job?');
  assert.equal(retryConfirmText(null, null), 'Retry the failed payment job?');
  // The button names the amount where money moves.
  assert.deepEqual(jobs.map(retryLabel), [
    'Retry the refund · €7', 'Retry the transfer reversal · €17.60', 'Retry the transfer · €12',
    'Retry the transfer lookup', 'Retry the payment cancellation', 'Retry the refund',
  ]);
});

test('payment_health', () => {
  // admin_payment_health, newest first, as the section shows it.
  const health = paymentHealth({
    unplaced_payments: [
      { event_id: 'evt_2', payment_intent_id: 'pi_stray', received_at: '2026-10-21T08:00:00Z' },
      { event_id: 'evt_1', payment_intent_id: null, received_at: null },
      null, 'x', { event_id: 'evt_0' },
    ],
    job_errors: [
      { log_id: 90, booking_id: 'b9', job: 'schedule_due_payouts', sqlstate: '23514', error: 'new row violates check', created_at: '2026-10-22T10:00:00Z' },
      { log_id: 80, booking_id: 'b8', job: 'retry_payment_jobs', sqlstate: null, error: null, created_at: '2026-10-22T09:00:00Z' },
      { log_id: 70, booking_id: 'b7', job: 'brand_new_job', sqlstate: 'P0001', error: '  boom  ', created_at: 'nope' },
      { booking_id: 'b6' }, null,
    ],
  });
  assert.deepEqual(health.payments, [
    { eventId: 'evt_2', paymentIntentId: 'pi_stray', when: 'Wed 21 Oct, 10:00' },
    { eventId: 'evt_1', paymentIntentId: null, when: '—' },
    { eventId: 'evt_0', paymentIntentId: null, when: '—' },
  ]);
  assert.deepEqual(health.errors, [
    { logId: 90, bookingId: 'b9', job: 'Scheduling payouts', error: 'new row violates check', sqlstate: '23514', when: 'Thu 22 Oct, 12:00' },
    { logId: 80, bookingId: 'b8', job: 'Retrying payment jobs', error: null, sqlstate: null, when: 'Thu 22 Oct, 11:00' },
    { logId: 70, bookingId: 'b7', job: 'brand_new_job', error: 'boom', sqlstate: 'P0001', when: '—' },
  ]);
  assert.equal(paymentHealth({ job_errors: [{ log_id: 1, booking_id: 'b', job: 'expire_booking_holds' }] }).errors[0].job, 'Expiring payment holds');
  assert.equal(paymentHealth({ job_errors: [{ log_id: 1, booking_id: 'b', job: 'complete_ended_bookings' }] }).errors[0].job, 'Completing ended bookings');
  assert.equal(paymentHealth({ job_errors: [{ log_id: 1, booking_id: 'b', job: null }] }).errors[0].job, 'A scheduled job');
  // Nothing to report is an empty answer, not a missing one.
  assert.deepEqual(paymentHealth({ unplaced_payments: [], job_errors: [] }), { payments: [], errors: [] });
  assert.deepEqual(paymentHealth({}), { payments: [], errors: [] });
  for (const bad of [null, undefined, [], 'x', 7]) assert.equal(paymentHealth(bad), null, String(bad));
});


// ---------------------------------------------------------------------------
// Follow-up: stray payments from the case row, the server's waiting time, marking
// a payment handled, and a pending payout's retry
// ---------------------------------------------------------------------------

// stray_payments[] as booking_case_json lists it.
const strayEntry = (over = {}) => ({
  log_id: 31, payment_intent_id: 'pi_fr_stray_1', amount_cents: 2500, created_at: '2026-10-21T08:15:00Z', ...over,
});
// A case whose only issue is a payment on another PaymentIntent: the server offers acknowledge and nothing else.
const strayOnly = (over = {}) => caseRow({
  problems: [], attention: 'refund_failed', money_flags: [], allowed_decisions: ['acknowledge'],
  stray_payments: [strayEntry()], ...over,
});
const FIRST_NOTE = 'Refund it in the Stripe dashboard. A refund here would hit the booking’s own payment.';
const DECIDING_NOTE = 'Deciding this case also clears the stray payment; refund it at Stripe first.';

test('stray_payments_come_from_the_case_row', () => {
  const row = strayOnly({
    stray_payments: [strayEntry(), strayEntry({ log_id: 35, payment_intent_id: ' pi_fr_stray_2 ', amount_cents: 1250, created_at: '2026-10-22T22:30:00Z' })],
  });
  // One line each, oldest first as the server lists them: amount, PaymentIntent, when (Amsterdam).
  assert.deepEqual(strayPayments(row).map((p) => p.text), [
    'Payment on another PaymentIntent: €25, pi_fr_stray_1, Wed 21 Oct, 10:15',
    'Payment on another PaymentIntent: €12.50, pi_fr_stray_2, Fri 23 Oct, 00:30',
  ]);
  assert.deepEqual(strayPayments(strayOnly())[0], {
    logId: 31, paymentIntentId: 'pi_fr_stray_1', cents: 2500, when: 'Wed 21 Oct, 10:15',
    text: 'Payment on another PaymentIntent: €25, pi_fr_stray_1, Wed 21 Oct, 10:15',
  });
  // A part the row lacks or gets wrong reads "—"; the payment is still listed, because it is still there.
  assert.equal(strayPayments(strayOnly({ stray_payments: [{}] }))[0].text, 'Payment on another PaymentIntent: —, —, —');
  assert.equal(strayPayments(strayOnly({ stray_payments: [strayEntry({ amount_cents: '2500', created_at: 'nope', payment_intent_id: 7 })] }))[0].text,
    'Payment on another PaymentIntent: —, —, —');
  // Entries that aren't objects are skipped. [] (none), a missing key, or something else is no stray payment.
  assert.equal(strayPayments(strayOnly({ stray_payments: [null, 'x', 4, [], strayEntry()] })).length, 1);
  for (const none of [[], undefined, null, 'pi_x', {}, 3]) assert.deepEqual(strayPayments(strayOnly({ stray_payments: none })), [], String(none));
  assert.deepEqual(strayPayments(null), []);
  // Ids and times come from the database: they stay text. Nothing here turns them into markup or cuts them.
  const hostile = '<img src=x onerror=alert(1)>&amp;"\'';
  assert.equal(strayPayments(strayOnly({ stray_payments: [strayEntry({ payment_intent_id: hostile })] }))[0].text,
    `Payment on another PaymentIntent: €25, ${hostile}, Wed 21 Oct, 10:15`);
});

test('stray_payment_notes', () => {
  // The case's only issue: where to refund it, and why not here.
  assert.deepEqual(strayPaymentNotes(strayOnly()), [FIRST_NOTE]);
  // Next to an open problem, the problem's decision answers the stray payment too.
  const withProblem = caseRow({ stray_payments: [strayEntry()], allowed_decisions: ['full_refund', 'partial_refund', 'release'] });
  assert.deepEqual(strayPaymentNotes(withProblem), [FIRST_NOTE, DECIDING_NOTE]);
  // So does any decision of a case with no problem open but other money flagged: every decision answers the money log up to what was seen.
  const flagged = strayOnly({
    money_flags: [{ log_id: 3, event: 'refund_external', stripe_refund_id: 're_1', recordable: true }],
    allowed_decisions: ['full_refund', 'partial_refund', 'release', 'acknowledge'],
  });
  assert.deepEqual(strayPaymentNotes(flagged), [FIRST_NOTE, DECIDING_NOTE]);
  // A row from a database that doesn't send allowed_decisions still has its open problem.
  const { allowed_decisions: _gone, ...older } = withProblem;
  assert.deepEqual(strayPaymentNotes(older), [FIRST_NOTE, DECIDING_NOTE]);
  // No stray payment, no note.
  assert.deepEqual(strayPaymentNotes(caseRow()), []);
  assert.deepEqual(strayPaymentNotes(strayOnly({ stray_payments: [] })), []);
  assert.deepEqual(strayPaymentNotes(null), []);
});

test('stray_payment_cases_are_named_from_the_case_row', () => {
  // Only stray payments, nothing to decide: the list's reason says so (not "Refund failed", which stays the Attention).
  assert.equal(onlyStrayPayments(strayOnly()), true);
  assert.deepEqual(caseItems(strayOnly()), [{ who: 'Zoovo', role: 'automatic check', reason: 'Payment on another PaymentIntent' }]);
  assert.equal(attentionLabel(strayOnly()), 'Refund failed');
  assert.equal(isOpenCase(strayOnly()), true);
  // Anything else on the case is named as before.
  const refundFailed = { ...wentWrong, kind: 'refund_failed', reporter_role: null };
  const withProblem = caseRow({ stray_payments: [strayEntry()], allowed_decisions: NORMAL });
  assert.equal(onlyStrayPayments(withProblem), false);
  assert.deepEqual(caseItems(withProblem), [{ who: 'Daan Visser', role: 'pet parent', reason: 'Something went wrong' }]);
  assert.equal(caseItems(strayOnly({ problems: [refundFailed], allowed_decisions: NORMAL }))[0].reason, 'Refund failed');
  const flagged = strayOnly({ allowed_decisions: ['release', 'acknowledge'], money_flags: [{ log_id: 3, event: 'refund_external', stripe_refund_id: 're_1' }] });
  assert.equal(onlyStrayPayments(flagged), false);
  assert.equal(caseItems(flagged)[0].reason, 'Refund failed');
  // A resolved problem from before doesn't hide it.
  assert.equal(onlyStrayPayments(strayOnly({ problems: [{ ...wentWrong, status: 'resolved', resolution: 'release' }] })), true);
  // Nothing is guessed from the other keys any more: without stray_payments a refund_failed case is just that.
  const guess = caseRow({ problems: [], attention: 'refund_failed', money_flags: [], allowed_decisions: ['acknowledge'] });
  assert.equal(onlyStrayPayments(guess), false);
  assert.equal(caseItems(guess)[0].reason, 'Refund failed');
  // acknowledge-only for another reason (a payout mismatch) is not a stray payment.
  assert.equal(onlyStrayPayments(caseRow({ problems: [], attention: 'payout_mismatch', allowed_decisions: ['acknowledge'] })), false);
  assert.equal(onlyStrayPayments(strayOnly({ allowed_decisions: [] })), false); // nothing can be done: the answer after acknowledging
  assert.equal(onlyStrayPayments(null), false);
});

test('mark_payment_handled', () => {
  const health = paymentHealth({
    unplaced_payments: [
      { event_id: 'evt_2', payment_intent_id: 'pi_stray', received_at: '2026-10-21T08:00:00Z' },
      { event_id: 'evt_1', payment_intent_id: null, received_at: null },
    ],
  });
  const [payment, noIntent] = health.payments;
  // Exactly the RPC's two parameters: the event, and the trimmed note.
  assert.deepEqual(markHandledArgs(payment, `  ${NOTE}\n`), { p_event_id: 'evt_2', p_note: NOTE });
  assert.deepEqual(markHandledArgs(noIntent, NOTE), { p_event_id: 'evt_1', p_note: NOTE });
  for (const bad of [null, undefined, {}, { eventId: '' }, { eventId: 7 }]) assert.equal(markHandledArgs(bad, NOTE), null, String(bad));
  assert.equal(markHandledArgs(payment, null).p_note, '');

  // The question names the payment and says what the action is for: refunded at Stripe first, nothing moves here.
  assert.equal(markHandledConfirmText(payment),
    'Mark the payment pi_stray (received Wed 21 Oct, 10:00) as handled? Do this only once you have refunded it, or otherwise settled it, at Stripe. Nothing is sent to Stripe and no money moves here. It leaves this list, and your note is kept with it.');
  // Without a PaymentIntent id the event id names it.
  assert.match(markHandledConfirmText(noIntent), /^Mark the payment evt_1 \(received —\) as handled\?/);
  assert.match(markHandledConfirmText(null), /^Mark this payment \(received —\) as handled\?/);

  // The banner after it: only for the answer that names this payment and says when it was marked.
  const answer = {
    event_id: 'evt_2', payment_intent_id: 'pi_stray', received_at: '2026-10-21T08:00:00Z',
    handled_at: '2026-10-23T12:02:00Z', handled_by: 'u1', handled_note: NOTE,
  };
  assert.equal(markedHandledText(answer, payment), 'Payment pi_stray is marked handled (Fri 23 Oct, 14:02).');
  assert.equal(markedHandledText({ ...answer, event_id: 'evt_9' }, payment), null);
  assert.equal(markedHandledText({ ...answer, handled_at: null }, payment), null);
  assert.equal(markedHandledText({ ...answer, handled_at: 'nope' }, payment), null);
  for (const bad of [null, undefined, [], 'x', 4, {}]) assert.equal(markedHandledText(bad, payment), null, String(bad));
  assert.equal(markedHandledText(answer, null), null);

  // The refusals, in words: not an admin; the server's own reason (the note, a payment a booking holds, one handled already); anything else.
  assert.equal(markHandledErrorText({ code: '42501', message: 'Admins only' }), 'Couldn’t mark it handled: this account isn’t an admin.');
  assert.equal(markHandledErrorText({ message: 'Admins only' }), 'Couldn’t mark it handled: this account isn’t an admin.');
  assert.equal(markHandledErrorText({ code: '22023', hint: 'invalid_input', message: 'Payment pi_stray was marked handled already' }),
    'Couldn’t mark it handled: the server refused it (Payment pi_stray was marked handled already). Refresh the list: a booking may hold this payment now, or another reviewer may have handled it.');
  assert.equal(markHandledErrorText({ code: '22023', hint: 'invalid_input', message: 'No payment evt_2 that no booking holds' }),
    'Couldn’t mark it handled: the server refused it (No payment evt_2 that no booking holds). Refresh the list: a booking may hold this payment now, or another reviewer may have handled it.');
  assert.equal(markHandledErrorText({ code: '22023', hint: 'invalid_input', message: 'The note is 5 to 1000 characters' }),
    'Couldn’t mark it handled: the server refused it (The note is 5 to 1000 characters).');
  assert.match(markHandledErrorText({ hint: 'invalid_input' }), /^Couldn’t mark it handled: the server refused it \(invalid_input\)\./);
  assert.equal(markHandledErrorText({ message: 'network error' }), 'Couldn’t mark it handled: network error. Refresh the list to see whether it went through.');
  assert.equal(markHandledErrorText(null), 'Couldn’t mark it handled: unknown error. Refresh the list to see whether it went through.');
});

test('a_pending_payouts_retry_says_it_looks_first', () => {
  // The new way out (failed_jobs[].retryable on a pending payout whose lookup settled nothing): the page offers exactly what is retryable.
  const pending = (job) => caseRow({
    problems: [], attention: 'transfer_failed', failed_jobs: [job],
  }, { transfer_status: 'pending', payout_cents: 1760 });
  const retryable = { id: 't1', kind: 'transfer', amount_cents: 1760, last_error: 'timeout', retryable: true, retry_refusal: null };
  const row = pending(retryable);
  const [job] = failedJobs(row);
  assert.equal(job.retryable, true);
  assert.equal(job.cents, 1760);
  assert.equal(retryLabel(job), 'Retry the transfer · €17.60');
  // The wording of a failed payout ("it is sent again") would be wrong here: the worker looks at Stripe first, and Stripe may say reversed.
  assert.equal(retryConfirmText(job, row),
    'Retry the transfer of €17.60 to Happy Paws Walking? Zoovo first looks at Stripe for a transfer an earlier attempt may have made. If there is one, it is recorded and nothing more is sent. If there is none, €17.60 is sent. If Stripe shows the transfer was reversed, nothing is sent and the job fails again.');
  assert.doesNotMatch(retryConfirmText(job, row), /same key|sent again/);
  // Without an amount in the row none is named.
  assert.match(retryConfirmText({ ...job, cents: null }, row), /^Retry the transfer to Happy Paws Walking\? .* If there is none, the payout is sent\. /);
  assert.match(retryConfirmText(job, caseRow({ pro: null }, { transfer_status: 'pending' })), /^Retry the transfer of €17\.60 to the pro\? /);
  // A payout that failed keeps its own wording: known outcome, sent again at the payout now.
  const failed = caseRow({ problems: [], attention: 'transfer_failed' }, { transfer_status: 'failed' });
  assert.equal(retryConfirmText(job, failed), 'Retry the failed transfer to Happy Paws Walking? It is sent again at the current payout amount, €17.60.');
  // A pending payout's other jobs keep theirs.
  assert.equal(retryConfirmText({ id: 'l', kind: 'transfer_lookup', label: 'transfer lookup', cents: null }, row),
    'Retry the failed transfer lookup? It only asks Stripe whether the transfer exists; no money moves.');
  // The server's refusal is still a no, with its reason.
  const refused = failedJobs(pending({ ...retryable, retryable: false, retry_refusal: 'The payout is pending, not being paid' }))[0];
  assert.equal(refused.retryable, false);
  assert.equal(refused.refusal, 'The payout is pending, not being paid');
});
