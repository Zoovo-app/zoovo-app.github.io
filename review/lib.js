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
// database from before migration 112) there is nothing to show: [].
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

const ATTENTION = {
  problem: 'Problem open', refund_failed: 'Refund failed', transfer_failed: 'Transfer failed',
  payout_mismatch: 'Payout amount differs',
};

// Why a case is in the open list: '' when nothing is wrong.
export function attentionLabel(row) {
  const key = isObject(row) ? row.attention : null;
  return typeof key === 'string' && Object.hasOwn(ATTENTION, key) ? ATTENTION[key] : '';
}

// What the 'open' filter of the RPC lists: an open problem, or money that failed.
export function isOpenCase(row) {
  return openProblems(row).length > 0 || attentionLabel(row) !== '';
}

const STRAY_PAYMENT = 'Payment on another PaymentIntent';

// The payments Stripe took on another PaymentIntent than the booking's own, as
// the case row lists them (stray_payments: [{log_id, payment_intent_id,
// amount_cents, created_at}], oldest first, [] when none): [{logId,
// paymentIntentId, cents, when, text}]. `text` is the line the card shows:
// "Payment on another PaymentIntent: €25, pi_x, Wed 21 Oct, 10:15" (the time is
// Amsterdam's). A part the entry lacks reads "—"; the payment is still listed,
// because it is still there. An entry that isn't an object is skipped.
export function strayPayments(row) {
  const list = isObject(row) && Array.isArray(row.stray_payments) ? row.stray_payments : [];
  return list.filter(isObject).map((p) => {
    const paymentIntentId = trimmed(p.payment_intent_id);
    const cents = Number.isInteger(p.amount_cents) && p.amount_cents >= 0 ? p.amount_cents : null;
    const when = whenLabel(p.created_at);
    return {
      logId: Number.isSafeInteger(p.log_id) ? p.log_id : null,
      paymentIntentId,
      cents,
      when,
      text: `${STRAY_PAYMENT}: ${formatEuro(cents)}, ${paymentIntentId ?? '—'}, ${when}`,
    };
  });
}

// Whether the stray payments are all that is wrong with the case: no problem is
// open, and the server offers acknowledge and nothing else (that is what it
// allows for a case whose only issue is stray payments).
export function onlyStrayPayments(row) {
  if (strayPayments(row).length === 0 || openProblems(row).length > 0) return false;
  const served = row.allowed_decisions;
  return Array.isArray(served) && served.length > 0 && served.every((d) => d === 'acknowledge');
}

const STRAY_REFUND_NOTE = 'Refund it in the Stripe dashboard. A refund here would hit the booking’s own payment.';
const STRAY_DECIDING_NOTE = 'Deciding this case also clears the stray payment; refund it at Stripe first.';

// The notes under the stray payments, [] when there are none. The refund is
// made at Stripe: a refund decision here refunds the booking's own payment. A
// decision other than acknowledge (an open problem's, or one for other money the
// log flags) answers the money log up to what the reviewer saw, the stray
// payment included, so that case is told to refund it first.
export function strayPaymentNotes(row) {
  if (strayPayments(row).length === 0) return [];
  const decides = openProblems(row).length > 0 || allowedDecisions(row).some((d) => d !== 'acknowledge');
  return decides ? [STRAY_REFUND_NOTE, STRAY_DECIDING_NOTE] : [STRAY_REFUND_NOTE];
}

const DECISIONS = ['full_refund', 'partial_refund', 'release', 'withhold', 'acknowledge'];

// The decisions the RPC accepts for this case. The case row says so itself
// (allowed_decisions, from the rules the RPC applies), and exactly those are
// offered, in the server's order. Only a row without that key (a database from
// before it) falls back to the old rule: a card dispute can't be refunded, so a
// case with an open dispute only allows release or withhold, and with nothing
// open there is nothing to decide.
export function allowedDecisions(row) {
  const served = isObject(row) ? row.allowed_decisions : undefined;
  if (Array.isArray(served)) return [...new Set(served.filter((d) => DECISIONS.includes(d)))];
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

// The money log id the case row reflects (seen_log_id), to send back as
// p_seen_log_id with a decision: the RPC refuses a decision when payment events
// arrived after it ("new payment events arrived, reload"). A booking with
// nothing in its money log has null: 0, "nothing seen", which the RPC accepts.
// A row without the key has nothing to send: null, and so has a value that
// isn't a whole number of at least 0. The RPC requires it, so no decision is
// sent for such a row (validateDecision, decisionArgs).
export function seenLogId(row) {
  if (!isObject(row)) return null;
  const id = row.seen_log_id;
  if (id === null) return 0;
  return Number.isSafeInteger(id) && id >= 0 ? id : null;
}

// What the reviewer reads when the case moved on under them: the RPC refused a
// decision made on an older view of it (M4-R17: new payment events arrived, or
// the row is stale), or the row on screen can't say which view it is (no
// usable seen_log_id), so nothing was sent. The page reloads the list either way.
export const CASE_CHANGED = 'This case changed while you were looking at it, so nothing was saved.';

// The arguments of admin_resolve_booking_problems for `decision` on `row`: the
// booking, the decision, the refund in cents (a partial refund's only; the
// server works out a full refund), the note trimmed, and p_seen_log_id, the
// money log the row reflects. null when the row can't say what was seen, or
// names no booking: then nothing may be sent. Check the decision with
// validateDecision first; this only builds what is sent.
export function decisionArgs(row, decision, refundCents, note) {
  const seen = seenLogId(row);
  const id = bookingOf(row).id;
  if (seen === null || typeof id !== 'string' || id === '') return null;
  return {
    p_booking_id: id,
    p_decision: decision,
    p_refund_cents: decision === 'partial_refund' && Number.isInteger(refundCents) ? refundCents : null,
    p_note: typeof note === 'string' ? note.trim() : '',
    p_seen_log_id: seen,
  };
}

const NO_PRICE = 'This booking has no price on record, so a refund can’t be worked out here.';

// null when the decision can be sent, else the sentence to show. Mirrors
// admin_resolve_booking_problems: a row that says what was seen (else
// CASE_CHANGED, before anything else: nothing can be sent for it), an allowed
// decision, a note of 5 to 1000 characters, and for a partial refund 1 cent up
// to price - refunded. `refundCents` only matters for 'partial_refund'.
export function validateDecision(row, decision, refundCents, note) {
  if (seenLogId(row) === null) return CASE_CHANGED;
  const allowed = allowedDecisions(row);
  if (!allowed.includes(decision)) {
    if (allowed.length === 0) {
      return isObject(row) && Array.isArray(row.allowed_decisions)
        ? 'No decision can be made on this case right now.'
        : 'This case has no open problem to decide.';
    }
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
  transfer_lookup: 'transfer lookup',
};

// The payment jobs that failed: [{id, kind, label, cents, error, retryable,
// refusal}]. The case row names them in `failed_jobs` ({id, kind, amount_cents,
// last_error, retryable, retry_refusal}); `cents` is amount_cents, what a retry
// asks Stripe for (for a transfer, the payout now), or null. The database
// decides whether a retry is accepted (payment_job_retry_refusal): only
// `retryable: true`, without a refusal, is a yes. Otherwise `refusal` says
// why, when it said.
export function failedJobs(row) {
  const list = isObject(row) ? row.failed_jobs : null;
  if (!Array.isArray(list)) return [];
  return list.filter((j) => isObject(j) && typeof j.id === 'string' && j.id !== '').map((j) => {
    const refusal = trimmed(j.retry_refusal);
    return {
      id: j.id,
      kind: typeof j.kind === 'string' ? j.kind : null,
      label: typeof j.kind === 'string' && Object.hasOwn(JOB_KINDS, j.kind) ? JOB_KINDS[j.kind] : 'payment job',
      cents: Number.isInteger(j.amount_cents) && j.amount_cents >= 0 ? j.amount_cents : null,
      error: trimmed(j.last_error),
      retryable: j.retryable === true && refusal === null,
      refusal,
    };
  });
}

// ---- Words for the case ----------------------------------------------------

const PROBLEM_KINDS = {
  pro_no_show: 'The pro didn’t show up',
  went_wrong: 'Something went wrong',
  other: 'Other',
  customer_no_show: 'The customer didn’t show up',
  dispute: 'Card dispute',
  suspension: 'The pro was suspended',
  refund_failed: 'Refund failed',
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
  pro_suspended: 'The pro was suspended', team: 'Team decision', hold_expired: 'Payment too late',
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
// system is the reporter, and the reason is the attention (a case whose only
// issue is stray payments says so, by name). Once every problem is resolved (the
// page keeps the case on screen to show the answer) the resolved ones are
// named instead.
export function caseItems(row) {
  const open = openProblems(row);
  const all = isObject(row) && Array.isArray(row.problems) ? row.problems.filter(isObject) : [];
  const failure = onlyStrayPayments(row) ? STRAY_PAYMENT : attentionLabel(row);
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

// When the team started being waited for: waiting_since, which
// admin_list_problem_cases puts on each open row and sorts the list by (the
// oldest open problem, the first money flag, a failed transfer's date, and so
// on). It is the server's own age, so nothing is worked out here. Answers to an
// action don't carry it, and resolved rows have null; a case nobody waits on
// has no time. null for anything that isn't a date.
export function waitingSince(row) {
  if (!isObject(row) || !isOpenCase(row)) return null;
  const iso = row.waiting_since;
  return typeof iso === 'string' && Number.isFinite(Date.parse(iso)) ? iso : null;
}

// How long ago `iso` was, in the words of the review lists: "less than an
// hour", whole hours up to two days ("37 h"), then days ("3 days").
export function waitedFor(iso, now = Date.now()) {
  const hours = Math.floor((now - new Date(iso).getTime()) / 36e5);
  if (hours < 1) return 'less than an hour';
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

// What a case shows of its waiting time, or null when it has none: the list's
// cell ("waiting 37 h") and the card's line ("Waiting since Thu 22 Oct, 00:30 ·
// 37 h", the time in Amsterdam).
export function waitingTexts(row, now = Date.now()) {
  const since = waitingSince(row);
  if (since === null) return null;
  const long = waitedFor(since, now);
  return { list: `waiting ${long}`, card: `Waiting since ${whenLabel(since)} · ${long}` };
}

// The answer to an action is a case row without waiting_since. While that case
// is still open it keeps the time the list gave for it (the next load asks the
// server again); a case the answer closed has none. An answer that carries the
// key (null included) says for itself.
export function keepWaiting(updated, previous) {
  if (!isObject(updated) || Object.hasOwn(updated, 'waiting_since')) return updated;
  const since = waitingSince(previous);
  return since !== null && isOpenCase(updated) ? { ...updated, waiting_since: since } : updated;
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

// The reasons the database gives when it cancels by itself.
const SYSTEM_REASONS = {
  slot_taken: 'Time no longer available',
  pro_suspended: 'Pro suspended',
  account_deleted: 'Account deleted',
  hold_expired: 'Payment not completed in time',
  payment_cancelled: 'Payment cancelled',
  payment_mismatch: 'Payment amount mismatch',
};

// A customer's or pro's reason in the app's words, else one of the database's
// own, else the key as it is.
function cancelReasonLabel(key) {
  return typeof key === 'string' && Object.hasOwn(SYSTEM_REASONS, key) ? SYSTEM_REASONS[key] : reasonLabel(key);
}

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
    by || trimmed(booking.cancel_reason) ? `Reason: ${cancelReasonLabel(booking.cancel_reason)}` : null,
    note ? `“${note}”` : null,
  ].filter(Boolean).join(' · ');
}

// ---- What each action says it will do --------------------------------------

const customerName = (row) => trimmed(row?.customer?.name) ?? 'the pet parent';
const proName = (row) => trimmed(row?.pro?.display_name) ?? 'the pro';

// What was transferred to the pro (booking.transferred_cents, set while the
// transfer is sent or reversed), or null when the case row doesn't say.
export function transferredCents(row) {
  const cents = bookingOf(row).transferred_cents;
  return Number.isInteger(cents) && cents >= 0 ? cents : null;
}

// A booking that was never confirmed (confirmed_at is there and null) was
// never the pro's: the RPC tells the pro only of a booking they saw.
const neverConfirmed = (row) => {
  const b = bookingOf(row);
  return Object.hasOwn(b, 'confirmed_at') && b.confirmed_at === null;
};

// Who is told when a decision is saved: the RPC notifies only for a case that
// had a report open (money flagged without one is closed silently), and the
// pro only for a booking they saw.
export function notifiedText(row) {
  if (openProblems(row).length === 0) return 'No one is notified.';
  return neverConfirmed(row) ? 'Only the pet parent is notified; the pro never saw this booking.' : 'Both are notified.';
}

// The line above the note: who hears of a decision. Acknowledging tells no one.
// '' when nothing can be decided.
export function decisionNoticeText(row) {
  const allowed = allowedDecisions(row);
  if (allowed.length === 0) return '';
  if (allowed.every((d) => d === 'acknowledge')) return 'No one is notified when you acknowledge.';
  if (openProblems(row).length === 0) return 'No one is notified when you decide: no report is open on this booking.';
  return neverConfirmed(row)
    ? 'Only the pet parent is notified when you decide; the pro never saw this booking.'
    : 'Both the pet parent and the pro are notified when you decide.';
}

// The wording on a decision's button.
export function decisionButtonLabel(row, decision) {
  const b = bookingOf(row);
  const payout = b.payout_cents > 0 ? ` · ${formatEuro(b.payout_cents)}` : '';
  switch (decision) {
    case 'full_refund': return `Refund in full · ${formatEuro(refundableCents(row) ?? 0)}`;
    case 'partial_refund': return 'Refund part';
    case 'release':
      // With no report open, release is how a flag on the booking's money leaves the list.
      if (openProblems(row).length === 0) return 'Clear flag (no refund)';
      // A payout that was already sent can't be released any more: the decision only closes the case.
      return b.transfer_status === 'sent' ? 'Release (keep the payout)' : `Release payout${payout}`;
    case 'withhold': return `Withhold payout${payout}`;
    case 'acknowledge': return 'Acknowledge';
    default: return '';
  }
}

// What an acknowledgement is about: the payout that differs (with the amounts
// when the row has them), or money flagged with no report open.
function acknowledgeSubject(row) {
  if (!isObject(row) || row.attention !== 'payout_mismatch') return { what: 'the flagged money on this booking', mismatch: false };
  const b = bookingOf(row);
  const sent = transferredCents(row);
  const owed = Number.isInteger(b.payout_cents) ? b.payout_cents : null;
  const amounts = sent !== null && owed !== null ? ` (${formatEuro(sent)} was sent, ${formatEuro(owed)} is owed)` : '';
  return { what: `the payout mismatch${amounts}`, mismatch: true };
}

// The sentence under a decision's button: what the reviewer should expect.
// '' when the decision or the amount isn't one the database would accept.
// `now` (a time in ms) tells a payout that is still ahead from one that is due.
export function decisionPreview(row, decision, refundCents, now = Date.now()) {
  const b = bookingOf(row);
  const customer = upperFirst(customerName(row));
  const pro = upperFirst(proName(row));
  const left = refundableCents(row);
  const sentCents = formatEuro(transferredCents(row) ?? b.payout_cents);
  switch (decision) {
    case 'full_refund':
      if (!left) return '';
      return `${customer} gets ${b.refunded_cents > 0 ? `the remaining ${formatEuro(left)}` : 'everything'} back. ${pro} receives nothing; no commission.`;
    case 'partial_refund': {
      const split = splitAfterMore(row, refundCents);
      return split ? `${customer} gets ${formatEuro(refundCents)} back. ${pro} receives ${formatEuro(split.payout)} and Zoovo keeps ${formatEuro(split.commission)}.` : '';
    }
    case 'release':
      if (openProblems(row).length === 0) {
        return 'No refund. This clears the flag on the booking’s money. A payout that is on hold goes back to pending.';
      }
      if (b.transfer_status === 'sent') return `No refund. The payout of ${sentCents} was already sent to ${proName(row)}.`;
      if (!(b.payout_cents > 0)) return 'No refund and no payout is due; this only closes the case.';
      if (Date.parse(b.payout_due_at) > now) {
        return `No refund. ${pro} is paid ${formatEuro(b.payout_cents)} once it is due (${whenLabel(b.payout_due_at)}).`;
      }
      return `No refund. ${pro} is paid ${formatEuro(b.payout_cents)} at the next payout run.`;
    case 'withhold':
      if (b.transfer_status === 'sent') {
        return `The payout of ${sentCents} was already sent to ${proName(row)}. Withholding only records the decision and takes nothing back: use Reverse transfer to take the money back.`;
      }
      return `No refund. ${pro} is not paid ${formatEuro(b.payout_cents)} for this booking.`;
    case 'acknowledge': {
      const { what } = acknowledgeSubject(row);
      return `Records that the team has seen ${what} and handled it outside the app. No money moves, no report is resolved and no one is notified.`;
    }
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
  const sentCents = formatEuro(transferredCents(row) ?? b.payout_cents);
  const notified = notifiedText(row);
  switch (decision) {
    case 'full_refund': {
      const left = refundableCents(row);
      if (!left) return '';
      return `Refund ${formatEuro(left)} in full to ${customer}? ${upperFirst(pro)} will receive nothing for this booking. ${notified} A refund can’t be taken back.`;
    }
    case 'partial_refund': {
      const split = splitAfterMore(row, refundCents);
      if (!split) return '';
      return `Refund ${formatEuro(refundCents)} to ${customer}? ${upperFirst(pro)} will receive ${formatEuro(split.payout)} and Zoovo keeps ${formatEuro(split.commission)}. ${notified} A refund can’t be taken back.`;
    }
    case 'release':
      if (openProblems(row).length === 0) {
        return `Clear the flag on this booking with no refund? A payout that is on hold goes back to pending. ${notified}`;
      }
      if (b.transfer_status === 'sent') return `Close this case with no refund? The payout of ${sentCents} was already sent to ${pro}. ${notified}`;
      if (!(b.payout_cents > 0)) return `Close this case with no refund and no payout? ${notified}`;
      return `Release the payout of ${payout} to ${pro}, with no refund? ${notified}`;
    case 'withhold':
      if (b.transfer_status === 'sent') {
        return `Withhold the payout of ${sentCents} from ${pro}? It was already sent: withholding only records the decision and takes nothing back (Reverse transfer does). ${notified}`;
      }
      return `Withhold the payout of ${payout} from ${pro}? They will not be paid for this booking. ${notified}`;
    case 'acknowledge':
      return `Acknowledge ${acknowledgeSubject(row).what}? You have handled it outside the app. It is recorded with your note; no money moves, no report is resolved and no one is notified.`;
    default:
      return '';
  }
}

// The reversal takes back what was transferred (transferred_cents), which can
// differ from the booking's payout; with no amount in the row none is named.
export function reverseLabel(row) {
  const sent = transferredCents(row);
  return `Reverse transfer${sent === null ? '' : ` · ${formatEuro(sent)}`}`;
}

export function reverseConfirmText(row) {
  const sent = transferredCents(row);
  return `Reverse the transfer${sent === null ? '' : ` of ${formatEuro(sent)}`} to ${proName(row)}? The money is taken back from their Stripe account.`;
}

// The kinds whose amount the retry's button and question name: the money ones.
const MONEY_JOBS = ['refund', 'transfer', 'transfer_reversal'];
const jobAmount = (job) => (MONEY_JOBS.includes(job?.kind) && Number.isInteger(job?.cents) ? job.cents : null);

// The retry button: "Retry the refund · €7". `job` is an entry of failedJobs().
export function retryLabel(job) {
  const cents = jobAmount(job);
  return `Retry the ${job?.label ?? 'payment job'}${cents === null ? '' : ` · ${formatEuro(cents)}`}`;
}

// The question before a retry, with the amount it asks Stripe for (the case
// row's failed_jobs[].amount_cents). A refund and a reversal run again under
// their own idempotency key, so within Stripe's 24-hour idempotency window
// Stripe answers a call it already made and can't make them twice. A transfer is sent again for the payout as it is now,
// under a new key when that amount changed (M4-R11), so it makes no such
// promise; and a pending payout's transfer first looks for the one an earlier
// attempt may have made, and may be answered "reversed". `job` is an entry of
// failedJobs().
export function retryConfirmText(job, row) {
  const cents = jobAmount(job);
  const of = cents === null ? '' : ` of ${formatEuro(cents)}`;
  const once = 'Stripe receives the same request again, so within 24 hours of the first attempt it can’t happen twice.';
  switch (job?.kind) {
    case 'refund': return `Retry the failed refund${of} to ${customerName(row)}? ${once}`;
    case 'transfer_reversal': return `Retry the failed transfer reversal${of} from ${proName(row)}? ${once}`;
    case 'transfer':
      // A pending payout's transfer has no known outcome (the team's way out of a lookup that settled nothing): the
      // worker lists the booking's transfers at Stripe before it creates one, adopts a live one, and fails for good on
      // one Stripe shows reversed. "Sent again" would promise what it may not do.
      if (bookingOf(row).transfer_status === 'pending') {
        const sends = cents === null ? 'the payout is sent' : `${formatEuro(cents)} is sent`;
        return `Retry the transfer${of} to ${proName(row)}? Zoovo first looks at Stripe for a transfer an earlier attempt may have made. If there is one, it is recorded and nothing more is sent. If there is none, ${sends}. If Stripe shows the transfer was reversed, nothing is sent and the job fails again.`;
      }
      return `Retry the failed transfer to ${proName(row)}? It is sent again${cents === null ? '' : ` for ${formatEuro(cents)}`}.`;
    case 'transfer_lookup': return 'Retry the failed transfer lookup? It only asks Stripe whether the transfer exists; no money moves.';
    case 'cancel_intent':
      return 'Retry the failed payment cancellation? Stripe is asked again to cancel the payment that was never taken; no money moves.';
    default: return `Retry the failed ${job?.label ?? 'payment job'}?`;
  }
}

// ---- Refunds made outside, and refunds that failed for good -------------------

const RECORDABLE = {
  refund_external: 'Refund made outside Zoovo',
  refund_status_conflict: 'Refund Stripe reports differently',
};

const STRIPE_REFUND_STATUSES = {
  succeeded: 'made', pending: 'pending', requires_action: 'needs action', failed: 'failed', canceled: 'canceled',
};

// Stripe's status of a refund in a word, null when there is none.
export function stripeRefundStatusLabel(status) {
  return lookup(STRIPE_REFUND_STATUSES, status, null);
}

// The Stripe refunds the books don't agree with, as the case row lists them in
// `money_flags` ({log_id, event, stripe_refund_id, amount_cents,
// reported_status, recordable, record_refusal}): a refund made at Stripe that
// the books don't have, or one whose Stripe status disagrees with them. The
// Stripe id comes from there and is never typed. [{stripeId, logId, event,
// cents, label, status, recordable, refusal}], each Stripe refund once. A flag
// is recordable only when the database says `recordable: true` and gives no
// refusal; otherwise `refusal` is its reason (admin_record_external_refund
// would refuse it with the same words).
export function moneyFlags(row) {
  const list = isObject(row) ? row.money_flags : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const flag of list) {
    const stripeId = isObject(flag) ? trimmed(flag.stripe_refund_id) : null;
    if (!stripeId || !Object.hasOwn(RECORDABLE, flag.event) || seen.has(stripeId)) continue;
    seen.add(stripeId);
    const given = trimmed(flag.record_refusal);
    const recordable = flag.recordable === true && given === null;
    out.push({
      stripeId,
      logId: Number.isInteger(flag.log_id) ? flag.log_id : null,
      event: flag.event,
      label: RECORDABLE[flag.event],
      cents: Number.isInteger(flag.amount_cents) && flag.amount_cents > 0 ? flag.amount_cents : null,
      status: stripeRefundStatusLabel(flag.reported_status),
      recordable,
      refusal: recordable ? null : given ?? 'The database did not say why this refund can’t be recorded yet.',
    });
  }
  return out;
}

// `flag` is an entry of moneyFlags().
export function recordRefundConfirmText(row, flag) {
  const amount = flag?.cents ? ` (${formatEuro(flag.cents)})` : '';
  const nothing = 'Nothing is sent to Stripe and no one is notified.';
  if (flag?.event === 'refund_external') {
    return `Record Stripe refund ${flag.stripeId}${amount} as a refund made outside Zoovo? It is counted in the refunded amount and the payout split. ${nothing}`;
  }
  return `Record what Stripe reports for refund ${flag?.stripeId}${amount}? Zoovo’s books are brought in line with Stripe, so the refunded amount and the payout can change. ${nothing}`;
}

// The banner after recording: true only if the returned row no longer lists
// that Stripe refund. `sent` is {stripeId}.
export function recordedText(row, sent) {
  const stripeId = trimmed(sent?.stripeId);
  if (!isObject(row) || !stripeId || !Array.isArray(row.money_flags)) return null;
  if (row.money_flags.some((f) => isObject(f) && trimmed(f.stripe_refund_id) === stripeId)) return null;
  return `Refund ${stripeId} recorded. Refunded so far: ${formatEuro(bookingOf(row).refunded_cents)}.`;
}

// The failed or canceled refunds that admin_requeue_refund would send again:
// [{amount, reason}]. The case row says so itself (refunds[].requeueable, from
// the rule the RPC applies: not sent again already, not reported made by
// Stripe, and a booking that allows it), and exactly those are listed. Only a
// row without the key falls back to a guess: a requeue makes a new refund of the
// same amount and reason, so a later refund like that is taken as the requeue
// of it, whatever became of it (a requeue that failed again leaves only itself
// to send). The database refuses what has none to send.
export function requeueableRefunds(row) {
  const list = (isObject(row) && Array.isArray(row.refunds) ? row.refunds : []).filter(isObject);
  if (list.some((r) => typeof r.requeueable === 'boolean')) {
    return list.filter((r) => r.requeueable === true).map((r) => ({ amount: r.amount_cents, reason: r.reason }));
  }
  const out = [];
  list.forEach((r, i) => {
    if (r.status !== 'failed' && r.status !== 'canceled') return;
    if (!list.some((o, j) => j > i && o.amount_cents === r.amount_cents && o.reason === r.reason)) {
      out.push({ amount: r.amount_cents, reason: r.reason });
    }
  });
  return out;
}

// Sending refunds again is offered when there are some. Without the server's
// answer it also waits for a Stripe refund that must be recorded first (the
// database refuses it then).
export function canRequeue(row) {
  const list = isObject(row) && Array.isArray(row.refunds) ? row.refunds : [];
  const served = list.some((r) => isObject(r) && typeof r.requeueable === 'boolean');
  return requeueableRefunds(row).length > 0 && (served || moneyFlags(row).length === 0);
}

export function requeueConfirmText(row) {
  const refunds = requeueableRefunds(row);
  if (refunds.length === 0) return '';
  const total = refunds.reduce((sum, r) => sum + (Number.isInteger(r.amount) ? r.amount : 0), 0);
  const customer = customerName(row);
  return refunds.length === 1
    ? `Send the failed refund of ${formatEuro(total)} again to ${customer}? It goes to Stripe as a new refund request. A refund can’t be taken back.`
    : `Send ${refunds.length} failed refunds again (${formatEuro(total)} in all) to ${customer}? Each goes to Stripe as a new refund request. A refund can’t be taken back.`;
}

// The banner after sending again: true only if nothing is left to send again.
// `sent` is {cents}, what was offered.
export function requeuedText(row, sent) {
  if (!isObject(row) || !Number.isInteger(sent?.cents) || requeueableRefunds(row).length > 0) return null;
  return `Refund sent again: ${formatEuro(sent.cents)} is queued; its status is below.`;
}

// ---- Checking a transfer at Stripe ---------------------------------------------

// admin_check_transfer asks the worker to look the booking's transfer up at
// Stripe. It is offered where the case shows a transfer that failed or has no
// known outcome (attention transfer_failed, or a failed transfer or lookup job)
// or a payout that differs from what was sent (payout_mismatch, a lookup
// conflict included). The database refuses it for a booking with no transfer,
// or while one is being sent, and the page shows that message.
export function canCheckTransfer(row) {
  if (!isObject(row)) return false;
  if (row.attention === 'transfer_failed' || row.attention === 'payout_mismatch') return true;
  return failedJobs(row).some((j) => j.kind === 'transfer' || j.kind === 'transfer_lookup');
}

export function checkTransferConfirmText(row) {
  return `Ask Stripe whether the transfer to ${proName(row)} exists? The worker only looks it up and reports what it finds. Nothing is sent to the pro and no money moves.`;
}

// ---- What came back ----------------------------------------------------------

// admin_resolve_booking_problems answers with the case row. It is used only
// when it is a case row of this booking; anything else is not trusted.
export function asCaseRow(value, bookingId) {
  return isObject(value) && isObject(value.booking) && value.booking.id === bookingId && Array.isArray(value.problems)
    ? value : null;
}

// The banner after a decision, worked out from the row the database returned
// (not from what was sent). `sent` is {decision, ids}: the decision that was
// sent and the ids of the problems that were open when it was sent. Only those
// problems count: an earlier decision on the same booking is not announced. It
// says "saved" only if each of them is resolved now, the way it was sent, and
// no problem is open in the answer; otherwise it is null and the page must not
// claim anything. A queued refund is mentioned only when this decision made one.
export function savedText(row, sent) {
  // Acknowledging resolves no problem (a report may well stay open): the proof is
  // that the database no longer offers it on the returned row.
  if (isObject(row) && isObject(sent) && sent.decision === 'acknowledge') {
    return Array.isArray(row.allowed_decisions) && !row.allowed_decisions.includes('acknowledge')
      ? 'Acknowledged: the team has seen it and handled it outside the app. No money moved.' : null;
  }
  if (!isObject(row) || openProblems(row).length > 0 || !isObject(sent)) return null;
  const ids = Array.isArray(sent.ids) ? sent.ids : [];
  if (ids.length === 0) return savedFlagText(row, sent);
  const problems = Array.isArray(row.problems) ? row.problems.filter(isObject) : [];
  const closed = problems.filter((p) => ids.includes(p.id) && p.status === 'resolved');
  if (ids.length === 0 || closed.length !== ids.length || !closed.every((p) => p.resolution === sent.decision)) return null;
  const said = resolutionText(closed[0]);
  if (!said) return null;
  // The refund this decision created: the team's, for the amount decided, still on its way.
  const cents = closed[0].resolution_cents;
  const refunds = Array.isArray(row.refunds) ? row.refunds : [];
  const queued = (sent.decision === 'full_refund' || sent.decision === 'partial_refund')
    && refunds.some((r) => isObject(r) && r.reason === 'team' && (r.status === 'requested' || r.status === 'pending')
      && (!Number.isInteger(cents) || r.amount_cents === cents));
  return `Decision saved: ${said}.${queued ? ' The refund is queued; its status is below.' : ''}`;
}

// A decision on a case with no report open (money was flagged): there were no
// problems to see resolved, so the proof is in the returned row: the database
// allows no decision on it any more, and for a refund the booking's refunded
// amount grew by what was sent (`cents`, from `refundedBefore`).
function savedFlagText(row, sent) {
  if (!Array.isArray(row.allowed_decisions) || row.allowed_decisions.length > 0) return null;
  if (sent.decision === 'release') return 'Decision saved: the flag is cleared, no refund.';
  if (sent.decision !== 'full_refund' && sent.decision !== 'partial_refund') return null;
  const { cents, refundedBefore } = sent;
  if (!Number.isInteger(cents) || !Number.isInteger(refundedBefore) || bookingOf(row).refunded_cents !== refundedBefore + cents) return null;
  const refunds = Array.isArray(row.refunds) ? row.refunds : [];
  const queued = refunds.some((r) => isObject(r) && r.reason === 'team' && r.amount_cents === cents
    && (r.status === 'requested' || r.status === 'pending'));
  const said = sent.decision === 'full_refund' ? 'Refunded in full' : `Refunded ${formatEuro(cents)}`;
  return `Decision saved: ${said}.${queued ? ' The refund is queued; its status is below.' : ''}`;
}

// A failed action in words. Every refusal carries a HINT (the error contract),
// so that is read first, then the message. invalid_input is what the database
// says for a case somebody else already decided as well as for a bad note or
// amount; its message names the field.
export function saveErrorText(error) {
  const message = trimmed(error?.message);
  // A decision made on a case that has moved on (M4-R17): the reviewer must read it again.
  if (/new payment events arrived|stale or foreign case row/i.test(message ?? '')) return CASE_CHANGED;
  if (error?.hint === 'invalid_input' || /invalid_input/.test(message ?? '')) {
    const named = message && message !== 'invalid_input' ? ` (${message})` : ' (invalid_input)';
    return `Couldn’t save: the server refused it${named}. Another reviewer may have decided this case already, or the note or amount isn’t valid.`;
  }
  if (error?.code === '42501' || /Admins only/.test(message ?? '')) return 'Couldn’t save: this account isn’t an admin.';
  return `Couldn’t save: ${message ?? 'unknown error'}`;
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

// ---- Payment health ------------------------------------------------------------

// The scheduled jobs that log a job_error (116's booking_log_job_error).
const SCHEDULED_JOBS = {
  expire_booking_holds: 'Expiring payment holds',
  complete_ended_bookings: 'Completing ended bookings',
  schedule_due_payouts: 'Scheduling payouts',
  retry_payment_jobs: 'Retrying payment jobs',
};

// admin_payment_health ({unplaced_payments: [{event_id, payment_intent_id,
// received_at}], job_errors: [{log_id, booking_id, job, sqlstate, error,
// created_at}]}, each newest first) as the Payment health section shows it:
// {payments: [{eventId, paymentIntentId, when}], errors: [{logId, bookingId,
// job, error, sqlstate, when}]}. An entry without its id is left out; a
// missing list is empty. null when the answer isn't an object.
export function paymentHealth(data) {
  if (!isObject(data)) return null;
  const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
  return {
    payments: list(data.unplaced_payments).filter((p) => trimmed(p.event_id)).map((p) => ({
      eventId: trimmed(p.event_id),
      paymentIntentId: trimmed(p.payment_intent_id),
      when: whenLabel(p.received_at),
    })),
    errors: list(data.job_errors).filter((e) => Number.isSafeInteger(e.log_id)).map((e) => ({
      logId: e.log_id,
      bookingId: trimmed(e.booking_id),
      job: typeof e.job === 'string' && e.job ? lookup(SCHEDULED_JOBS, e.job) : 'A scheduled job',
      error: trimmed(e.error),
      sqlstate: trimmed(e.sqlstate),
      when: whenLabel(e.created_at),
    })),
  };
}

// ---- Marking a payment handled -----------------------------------------------------

// The arguments of admin_mark_payment_handled for `payment` (an entry of
// paymentHealth().payments): the event, and the note trimmed. null for a payment
// with no event id: then nothing is sent. Check the note with validateNote first.
export function markHandledArgs(payment, note) {
  const id = isObject(payment) ? trimmed(payment.eventId) : null;
  if (id === null) return null;
  return { p_event_id: id, p_note: typeof note === 'string' ? note.trim() : '' };
}

// The question before it is sent. Marking changes no money: the payment is
// refunded (or otherwise settled) at Stripe first, and this takes it off the list.
export function markHandledConfirmText(payment) {
  const name = trimmed(payment?.paymentIntentId) ?? trimmed(payment?.eventId);
  const when = typeof payment?.when === 'string' ? payment.when : '—';
  return `Mark ${name ? `the payment ${name}` : 'this payment'} (received ${when}) as handled? `
    + 'Do this only once you have refunded it, or otherwise settled it, at Stripe. '
    + 'Nothing is sent to Stripe and no money moves here. It leaves this list, and your note is kept with it.';
}

// The banner after it, worked out from what the database answered ({event_id,
// payment_intent_id, received_at, handled_at, handled_by, handled_note}), not from
// what was sent: only an answer that names this payment and says when it was marked.
export function markedHandledText(answer, payment) {
  const id = isObject(payment) ? trimmed(payment.eventId) : null;
  if (!isObject(answer) || id === null || answer.event_id !== id) return null;
  if (typeof answer.handled_at !== 'string' || !Number.isFinite(Date.parse(answer.handled_at))) return null;
  return `Payment ${trimmed(payment.paymentIntentId) ?? id} is marked handled (${whenLabel(answer.handled_at)}).`;
}

// A refused or failed marking in words. 42501 is a team member who isn't an
// admin; 22023 invalid_input carries the reason in its message (the note, a
// payment a booking holds now, one marked already), which is shown as it is. Any
// other failure may or may not have gone through.
export function markHandledErrorText(error) {
  const message = trimmed(error?.message);
  if (error?.code === '42501' || /Admins only/.test(message ?? '')) return 'Couldn’t mark it handled: this account isn’t an admin.';
  if (error?.hint === 'invalid_input' || /invalid_input/.test(message ?? '')) {
    const named = message ?? 'invalid_input';
    const advice = /^The note\b/.test(named)
      ? '' : ' Refresh the list: a booking may hold this payment now, or another reviewer may have handled it.';
    return `Couldn’t mark it handled: the server refused it (${named}).${advice}`;
  }
  return `Couldn’t mark it handled: ${message ?? 'unknown error'}. Refresh the list to see whether it went through.`;
}

// ---------------------------------------------------------------------------
// The Reports tab (admin_list_reports and admin_handle_report)
// ---------------------------------------------------------------------------

// A report is one item of admin_list_reports: {id, target_type, reason, created_at, reporter: {first_name},
// target, target_text, earlier_reports, handled}. The tab takes the reports about a service, a review and the
// reply under a review; user, post, message and comment reports stay where they are. As elsewhere in this file,
// a missing or odd part reads as empty and nothing here trusts the shape.

const REPORT_KINDS = {
  service: { kind: 'SERVICE', tag: 'service report', noun: 'service' },
  review: { kind: 'REVIEW', tag: 'review report', noun: 'review' },
  review_reply: { kind: 'REPLY', tag: 'reply report', noun: 'reply' },
};

// The app's service sheet sends keys; the review and reply sheets send their own words, kept as they are.
const REPORT_REASONS = {
  misleading: 'Misleading', welfare: 'Animal welfare concern', scam: 'Scam or fraud',
  inappropriate: 'Inappropriate content', other: 'Other',
};

// What a report's reason reads like, 'No reason given' when it has none.
function reportReasonLabel(reason) {
  const text = trimmed(reason);
  return text === null ? 'No reason given' : lookup(REPORT_REASONS, text);
}

// The review and reply sheets send "Other: <the reporter's note>", up to 1000 characters. In the list row, the
// card's heading, the aria-label and the names in a confirm a reason is cut to about this many characters; the
// card keeps all of it.
const REASON_SHOWN = 80;

// `text` cut to REASON_SHOWN characters (code points, so an emoji is never halved) and an ellipsis, with no
// space left before it; as it is when it fits.
function shortReason(text) {
  const chars = [...text];
  return chars.length <= REASON_SHOWN ? text : `${chars.slice(0, REASON_SHOWN).join('').trimEnd()}…`;
}

// The kind of a report the tab can show (it needs an id to be acted on), else null.
function reportKind(item) {
  if (!isObject(item) || trimmed(item.id) === null || typeof item.target_type !== 'string') return null;
  return Object.hasOwn(REPORT_KINDS, item.target_type) ? REPORT_KINDS[item.target_type] : null;
}

// The names in a target. null parts are the ones the database no longer has. `subject` is the first name of the
// person a pro's review is about; `direction` is 'customer_to_pro' (a pet parent's review of a pro, on the
// service page and in the pro's rating), 'pro_to_customer' (a pro's review of a pet parent, in the pet parent's
// rating and on no service page), or null when the server sent none or one this page doesn't know.
function targetParts(target) {
  const t = isObject(target) ? target : null;
  const direction = t?.direction === 'customer_to_pro' || t?.direction === 'pro_to_customer' ? t.direction : null;
  return {
    t, direction, author: trimmed(t?.author_first_name), pro: trimmed(t?.pro_display_name), title: trimmed(t?.title),
    subject: trimmed(t?.subject_first_name),
  };
}

const formerMember = 'a former member';
const possessive = (name, fallback) => (name ? `${name}’s` : fallback);
// A review as a phrase, by its direction: "review of Iris by Bram’s Dog Care" for a pro's review of a pet
// parent, else "review by Iris" (the pet parent who wrote it; also when the direction is not known).
function reviewPhrase({ direction, author, subject, pro }) {
  return direction === 'pro_to_customer'
    ? `review of ${subject ?? formerMember} by ${pro ?? 'the pro'}`
    : `review by ${author ?? formerMember}`;
}
// "Dog walking, 45 min" in quotes, or the words for a service that has no title.
const serviceName = (title) => (title ? `“${title}”` : 'this service');

// admin_list_reports' answer, {items, total}, as {items, total}: the reports this tab can show, and how many
// are open in all (more than the list when it was cut). null when the answer is not that.
export function reportList(data) {
  if (!isObject(data) || !Array.isArray(data.items)) return null;
  const items = data.items.filter((item) => reportKind(item) !== null);
  const total = Number.isSafeInteger(data.total) && data.total >= items.length ? data.total : items.length;
  return { items, total };
}

// What the list's row and the card's head say about a report: {id, kind: 'SERVICE'|'REVIEW'|'REPLY', tag:
// 'service report', by: who reported, reason (cut when long: the row, the heading and the aria-label use it),
// fullReason (all of it, for the card), heading, what, reported: the text as reported, quoted, or null}.
// null for something this tab doesn't list. A target the database no longer has (target: null) is named as
// deleted; the text as reported stays. A pro's review of a pet parent is named by who it is about and by whom.
export function reportRowText(item) {
  const info = reportKind(item);
  if (info === null) return null;
  const parts = targetParts(item.target);
  const { t, direction, author, pro, title, subject: about } = parts;
  const fullReason = reportReasonLabel(item.reason);
  const reason = shortReason(fullReason);
  let what;
  let subject;
  if (item.target_type === 'service') {
    subject = t === null ? 'A deleted service' : (title ?? 'Untitled service');
    what = [subject, pro].filter(Boolean).join(' · ');
  } else if (item.target_type === 'review') {
    if (t === null) {
      subject = 'A deleted review';
      what = subject;
    } else if (direction === 'pro_to_customer') {
      subject = `Review of ${about ?? formerMember}`;
      what = `A review of ${about ?? formerMember} by ${pro ?? 'the pro'}`;
    } else {
      subject = `Review by ${author ?? formerMember}`;
      what = [`By ${author ?? formerMember}`, pro].filter(Boolean).join(' · ');
    }
  } else {
    subject = t === null ? 'A deleted reply' : `Reply from ${pro ?? 'the pro'}`;
    what = t === null ? subject : `${pro ?? 'The pro'}, under ${possessive(author, 'a former member’s')} review`;
  }
  const text = trimmed(item.target_text);
  return {
    id: item.id,
    kind: info.kind,
    tag: info.tag,
    by: trimmed(item.reporter?.first_name) ?? 'Deleted account',
    reason,
    fullReason,
    heading: `${reason} · ${subject}`,
    what,
    reported: text === null ? null : `“${text}”`,
  };
}

// What the card calls a review: the pet parent who wrote it, or for a pro's review of a pet parent who it is
// about and by whom. 'A former member' when that account is gone.
export function reportReviewTitle(item) {
  const { direction, author, pro, subject } = targetParts(item?.target);
  return direction === 'pro_to_customer' && item.target_type === 'review'
    ? `A review of ${subject ?? formerMember} by ${pro ?? 'the pro'}`
    : author ?? 'A former member';
}

// "From Noor · no earlier reports": who reported, and how many reports on the same service, review or reply
// were filed before this one (earlier_reports). '' for something this tab doesn't list.
export function reportFromLine(item) {
  const text = reportRowText(item);
  if (text === null) return '';
  const n = Number.isInteger(item.earlier_reports) && item.earlier_reports > 0 ? item.earlier_reports : 0;
  const earlier = n === 0 ? 'no earlier reports' : n === 1 ? '1 earlier report' : `${n} earlier reports`;
  return `From ${text.by === 'Deleted account' ? 'a deleted account' : text.by} · ${earlier}`;
}

// How long a report has waited, in the words of the other tabs: {list: '2 days', card: 'Reported Wed 21 Oct,
// 14:10 · waiting 2 days'} (the time is Amsterdam's). The server sets created_at. null for a report that is
// handled, or whose time isn't a date.
export function reportWaiting(item, now = Date.now()) {
  if (reportKind(item) === null || isObject(item.handled)) return null;
  const iso = item.created_at;
  if (typeof iso !== 'string' || !Number.isFinite(Date.parse(iso))) return null;
  const long = waitedFor(iso, now);
  return { list: long, card: `Reported ${whenLabel(iso)} · waiting ${long}` };
}

// Whether the team has hidden the review and its reply, as {review, reply}: the real state of each part, whatever
// the report is about (the server sends both `hidden` and `reply_hidden` on a review's and on a reply's target).
// A flag that is missing or isn't `true` reads as not hidden, as does everything for a service or a target the
// database no longer has.
export function reportHidden(item) {
  const t = reportKind(item) !== null && item.target_type !== 'service' && isObject(item.target) ? item.target : null;
  return { review: t?.hidden === true, reply: t?.reply_hidden === true };
}

// The actions the team has on a report: a service gets dismiss and take down, a review dismiss and hide review
// (while the review isn't hidden), a reply dismiss and hide reply (while there is a reply that isn't hidden).
// The server refuses an action on a target that is gone or already in that state (not_eligible), so when the
// item says what the target is now (it has the `target` key) only dismiss is left for those; a row without the
// key says nothing about it and gets the target's own list. [] for a report that is handled, or that this tab
// doesn't take.
export function reportActions(item) {
  if (reportKind(item) === null || isObject(item.handled)) return [];
  const only = ['dismiss'];
  if (!Object.hasOwn(item, 'target')) {
    return ['dismiss', { service: 'take_down', review: 'hide_review', review_reply: 'hide_reply' }[item.target_type]];
  }
  const t = isObject(item.target) ? item.target : null;
  if (t === null) return only;
  switch (item.target_type) {
    case 'service':
      return typeof t.status !== 'string' || t.status === 'live' || t.status === 'paused' ? [...only, 'take_down'] : only;
    case 'review':
      return reportHidden(item).review ? only : [...only, 'hide_review'];
    default:
      return trimmed(t.reply) === null || reportHidden(item).reply ? only : [...only, 'hide_reply'];
  }
}

// Why only Dismiss is on offer for a report, or null when nothing is missing. A handled report says so.
export function reportTargetState(item) {
  const info = reportKind(item);
  if (info === null) return null;
  if (isObject(item.handled)) return 'This report was handled already.';
  if (!Object.hasOwn(item, 'target')) return null;
  const t = isObject(item.target) ? item.target : null;
  const only = 'so the report can only be dismissed.';
  if (t === null) return `This ${info.noun} has been deleted, ${only}`;
  if (item.target_type === 'service') {
    if (t.status === 'removed') return `This service is removed already, ${only}`;
    if (typeof t.status === 'string' && t.status !== 'live' && t.status !== 'paused') {
      return `This service is ${t.status}, so it can’t be taken down. The report can only be dismissed.`;
    }
  } else if (item.target_type === 'review') {
    if (reportHidden(item).review) return `This review is hidden already, ${only}`;
  } else {
    if (trimmed(t.reply) === null) return `This review has no reply any more, ${only}`;
    if (reportHidden(item).reply) return `This reply is hidden already, ${only}`;
  }
  return null;
}

const REPORT_ACTION_LABELS = {
  dismiss: 'Dismiss', take_down: 'Take the service down', hide_review: 'Hide review', hide_reply: 'Hide reply',
};

// The button's words ('' for an action this tab doesn't have).
export function reportActionLabel(action) {
  return typeof action === 'string' && Object.hasOwn(REPORT_ACTION_LABELS, action) ? REPORT_ACTION_LABELS[action] : '';
}

// Under a take-down's reason, and in its question. The pro reads the reason on the service in the app
// (removed_reason). The notification that goes with it is made only when the pro's settings allow it (migration
// 120's admin_set_service_status checks them, and the push follows the same settings), so the words don't
// promise one.
export const TAKE_DOWN_NOTIFIED = 'The pro sees your reason on the service in the app, and gets a notification unless they turned those off.';

// The sentence beside an action's button: R11's, with this report's names. Hiding a review says where it
// leaves, by the review's direction: the service page and the pro's rating for a pet parent's review of a pro,
// the pet parent's rating (which pros see) for a pro's review of a pet parent. With no direction it names none.
export function reportActionHint(item, action) {
  if (reportKind(item) === null) return '';
  const { t, direction, author, pro, subject } = targetParts(item.target);
  switch (action) {
    case 'dismiss':
      if (item.target_type !== 'service') return 'Nothing changes. Needs the note.';
      return t?.status === 'live' || t?.status === 'paused'
        ? `Closes the report. The service stays ${t.status} and nobody is notified.`
        : 'Closes the report. Nobody is notified.';
    case 'take_down':
      return 'Sets it to Removed: pet parents can’t find or book it. Bookings already made go ahead.';
    case 'hide_review':
      if (direction === 'pro_to_customer') {
        return `Gone from ${possessive(subject, 'a former member’s')} rating, which pros see. It is not on any service page. Needs the note.`;
      }
      if (direction === null) return 'Hidden wherever it is shown. Needs the note.';
      return `Gone from the service page and from ${possessive(pro, 'the pro’s')} rating. ${author ? `${author} still sees it, marked hidden. ` : ''}Needs the note.`;
    case 'hide_reply':
      return 'Hides only the reply; the review stays. Only on a reply report. Needs the note.';
    default:
      return '';
  }
}

// 5 to 1000 characters once trimmed, counted the way Postgres counts (characters, not UTF-16 units), as
// validateNote does; `subject` names the text in the sentence.
function textProblem(text, subject) {
  const length = typeof text === 'string' ? [...text.trim()].length : 0;
  if (length < NOTE_MIN) return `${subject} is required: write at least ${NOTE_MIN} characters.`;
  if (length > NOTE_MAX) return `${subject} can be at most ${NOTE_MAX} characters.`;
  return null;
}

// What is wrong with an action and its texts, or null when they can be sent: {field: 'action'|'note'|'reason',
// text: the sentence}. Every action needs the note (the team's own, saved with the decision). A take-down
// needs a second text, the reason the pro reads; no other action looks at one. The note is checked first.
export function handlingProblem(item, action, note, reason) {
  if (!reportActions(item).includes(action)) return { field: 'action', text: 'That action isn’t available for this report.' };
  const noteProblem = textProblem(note, 'The note');
  if (noteProblem !== null) return { field: 'note', text: noteProblem };
  const reasonProblem = action === 'take_down' ? textProblem(reason, 'The reason for the pro') : null;
  return reasonProblem === null ? null : { field: 'reason', text: reasonProblem };
}

// null when `action` with these texts can be sent for this report, else the sentence to show.
export function validateHandling(item, action, note, reason) {
  return handlingProblem(item, action, note, reason)?.text ?? null;
}

// The arguments of admin_handle_report: the report, the action, the note trimmed, and the reason the pro reads
// (trimmed, for a take-down; null for every other action, which the server refuses a reason for). null when
// validateHandling would refuse it: then nothing may be sent.
export function handleArgs(item, action, note, reason) {
  if (validateHandling(item, action, note, reason) !== null) return null;
  return {
    p_report_id: item.id, p_action: action, p_note: note.trim(), p_reason: action === 'take_down' ? reason.trim() : null,
  };
}

// The other open reports the server closes with this one: it handles every open report on the same target, the
// same type (a review's reports and its reply's are two targets) on the same service, review or reply. Found in
// `rows`, the reports loaded, so a list that was cut may leave some out. [] when this report has no target left
// (the server groups nothing then) or nothing else matches.
export function otherOpenReports(item, rows) {
  const target = reportKind(item) !== null && isObject(item.target) ? trimmed(item.target.id) : null;
  if (target === null || !Array.isArray(rows)) return [];
  return rows.filter((other) => reportKind(other) !== null && other.id !== item.id && !isObject(other.handled)
    && other.target_type === item.target_type && isObject(other.target) && trimmed(other.target.id) === target);
}

// What else the action closes, for the question before it: how many other open reports on this service, review
// or reply, and which ones (the reason and who reported). `open` is {rows, total}: the reports loaded and how
// many are open in all. With more open than loaded the count is "at least". '' when there is no target, or no
// other report to name and no more to find.
function closedWithText(item, action, open) {
  if (!isObject(item.target)) return '';
  const rows = Array.isArray(open?.rows) ? open.rows : [];
  const cut = Number.isSafeInteger(open?.total) && open.total > rows.length;
  const others = otherOpenReports(item, rows);
  const noun = REPORT_KINDS[item.target_type].noun;
  if (others.length === 0) return cut ? `Any other open report on this ${noun} that isn’t loaded here is closed with it too.` : '';
  const names = others.map((other) => {
    const text = reportRowText(other);
    return `${text.reason} (${text.by === 'Deleted account' ? 'a deleted account' : text.by})`;
  });
  const count = `${cut ? 'at least ' : ''}${others.length === 1 ? '1 other open report' : `${others.length} other open reports`}`;
  return `This also ${action === 'dismiss' ? 'dismisses' : 'closes'} ${count} on this ${noun}: ${names.join(', ')}. They are saved with your note.`;
}

const sentences = (...parts) => parts.filter(Boolean).join(' ');

// The question before an action is sent: what happens, to whom, and which other open reports go with it (see
// closedWithText; `open` is {rows, total}). `reason` is the take-down's reason for the pro, which it quotes.
// '' for an action this report doesn't offer.
export function handleConfirmText(item, action, reason, open) {
  if (!reportActions(item).includes(action)) return '';
  const parts = targetParts(item.target);
  const { t, direction, author, pro, title, subject } = parts;
  const theirs = possessive(pro, 'the pro’s');
  const authors = possessive(author, 'a former member’s');
  const closes = closedWithText(item, action, open);
  switch (action) {
    case 'take_down':
      return sentences(
        `Take down ${serviceName(title)}${pro ? ` (${pro})` : ''}? It is set to Removed: pet parents can’t find or book it, and bookings already made go ahead.`,
        `${TAKE_DOWN_NOTIFIED} It reads: “${typeof reason === 'string' ? reason.trim() : ''}”`,
        closes);
    case 'hide_review': {
      // Where it leaves: by the review's direction. A reply under it goes with it.
      const leaves = direction === 'pro_to_customer'
        ? `It disappears from ${possessive(subject, 'a former member’s')} rating, which pros see. It is not on any service page.`
        : direction === null
          ? 'It is hidden wherever it is shown.'
          : sentences(`It disappears from the service page and from ${theirs} rating.`, author && `${author} still sees it, marked hidden.`);
      return sentences(`Hide the ${reviewPhrase(parts)}?`, leaves, trimmed(t?.reply) !== null && 'The reply under it goes with it.', 'Nobody is notified.', closes);
    }
    case 'hide_reply':
      return sentences(`Hide ${theirs} reply under ${authors} review? Only the reply is hidden; the review stays.`, 'Nobody is notified.', closes);
    default: {
      const subjectOf = item.target_type === 'service' ? serviceName(title)
        : item.target_type === 'review' ? `the ${reviewPhrase(parts)}`
          : `${theirs} reply under ${authors} review`;
      const nothing = t?.status === 'live' || t?.status === 'paused'
        ? `Nothing changes: the service stays ${t.status} and nobody is notified.`
        : 'Nothing changes and nobody is notified.';
      return sentences(`Dismiss this report about ${subjectOf}?`, nothing, closes);
    }
  }
}

const HANDLED_ACTIONS = {
  dismiss: 'dismissed', take_down: 'service_removed', hide_review: 'review_hidden', hide_reply: 'reply_hidden',
};

// The banner after an action, worked out from what the database answered ({report, handled_count}), not from
// what was sent: only an answer that is this report, handled in the way that was asked, and (for a take-down
// and the hides) shows the target in the state the action leaves it in. null otherwise: then the page
// must not claim anything. Others closed with it, on the same target, are counted. A hidden review says whose
// rating it left when it is a pro's review of a pet parent.
export function handledText(answer, item, action) {
  const info = reportKind(item);
  if (info === null || typeof action !== 'string' || !Object.hasOwn(HANDLED_ACTIONS, action) || !isObject(answer)) return null;
  const report = answer.report;
  const done = isObject(report) ? report.handled : null;
  if (!isObject(done) || report.id !== item.id) return null;
  if (done.action !== HANDLED_ACTIONS[action]) return null;
  if (typeof done.at !== 'string' || !Number.isFinite(Date.parse(done.at))) return null;
  const parts = targetParts(report.target);
  const { t, direction, author, pro, title, subject } = parts;
  const hidden = reportHidden(report);
  if (action === 'take_down' && t?.status !== 'removed') return null;
  if ((action === 'hide_review' && !hidden.review) || (action === 'hide_reply' && !hidden.reply)) return null;

  const said = {
    dismiss: 'Report dismissed. Nothing changed.',
    take_down: `${title ? `“${title}”` : 'The service'} is taken down: it is now Removed.`,
    hide_review: direction === 'pro_to_customer'
      ? `The ${reviewPhrase(parts)} is hidden: it is out of ${possessive(subject, 'a former member’s')} rating.`
      : `The review by ${author ?? formerMember} is hidden.`,
    hide_reply: `${possessive(pro, 'The pro’s')} reply is hidden. The review stays.`,
  }[action];
  const others = Number.isInteger(answer.handled_count) ? answer.handled_count - 1 : 0;
  if (others < 1) return said;
  return `${said} ${others === 1 ? '1 other report' : `${others} other reports`} on the same ${info.noun} ${others === 1 ? 'was' : 'were'} closed with it.`;
}

// A refusal that says the state moved on under the reviewer (22023 not_eligible: handled already, the target
// gone or already hidden or removed). The page reloads the list for it.
export function handleRefusalIsStale(error) {
  return isObject(error) && (error.hint === 'not_eligible' || /not_eligible/.test(trimmed(error.message) ?? ''));
}

// A failed action in words. The database's own reason is shown as it is; any other failure may or may not
// have gone through. A stale refusal doesn't say the list was reloaded: the page says so (reportNoticeShown),
// once it has.
export function handleErrorText(error) {
  const message = trimmed(error?.message);
  if (error?.code === '42501' || /Admins only/.test(message ?? '')) return 'Couldn’t save: this account isn’t an admin.';
  if (handleRefusalIsStale(error)) {
    return `Couldn’t save: the server refused it (${message ?? 'not_eligible'}). Someone may have handled this report already, or what it is about has changed.`;
  }
  if (error?.hint === 'invalid_input' || /invalid_input/.test(message ?? '')) {
    return `Couldn’t save: the server refused it (${message ?? 'invalid_input'}).`;
  }
  return `Couldn’t save: ${message ?? 'unknown error'}. Refresh the list to see whether it went through.`;
}

export const LIST_RELOADED = 'The list was reloaded; check the report before trying again.';

// When the server answers an action without confirming it (not the report that was sent, not in the state the
// action leaves it in): the page claims nothing, and says so.
export const NOT_CONFIRMED = 'The server’s answer didn’t confirm the change.';

// The notice above the list after an action, {kind: 'ok'|'warn'|'bad', text, reloads?: true}, as it is
// shown: with `reloads` it adds that the list was reloaded. When the list could not be loaded again
// (`reloadError` is the reason), the notice stays, so a reviewer who has just been told "done" doesn't do it
// twice, and says the page may be out of date; a green notice turns amber for it. null for something that isn't
// a notice.
export function reportNoticeShown(notice, reloadError) {
  if (!isObject(notice) || typeof notice.text !== 'string') return null;
  const kind = ['ok', 'warn', 'bad'].includes(notice.kind) ? notice.kind : 'warn';
  if (reloadError === null || reloadError === undefined) {
    return { kind, text: notice.reloads === true ? `${notice.text} ${LIST_RELOADED}` : notice.text };
  }
  const why = trimmed(reloadError) ?? 'unknown error';
  return {
    kind: kind === 'ok' ? 'warn' : kind,
    text: `${notice.text} Couldn’t reload the list (${why}), so what is on screen may be out of date: refresh it before you handle another report.`,
  };
}

// ---- One request per case ------------------------------------------------------

// Tracks which cases have a request on its way, so none is sent twice and an
// answer that is no longer expected is ignored. start() gives a token, or null
// when the case already has a request open (or `id` isn't a booking id); the
// answer comes back through finish(id, token), which is true only for the
// request that is open, once. reset() (sign-out) makes every answer still on
// its way stale.
export function createRequestTracker() {
  const open = new Map(); // booking id -> token of the request on its way
  let last = 0;
  return {
    start(id) {
      if (typeof id !== 'string' || id === '' || open.has(id)) return null;
      open.set(id, ++last);
      return last;
    },
    isBusy: (id) => open.has(id),
    finish(id, token) {
      if (token === undefined || open.get(id) !== token) return false;
      open.delete(id);
      return true;
    },
    reset: () => open.clear(),
  };
}
