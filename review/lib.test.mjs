// Run with: node --test review/
// Only the pure helpers are tested; the page itself needs a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kvkUrl, verificationBadges, stateText, formatEuro, cancelRate, durationLabel,
  reasonLabel, reasonCounts, stripeTypeNote, sortPros,
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
