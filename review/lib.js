// Pure helpers for the review dashboard (index.html). Nothing here touches the
// page or the network, so `node --test review/*.test.mjs` can check them.
//
// Everything that comes back from the database is data, never markup: these
// functions return plain strings, numbers and objects, and the page puts them
// on the screen with textContent.

const KVK_QUERY = 'https://www.kvk.nl/zoeken/?source=all&q=';

// The KvK register search for a company number, or null when `kvk` is not
// exactly 8 digits. Spaces are ignored, as the server does when it validates
// the application, and only those 8 digits end up in the link.
export function kvkUrl(kvk) {
  if (typeof kvk !== 'string') return null;
  const digits = kvk.replace(/\s+/g, '');
  return /^[0-9]{8}$/.test(digits) ? `${KVK_QUERY}${digits}` : null;
}

// What the team sees for the two things a pro must finish before applying.
// `verification` is {identity_status, connected, details_submitted,
// payouts_enabled, transfers_active, requirements_due, business_type}. Each
// state is 'ok', 'pending' (Stripe is working on it), 'todo' (not started) or
// 'attention' (the pro has to act again). Without a verification object (a
// database from before migration 107) there is nothing to show: [].
export function verificationBadges(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return [
    { label: 'Identity', state: identityState(v.identity_status) },
    { label: 'Payouts', state: payoutsState(v) },
  ];
}

// identity_status: none, pending, processing, verified, requires_input, canceled.
// A canceled session leaves nothing running, so it reads like "not started".
function identityState(status) {
  switch (status) {
    case 'verified': return 'ok';
    case 'pending':
    case 'processing': return 'pending';
    case 'requires_input': return 'attention';
    default: return 'todo';
  }
}

// Active means the account can take payouts and transfers with nothing left
// to fill in: the same test the database uses for taking bookings.
function payoutsState(v) {
  if (!v.connected) return 'todo';
  if (v.requirements_due) return 'attention';
  return v.payouts_enabled && v.transfers_active ? 'ok' : 'pending';
}

const STATE_TEXT = {
  Identity: { ok: 'Verified', pending: 'In progress', todo: 'Not started', attention: 'Needs action' },
  Payouts: { ok: 'Active', pending: 'In progress', todo: 'Not started', attention: 'Needs information' },
};

// The word for a badge: stateText('Payouts', 'attention') is "Needs information".
export function stateText(label, state) {
  return STATE_TEXT[label]?.[state] ?? '';
}

// 2200 is "€22", 2250 is "€22.50". Not a number: "—".
export function formatEuro(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  const total = Math.round(Math.abs(cents));
  const euros = Math.floor(total / 100);
  const rest = total % 100;
  const sign = cents < 0 && total > 0 ? '-' : '';
  return rest === 0 ? `${sign}€${euros}` : `${sign}€${euros}.${String(rest).padStart(2, '0')}`;
}

// pro_cancel_rate_90d is a fraction (0.25), or null when the pro had no
// bookings in the 90 days.
export function cancelRate(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

// 30 is "30 min", 90 is "1 h 30 min", 120 is "2 h". Null when `minutes` is not
// a whole number above zero (the hour, day and night prices need no duration).
export function durationLabel(minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : null, rest ? `${rest} min` : null].filter(Boolean).join(' ');
}

// The cancel reasons, in the app's words (bookingProReason and
// bookingCustomerReason in app_en.arb). The pro list is in the app's order.
const PRO_REASONS = {
  not_available: 'Not available any more',
  unwell: 'I’m ill',
  cant_take_pet: 'Can’t take this pet',
  emergency: 'Emergency',
  other: 'Other',
};
const CUSTOMER_REASONS = {
  plans_changed: 'Plans changed',
  pet_unwell: 'My pet is unwell',
  found_other: 'Found another option',
  other: 'Other',
};
const NO_REASON = 'No reason given';

// 'customer' is what a booking stores when the customer cancelled without
// picking a reason. A key this page doesn't know is shown as it is.
export function reasonLabel(key) {
  if (typeof key !== 'string' || key === '' || key === 'customer') return NO_REASON;
  return PRO_REASONS[key] ?? CUSTOMER_REASONS[key] ?? key;
}

// cancel_reasons_90d ({reason: count}) as [{key, label, count}]: the most
// common reason first, then the app's order, then unknown keys by name.
// Anything that isn't a whole number above zero is left out.
export function reasonCounts(reasons) {
  if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons)) return [];
  const order = Object.keys(PRO_REASONS);
  const place = (key) => (order.includes(key) ? order.indexOf(key) : order.length);
  return Object.entries(reasons)
    .filter(([, count]) => Number.isInteger(count) && count > 0)
    .map(([key, count]) => ({ key, label: reasonLabel(key), count }))
    .sort((a, b) => b.count - a.count || place(a.key) - place(b.key) || a.key.localeCompare(b.key));
}

// Stripe's business_type next to the form's private-or-business choice. The
// team looks for a mismatch, so only a difference gets a note.
const STRIPE_TYPES = {
  individual: { label: 'Private', business: false },
  company: { label: 'Business', business: true },
  non_profit: { label: 'Non-profit', business: true },
  government_entity: { label: 'Government', business: true },
};

export function stripeTypeNote(isBusiness, businessType) {
  const type = typeof businessType === 'string' && Object.hasOwn(STRIPE_TYPES, businessType)
    ? STRIPE_TYPES[businessType]
    : null;
  if (!type || type.business === Boolean(isBusiness)) return null;
  return `Stripe says: ${type.label}`;
}

// ---------------------------------------------------------------------------
// The Pros tab
// ---------------------------------------------------------------------------

export const PRO_SORTS = [
  ['rate', 'Cancellation rate'], ['bookings', 'Bookings'], ['problems', 'Open problems'], ['name', 'Name'],
];

const count = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const nameOf = (p) => String(p?.display_name ?? '');
const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), 'en', { sensitivity: 'base' });

const SORTERS = {
  // Highest rate first. No bookings in 90 days (rate null) comes last, because
  // there is nothing to rate.
  rate: (a, b) => {
    const x = typeof a.pro_cancel_rate_90d === 'number' ? a.pro_cancel_rate_90d : -1;
    const y = typeof b.pro_cancel_rate_90d === 'number' ? b.pro_cancel_rate_90d : -1;
    return y - x || count(b.pro_cancels_90d) - count(a.pro_cancels_90d) || byName(a, b);
  },
  bookings: (a, b) => count(b.bookings_90d) - count(a.bookings_90d)
    || count(b.bookings_total) - count(a.bookings_total) || byName(a, b),
  problems: (a, b) => count(b.problems_open) - count(a.problems_open)
    || count(b.problems_total) - count(a.problems_total) || byName(a, b),
  name: byName,
};

// A sorted copy of the admin_list_pros rows; an unknown key sorts by rate.
export function sortPros(pros, key) {
  if (!Array.isArray(pros)) return [];
  return [...pros].sort(Object.hasOwn(SORTERS, key) ? SORTERS[key] : SORTERS.rate);
}
