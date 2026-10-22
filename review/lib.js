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
  // hasOwn: 'constructor' and the like are not reasons, even though every object has them.
  if (Object.hasOwn(PRO_REASONS, key)) return PRO_REASONS[key];
  if (Object.hasOwn(CUSTOMER_REASONS, key)) return CUSTOMER_REASONS[key];
  return key;
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

// The name's second line: the city, or the email when the city is unknown.
export function proSubline(pro) {
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return text(pro?.city) ?? text(pro?.email);
}

// ---------------------------------------------------------------------------
// A pro's cancellations (admin_pro_cancellations)
// ---------------------------------------------------------------------------

// Days and times are Amsterdam wall-clock, as in the app. en-US gives short
// names without the stray comma or "Sept" that en-GB has.
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', month: 'short',
});
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function amsterdam(format, iso) {
  if (typeof iso !== 'string') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(format.formatToParts(date).map(({ type, value }) => [type, value]));
}

// "Mon 5 Oct", or null for something that isn't a date.
function dayLabel(iso) {
  const p = amsterdam(DAY_FORMAT, iso);
  return p ? `${p.weekday} ${p.day} ${p.month}` : null;
}

// "Mon 5 Oct, 09:00".
function dayTimeLabel(iso) {
  const day = dayLabel(iso);
  const time = amsterdam(TIME_FORMAT, iso);
  return day && time ? `${day}, ${time.hour}:${time.minute}` : null;
}

// admin_pro_cancellations rows ({booking_id, cancelled_at, service_title,
// start_at, end_at, reason, note, refunded_cents}, newest first) as the
// strings the table shows. `note` is quoted, or null for "No note".
export function cancellationRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)).map((r) => {
    const note = typeof r.note === 'string' ? r.note.trim() : '';
    const title = typeof r.service_title === 'string' && r.service_title.trim() ? r.service_title.trim() : null;
    return {
      id: r.booking_id,
      cancelledOn: dayLabel(r.cancelled_at) ?? '—',
      booking: [title, dayTimeLabel(r.start_at)].filter(Boolean).join(' · ') || '—',
      reason: reasonLabel(r.reason),
      note: note ? `“${note}”` : null,
      refunded: formatEuro(r.refunded_cents),
    };
  });
}

// ---------------------------------------------------------------------------
// The Problems tab (admin_list_problem_cases and the actions on a case)
// ---------------------------------------------------------------------------

// A "case" is one row of admin_list_problem_cases: {booking, customer, pro,
// refunds, problems, attention, suggested_no_show_refund_cents}. These
// helpers never trust its shape: a missing or odd part reads as empty.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const trimmed = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const bookingOf = (row) => (isObject(row) && isObject(row.booking) ? row.booking : {});
// The word for a key, the key itself when the page doesn't know it, and
// `fallback` when it isn't a string. hasOwn: 'constructor' is not a label.
const lookup = (labels, key, fallback = '—') => {
  if (typeof key !== 'string') return fallback;
  return Object.hasOwn(labels, key) ? labels[key] : key;
};

const NOTE_MIN = 5;
const NOTE_MAX = 1000;
const INT4_MAX = 2147483647; // the RPC takes the refund as an integer

// The problems that still wait for the team.
export function openProblems(row) {
  const list = isObject(row) ? row.problems : null;
  return Array.isArray(list) ? list.filter((p) => isObject(p) && p.status === 'open') : [];
}

const ATTENTION = { problem: 'Problem open', refund_failed: 'Refund failed', transfer_failed: 'Transfer failed' };

// Why a case is in the open list: '' when nothing is wrong.
export function attentionLabel(row) {
  const key = isObject(row) ? row.attention : null;
  return typeof key === 'string' && Object.hasOwn(ATTENTION, key) ? ATTENTION[key] : '';
}

// What the 'open' filter of the RPC lists: an open problem, or money that failed.
export function isOpenCase(row) {
  return openProblems(row).length > 0 || attentionLabel(row) !== '';
}

// The decisions the RPC accepts for this case. A card dispute can't be
// refunded, so a case with an open dispute only allows release or withhold.
// With nothing open there is nothing to decide.
export function allowedDecisions(row) {
  const open = openProblems(row);
  if (open.length === 0) return [];
  return open.some((p) => p.kind === 'dispute') ? ['release', 'withhold'] : ['full_refund', 'partial_refund', 'release'];
}

// What can still be refunded: the price minus what was refunded, never below
// zero; null when the booking has no usable price.
export function refundableCents(row) {
  const { price_cents: price, refunded_cents: refunded } = bookingOf(row);
  const done = refunded ?? 0;
  if (!Number.isInteger(price) || price < 0 || !Number.isInteger(done) || done < 0) return null;
  return Math.max(0, price - done);
}

// The note every team action needs: 5 to 1000 characters once trimmed. Postgres
// counts characters, not UTF-16 units, so an emoji counts once.
export function validateNote(note) {
  const length = typeof note === 'string' ? [...note.trim()].length : 0;
  if (length < NOTE_MIN) return `The note is required: write at least ${NOTE_MIN} characters.`;
  if (length > NOTE_MAX) return `The note can be at most ${NOTE_MAX} characters.`;
  return null;
}

const NO_PRICE = 'This booking has no price on record, so a refund can’t be worked out here.';

// null when the decision can be sent, else the sentence to show. Mirrors
// admin_resolve_booking_problems: an allowed decision, a note of 5 to 1000
// characters, and for a partial refund 1 cent up to price - refunded.
// `refundCents` only matters for 'partial_refund'.
export function validateDecision(row, decision, refundCents, note) {
  const allowed = allowedDecisions(row);
  if (!allowed.includes(decision)) {
    if (allowed.length === 0) return 'This case has no open problem to decide.';
    const why = decision === 'withhold' ? ' Withholding needs a card dispute.'
      : (decision === 'full_refund' || decision === 'partial_refund') && allowed.includes('withhold')
        ? ' A disputed charge can only be released or withheld.' : '';
    return `That decision is not available for this case.${why}`;
  }
  const noteProblem = validateNote(note);
  if (noteProblem) return noteProblem;
  if (decision !== 'full_refund' && decision !== 'partial_refund') return null;

  const left = refundableCents(row);
  if (left === null) return NO_PRICE;
  if (left < 1) return 'Nothing is left to refund.';
  if (decision === 'full_refund') return null;
  if (!Number.isInteger(refundCents)) return 'Enter the amount to refund, for example 7 or 7,50.';
  if (refundCents < 1) return 'The refund must be at least €0.01.';
  if (refundCents > left) {
    const refunded = bookingOf(row).refunded_cents;
    const already = Number.isInteger(refunded) && refunded > 0 ? ` (${formatEuro(refunded)} is already refunded)` : '';
    return `The most you can refund is ${formatEuro(left)}${already}.`;
  }
  return null;
}

// What a person types for an amount in euros: '7', '7,50' or '7.50' (one to
// two decimals, a comma or a point) becomes cents. Anything else is null, so
// '7.505', '1.234,50' and '€7' are refused rather than guessed at, as is
// anything above a 32-bit integer of cents.
export function parseEuroToCents(value) {
  if (typeof value !== 'string') return null;
  const match = /^([0-9]+)(?:[.,]([0-9]{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + (match[2] ? Number(match[2].padEnd(2, '0')) : 0);
  return Number.isSafeInteger(cents) && cents <= INT4_MAX ? cents : null;
}

// Cents for the amount field: 1150 is '11.50'. '' for anything that isn't a
// whole number of cents.
export function centsToInput(cents) {
  if (!Number.isInteger(cents) || cents < 0) return '';
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

// What a refund of `refunded` cents leaves for the pro: the plan's split().
// kept = price - refunded, commission = pct_of(kept, 20) (half up), payout =
// kept - commission. Only used to tell the reviewer what to expect; the
// database computes the real split, and the page shows that afterwards.
export function splitAfterRefund(price, refunded) {
  if (!Number.isInteger(price) || !Number.isInteger(refunded) || price < 0 || refunded < 0) return null;
  const kept = Math.max(0, price - refunded);
  const commission = Math.floor((kept * 20 + 50) / 100);
  return { kept, commission, payout: kept - commission };
}

// The split after refunding `cents` more, or null when that isn't a refund
// the database would accept.
function splitAfterMore(row, cents) {
  const left = refundableCents(row);
  if (left === null || !Number.isInteger(cents) || cents < 1 || cents > left) return null;
  const b = bookingOf(row);
  return splitAfterRefund(b.price_cents, (b.refunded_cents ?? 0) + cents);
}

// The amount the controller's `suggested_no_show_refund_cents` proposes for a
// customer no-show (the cancellation policy at the start time, minus what was
// refunded): only while that report is open, and only if it is a refund the
// database would accept.
export function suggestedRefund(row) {
  const cents = isObject(row) ? row.suggested_no_show_refund_cents : null;
  const left = refundableCents(row);
  const hasNoShow = openProblems(row).some((p) => p.kind === 'customer_no_show');
  return hasNoShow && Number.isInteger(cents) && cents > 0 && left !== null && cents <= left ? cents : null;
}

const JOB_KINDS = {
  refund: 'refund', transfer: 'transfer', transfer_reversal: 'transfer reversal', cancel_intent: 'payment cancellation',
};

// The payment jobs that failed and can be retried: [{id, kind, label, error}].
// The case row names them in `failed_jobs` ({id, kind, last_error}); a retry
// needs a job id (admin_retry_payment_job), and without one there is nothing
// to retry from here.
export function failedJobs(row) {
  const list = isObject(row) ? row.failed_jobs : null;
  if (!Array.isArray(list)) return [];
  return list.filter((j) => isObject(j) && typeof j.id === 'string' && j.id !== '').map((j) => ({
    id: j.id,
    kind: typeof j.kind === 'string' ? j.kind : null,
    label: typeof j.kind === 'string' && Object.hasOwn(JOB_KINDS, j.kind) ? JOB_KINDS[j.kind] : 'payment job',
    error: trimmed(j.last_error),
  }));
}

// ---- Words for the case ----------------------------------------------------

const PROBLEM_KINDS = {
  pro_no_show: 'The pro didn’t show up',
  went_wrong: 'Something went wrong',
  other: 'Other',
  customer_no_show: 'The customer didn’t show up',
  dispute: 'Card dispute',
  suspension: 'The pro was suspended',
};

export function problemKindLabel(kind) {
  return lookup(PROBLEM_KINDS, kind, 'Problem');
}

const TRANSFERS = {
  none: 'No payout', pending: 'Pending', frozen: 'On hold', processing: 'Being sent',
  sent: 'Sent', failed: 'Failed', reversed: 'Reversed', withheld: 'Withheld',
};

export function transferLabel(status) {
  return lookup(TRANSFERS, status);
}

const METHODS = { card: 'card', apple_pay: 'Apple Pay', ideal: 'iDEAL', other: 'other' };

export function methodLabel(method) {
  return lookup(METHODS, method, 'unknown');
}

const PAYMENT_STATUSES = { unpaid: 'Unpaid', paid: 'Paid', partially_refunded: 'Partly refunded', refunded: 'Refunded' };

export function paymentStatusLabel(status) {
  return lookup(PAYMENT_STATUSES, status);
}

// Stripe's dispute statuses; null when there is no dispute.
const DISPUTE_STATUSES = {
  needs_response: 'Needs a response',
  under_review: 'Under review',
  won: 'Won',
  lost: 'Lost',
  warning_needs_response: 'Early warning, needs a response',
  warning_under_review: 'Early warning, under review',
  warning_closed: 'Early warning, closed',
  charge_refunded: 'Charge refunded',
};

export function disputeStatusLabel(status) {
  return lookup(DISPUTE_STATUSES, status, null);
}

const REFUND_REASONS = {
  policy: 'Cancellation policy', pro_cancelled: 'The pro cancelled', slot_taken: 'The time was taken',
  payment_mismatch: 'Payment didn’t match', account_deleted: 'Account deleted',
  pro_suspended: 'The pro was suspended', team: 'Team decision',
};
const REFUND_STATUSES = {
  requested: 'Queued', pending: 'Pending', succeeded: 'Refunded', failed: 'Failed', canceled: 'Canceled',
};

// What the team decided on a resolved problem, or null.
export function resolutionText(problem) {
  const p = isObject(problem) ? problem : {};
  switch (p.resolution) {
    case 'full_refund': return 'Refunded in full';
    case 'partial_refund': return Number.isInteger(p.resolution_cents) ? `Refunded ${formatEuro(p.resolution_cents)}` : 'Partly refunded';
    case 'release': return 'Payout released';
    case 'withhold': return 'Payout withheld';
    default: return null;
  }
}

// Who reported a problem: the customer or the pro by name, or the system
// (a card dispute, a suspension) when nobody did.
function reporterOf(problem, row) {
  if (problem.reporter_role === 'customer') return { who: trimmed(row?.customer?.name) ?? 'Pet parent', role: 'pet parent' };
  if (problem.reporter_role === 'pro') return { who: trimmed(row?.pro?.display_name) ?? 'Pro', role: 'pro' };
  if (problem.kind === 'dispute') return { who: 'Card dispute', role: 'from the card issuer' };
  if (problem.kind === 'suspension') return { who: 'Pro suspended', role: 'opened automatically' };
  return { who: 'Zoovo', role: 'opened automatically' };
}

// The list's "reported by" and "reason" cells, one entry per open problem. A
// case that is only here because money failed has no problem to name: the
// system is the reporter. Once every problem is resolved (the page keeps the
// case on screen to show the answer) the resolved ones are named instead.
export function caseItems(row) {
  const open = openProblems(row);
  const all = isObject(row) && Array.isArray(row.problems) ? row.problems.filter(isObject) : [];
  const failure = attentionLabel(row);
  if (open.length === 0 && (failure !== '' || all.length === 0)) {
    return [{ who: 'Zoovo', role: 'automatic check', reason: failure || 'Nothing open' }];
  }
  return (open.length ? open : all).map((p) => ({ ...reporterOf(p, row), reason: problemKindLabel(p.kind) }));
}

// Every problem of the case, open or resolved, as the card shows it.
export function problemDetails(row) {
  const list = isObject(row) && Array.isArray(row.problems) ? row.problems : [];
  return list.filter(isObject).map((p) => ({
    id: p.id,
    kind: problemKindLabel(p.kind),
    ...reporterOf(p, row),
    open: p.status === 'open',
    note: trimmed(p.note),
    dispute: disputeStatusLabel(p.dispute_status),
    when: whenLabel(p.created_at),
    resolution: p.status === 'resolved' ? resolutionText(p) : null,
    resolutionNote: trimmed(p.resolution_note),
  }));
}

// The refunds of the case. `failed` marks a refund that needs a retry.
export function refundRows(row) {
  const list = isObject(row) && Array.isArray(row.refunds) ? row.refunds : [];
  return list.filter(isObject).map((r) => ({
    amount: formatEuro(r.amount_cents),
    reason: lookup(REFUND_REASONS, r.reason),
    status: lookup(REFUND_STATUSES, r.status),
    failed: r.status === 'failed',
    when: whenLabel(r.created_at),
    note: trimmed(r.note),
  }));
}

// The oldest moment the team has been waited for: the oldest open problem,
// else the first failed refund (ISO string), else null.
export function waitingSince(row) {
  const oldest = (isos) => isos
    .map((iso) => [typeof iso === 'string' ? Date.parse(iso) : NaN, iso])
    .filter(([time]) => Number.isFinite(time))
    .sort((a, b) => a[0] - b[0])[0]?.[1] ?? null;
  const refunds = isObject(row) && Array.isArray(row.refunds) ? row.refunds : [];
  return oldest(openProblems(row).map((p) => p.created_at))
    ?? oldest(refunds.filter((r) => isObject(r) && r.status === 'failed').map((r) => r.created_at));
}

// "Wed 7 Oct, 16:00" in Amsterdam time, "—" when it isn't a date.
export function whenLabel(iso) {
  return dayTimeLabel(iso) ?? '—';
}

// "Wed 7 Oct, 16:00 – 17:00", or both ends in full when it spans days.
export function bookingWhen(startIso, endIso) {
  const start = dayTimeLabel(startIso);
  if (!start) return '—';
  const endTime = amsterdam(TIME_FORMAT, endIso);
  const endDay = dayLabel(endIso);
  if (!endTime || !endDay) return start;
  return endDay === dayLabel(startIso) ? `${start} – ${endTime.hour}:${endTime.minute}` : `${start} – ${dayTimeLabel(endIso)}`;
}

const CANCELLED_BY = { customer: 'the pet parent', pro: 'the pro' };

// For a cancelled booking: who cancelled, when, with the reason in the app's
// words and the note. null for any other status.
export function cancellationText(booking) {
  if (!isObject(booking) || booking.status !== 'cancelled') return null;
  const by = typeof booking.cancelled_by === 'string' && Object.hasOwn(CANCELLED_BY, booking.cancelled_by)
    ? CANCELLED_BY[booking.cancelled_by] : null;
  const when = dayTimeLabel(booking.cancelled_at);
  const note = trimmed(booking.cancel_note);
  return [
    `Cancelled ${by ? `by ${by}` : 'automatically'}${when ? ` on ${when}` : ''}`,
    by || trimmed(booking.cancel_reason) ? `Reason: ${reasonLabel(booking.cancel_reason)}` : null,
    note ? `“${note}”` : null,
  ].filter(Boolean).join(' · ');
}

// ---- What each action says it will do --------------------------------------

const customerName = (row) => trimmed(row?.customer?.name) ?? 'the pet parent';
const proName = (row) => trimmed(row?.pro?.display_name) ?? 'the pro';
const NOTIFIED = 'Both are notified.';

// The sentence under a decision's button: what the reviewer should expect.
// '' when the decision or the amount isn't one the database would accept.
export function decisionPreview(row, decision, refundCents) {
  const b = bookingOf(row);
  const customer = upperFirst(customerName(row));
  const pro = upperFirst(proName(row));
  const left = refundableCents(row);
  switch (decision) {
    case 'full_refund':
      if (!left) return '';
      return `${customer} gets ${b.refunded_cents > 0 ? `the remaining ${formatEuro(left)}` : 'everything'} back. ${pro} receives nothing; no commission.`;
    case 'partial_refund': {
      const split = splitAfterMore(row, refundCents);
      return split ? `${customer} gets ${formatEuro(refundCents)} back. ${pro} receives ${formatEuro(split.payout)} and Zoovo keeps ${formatEuro(split.commission)}.` : '';
    }
    case 'release':
      if (b.transfer_status === 'sent') return `No refund. The payout of ${formatEuro(b.payout_cents)} was already sent to ${proName(row)}.`;
      if (!(b.payout_cents > 0)) return 'No refund and no payout is due; this only closes the case.';
      return `No refund. ${pro} is paid ${formatEuro(b.payout_cents)} at the next payout run.`;
    case 'withhold':
      if (b.transfer_status === 'sent') return 'Marks the payout as withheld. It does not take back money that was already sent: use Reverse transfer for that.';
      return `No refund. ${pro} is not paid ${formatEuro(b.payout_cents)} for this booking.`;
    default:
      return '';
  }
}

// The question asked before a decision is sent. It names the amount that
// moves. '' for a decision or amount that can't be sent.
export function confirmText(row, decision, refundCents) {
  const b = bookingOf(row);
  const customer = customerName(row);
  const pro = proName(row);
  const payout = formatEuro(b.payout_cents);
  switch (decision) {
    case 'full_refund': {
      const left = refundableCents(row);
      if (!left) return '';
      return `Refund ${formatEuro(left)} in full to ${customer}? ${upperFirst(pro)} will receive nothing for this booking. ${NOTIFIED} A refund can’t be taken back.`;
    }
    case 'partial_refund': {
      const split = splitAfterMore(row, refundCents);
      if (!split) return '';
      return `Refund ${formatEuro(refundCents)} to ${customer}? ${upperFirst(pro)} will receive ${formatEuro(split.payout)} and Zoovo keeps ${formatEuro(split.commission)}. ${NOTIFIED} A refund can’t be taken back.`;
    }
    case 'release':
      if (b.transfer_status === 'sent') return `Close this case with no refund? The payout of ${payout} was already sent to ${pro}. ${NOTIFIED}`;
      if (!(b.payout_cents > 0)) return `Close this case with no refund and no payout? ${NOTIFIED}`;
      return `Release the payout of ${payout} to ${pro}, with no refund? ${NOTIFIED}`;
    case 'withhold':
      if (b.transfer_status === 'sent') {
        return `Withhold the payout of ${payout} from ${pro}? The transfer was already sent, and this does not take it back (Reverse transfer does). ${NOTIFIED}`;
      }
      return `Withhold the payout of ${payout} from ${pro}? They will not be paid for this booking. ${NOTIFIED}`;
    default:
      return '';
  }
}

export function reverseConfirmText(row) {
  return `Reverse the transfer of ${formatEuro(bookingOf(row).payout_cents)} to ${proName(row)}? The money is taken back from their Stripe account.`;
}

// `job` is an entry of failedJobs().
export function retryConfirmText(job) {
  return `Retry the failed ${job?.label ?? 'payment job'}? Stripe receives it again with the same key, so it can’t happen twice.`;
}

// ---- What came back ----------------------------------------------------------

// admin_resolve_booking_problems answers with the case row. It is used only
// when it is a case row of this booking; anything else is not trusted.
export function asCaseRow(value, bookingId) {
  return isObject(value) && isObject(value.booking) && value.booking.id === bookingId && Array.isArray(value.problems)
    ? value : null;
}

// The banner after a decision, worked out from the row the database returned
// (not from what was sent). null while problems are still open in it: then
// nothing was resolved and the page must not say so.
export function savedText(row) {
  if (!isObject(row) || openProblems(row).length > 0) return null;
  const problems = Array.isArray(row.problems) ? row.problems : [];
  const done = problems.filter(isObject).find((p) => p.status === 'resolved' && resolutionText(p));
  if (!done) return null;
  const refunds = Array.isArray(row.refunds) ? row.refunds : [];
  const queued = refunds.some((r) => isObject(r) && (r.status === 'requested' || r.status === 'pending'));
  return `Decision saved: ${resolutionText(done)}.${queued ? ' The refund is queued; its status is below.' : ''}`;
}

// A failed action in words. invalid_input is what the database says for a
// case somebody else already decided as well as for a bad note or amount.
export function saveErrorText(error) {
  const message = trimmed(error?.message) ?? 'unknown error';
  if (/invalid_input/.test(message)) {
    return 'Couldn’t save: the server refused it (invalid_input). Another reviewer may have decided this case already, or the note or amount isn’t valid.';
  }
  if (error?.code === '42501' || /Admins only/.test(message)) return 'Couldn’t save: this account isn’t an admin.';
  return `Couldn’t save: ${message}`;
}

// ---- The chat -----------------------------------------------------------------

// admin_booking_messages ([{body, kind, sender_role, created_at, deleted}],
// newest first) as lines, oldest first. A deleted message shows no text. Cards
// the app adds to the thread (kind other than 'text') are marked as such.
export function chatLines(messages, row) {
  if (!Array.isArray(messages)) return [];
  return messages.filter(isObject).reverse().map((m) => {
    const system = typeof m.kind === 'string' && m.kind !== 'text';
    const who = system ? 'Booking'
      : m.sender_role === 'customer' ? trimmed(row?.customer?.name) ?? 'Pet parent'
        : m.sender_role === 'pro' ? trimmed(row?.pro?.display_name) ?? 'Pro'
          : typeof m.sender_role === 'string' && m.sender_role ? upperFirst(m.sender_role) : 'Zoovo';
    const deleted = m.deleted === true;
    return {
      who,
      when: whenLabel(m.created_at),
      text: deleted ? 'Message deleted' : typeof m.body === 'string' ? m.body : '',
      muted: system || deleted,
    };
  });
}
