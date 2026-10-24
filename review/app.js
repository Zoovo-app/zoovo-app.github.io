import { supabaseClient } from '/assets/supabase.js';
import {
  CASE_CHANGED, PRO_SORTS, allowedDecisions, asCaseRow, attentionLabel, bookingWhen, canCheckTransfer,
  canRequeue, cancelRate, cancellationRows, cancellationText, caseItems, centsToInput, chatLines,
  checkTransferConfirmText, confirmText, createRequestTracker, decisionArgs, decisionButtonLabel,
  decisionNoticeText, decisionPreview, durationLabel, failedJobs, formatEuro, isOpenCase, keepWaiting,
  kvkUrl, markHandledArgs, markHandledConfirmText, markHandledErrorText, markedHandledText,
  methodLabel, moneyFlags, openProblems, parseEuroToCents, paymentHealth, paymentStatusLabel,
  problemDetails, proSubline, reasonCounts, recordRefundConfirmText, recordedText, refundRows,
  refundableCents, requeueConfirmText, requeueableRefunds, requeuedText, retryConfirmText, retryLabel,
  reverseConfirmText, reverseLabel, saveErrorText, savedText, sortPros, stateText, strayPaymentNotes,
  strayPayments, stripeTypeNote, suggestedRefund, transferLabel, validateDecision, validateNote,
  verificationBadges, waitedFor, waitingTexts, whenLabel,
  TAKE_DOWN_NOTIFIED, handleArgs, handleConfirmText, handleErrorText, handleRefusalIsStale, handledText,
  reportActionHint, reportActionLabel, reportActions, reportFromLine, reportList, reportRowText,
  reportHidden, reportNoticeShown, reportTargetState, reportWaiting, validateHandling,
} from '/review/lib.js';

// Applicants choose their avatar URL (the database only checks for https), so
// only images from our own public buckets are loaded here; anything else would
// reveal the reviewer's IP and browser to a host the applicant runs. The app
// saves pro-media photos; avatars covers applications sent before it copied
// the personal photo there.
const STORAGE_PUBLIC = 'https://bzoaterrltmuqedpikjv.supabase.co/storage/v1/object/public/';
const AVATAR_PREFIXES = [`${STORAGE_PUBLIC}pro-media/`, `${STORAGE_PUBLIC}avatars/`];

// <pure> Helpers that never touch the page, so they can be checked with node.
// Service media follows the same rule as avatars: a URL is built only for a
// path of exactly the shape the app uploads (<uid>/<service>/<version>/<file>);
// anything else, "../" included, is not rendered.
const MEDIA_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(photo|video|poster)_[0-9]+_[0-9a-f]{8}\.(jpg|jpeg|png|webp|mp4|mov|m4v)$/;

function serviceMediaUrl(path) {
  return typeof path === 'string' && MEDIA_PATH.test(path)
    ? `${STORAGE_PUBLIC}service-media/${path}`
    : null;
}

// The fields of a service version the team compares, in display order.
const COMPARED = [
  'title', 'category', 'other_category_label', 'description', 'whats_included',
  'experience_note', 'media', 'price_unit', 'base_price_cents', 'size_prices',
  'extra_pet_price_cents', 'weekend_surcharge_pct', 'holiday_surcharge_pct',
  'custom_quote', 'duration_minutes', 'location_mode', 'service_radius_km', 'address_label',
  'requirements', 'extra_requirements', 'cancellation_policy',
];

// Same value, same shape, same key order: missing, null and '' are all "not
// set", and requirements (a set) are sorted, so JSON.stringify can compare.
function normaliseVersion(v) {
  const x = v && typeof v === 'object' ? v : {};
  const text = (s) => (typeof s === 'string' && s !== '' ? s : null);
  const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
  const strings = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === 'string') : []);
  const sizes = x.size_prices && typeof x.size_prices === 'object'
    ? { small: num(x.size_prices.small), medium: num(x.size_prices.medium), large: num(x.size_prices.large) }
    : null;
  return {
    title: text(x.title),
    category: text(x.category),
    other_category_label: text(x.other_category_label),
    description: text(x.description),
    whats_included: strings(x.whats_included),
    experience_note: text(x.experience_note),
    media: (Array.isArray(x.media) ? x.media : [])
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({ type: text(m.type), path: text(m.path), poster_path: text(m.poster_path) })),
    price_unit: text(x.price_unit),
    base_price_cents: num(x.base_price_cents),
    size_prices: sizes && (sizes.small !== null || sizes.medium !== null || sizes.large !== null) ? sizes : null,
    extra_pet_price_cents: num(x.extra_pet_price_cents),
    weekend_surcharge_pct: num(x.weekend_surcharge_pct),
    holiday_surcharge_pct: num(x.holiday_surcharge_pct),
    custom_quote: x.custom_quote === true,
    duration_minutes: num(x.duration_minutes),
    location_mode: text(x.location_mode),
    service_radius_km: num(x.service_radius_km),
    address_label: text(x.address_label),
    requirements: strings(x.requirements).sort(),
    extra_requirements: text(x.extra_requirements),
    cancellation_policy: text(x.cancellation_policy),
  };
}

// The compared fields that differ between two versions (live may be null).
function changedFields(live, version) {
  const a = normaliseVersion(live);
  const b = normaliseVersion(version);
  return COMPARED.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

const FIELD_GROUP = {
  title: 'title', category: 'category', other_category_label: 'category',
  description: 'description', whats_included: "what's included", experience_note: 'experience note',
  price_unit: 'price', base_price_cents: 'price', size_prices: 'price',
  extra_pet_price_cents: 'price', weekend_surcharge_pct: 'price',
  holiday_surcharge_pct: 'price', custom_quote: 'price', duration_minutes: 'duration',
  location_mode: 'location', service_radius_km: 'location', address_label: 'location',
  requirements: 'requirements', extra_requirements: 'requirements',
  cancellation_policy: 'cancellation policy',
};

// "2 new photos", "1 video removed", … for the media of an edit.
function mediaLabels(live, version) {
  const a = normaliseVersion(live).media;
  const b = normaliseVersion(version).media;
  const had = new Set(a.map((m) => m.path));
  const has = new Set(b.map((m) => m.path));
  const added = b.filter((m) => !had.has(m.path));
  const removed = a.filter((m) => !has.has(m.path));
  const count = (list, video) => list.filter((m) => (m.type === 'video') === video).length;
  const n = (k, noun) => `${k} ${noun}${k === 1 ? '' : 's'}`;
  const out = [];
  if (count(added, false)) out.push(n(count(added, false), 'new photo'));
  if (count(added, true)) out.push(n(count(added, true), 'new video'));
  if (count(removed, false)) out.push(`${n(count(removed, false), 'photo')} removed`);
  if (count(removed, true)) out.push(`${n(count(removed, true), 'video')} removed`);
  return out.length ? out : ['photos and videos'];
}

// The words behind "Changed: …" for an edit; empty when nothing visible changed.
function changeLabels(live, version) {
  const labels = [];
  for (const field of changedFields(live, version)) {
    for (const label of field === 'media' ? mediaLabels(live, version) : [FIELD_GROUP[field]]) {
      if (!labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

// Splits `text` into [unchanged start, changed middle, unchanged end] against
// `old`, never cutting an emoji in half. old === undefined: nothing to compare.
function splitChange(text, old) {
  if (old === undefined || old === text) return [text, '', ''];
  if (old === null || old === '') return ['', text, ''];
  const max = Math.min(text.length, old.length);
  let start = 0;
  while (start < max && text[start] === old[start]) start++;
  let end = 0;
  while (end < max - start && text[text.length - 1 - end] === old[old.length - 1 - end]) end++;
  if (start > 0 && (text.charCodeAt(start - 1) & 0xfc00) === 0xd800) start--;
  if (end > 0 && (text.charCodeAt(text.length - end) & 0xfc00) === 0xdc00) end--;
  return [text.slice(0, start), text.slice(start, text.length - end), text.slice(text.length - end)];
}

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

// One line per day that has opening times: "Mon 09:00–12:00, 13:00–17:00".
function weeklyHoursLines(weekly) {
  const lines = [];
  for (const [key, label] of DAYS) {
    const slots = (Array.isArray(weekly?.[key]) ? weekly[key] : []).filter((s) =>
      Array.isArray(s) && s.length === 2 && s.every((t) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t)));
    if (slots.length) lines.push(`${label} ${slots.map(([from, to]) => `${from}–${to}`).join(', ')}`);
  }
  return lines;
}

// A rejection reason is the preset followed by the note; "Other" is only a
// way to write the note alone.
function joinReason(preset, note) {
  const parts = [preset && preset !== 'Other' ? preset : '', (note ?? '').trim()].filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${/[.!?]$/.test(parts[0]) ? parts[0] : `${parts[0]}.`} ${parts[1]}`;
}

// How long the note may be next to a preset. The server cuts a reason at 1000
// characters, and joinReason puts the preset, a full stop and a space in front
// of the note; without a preset (or with "Other") the note stands alone.
function noteLimit(preset) {
  return preset && preset !== 'Other' ? Math.max(0, 1000 - (preset.length + 2)) : 1000;
}

const STATUS_LABELS = { live: 'live', paused: 'paused', removed: 'offline' };

// The tag on an edit card, by the status of the service the edit is for.
function editTagText(status) {
  const label = STATUS_LABELS[status];
  if (!label) return 'edit to a service';
  return `edit to ${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label} service`;
}

// "Taken offline by Ann on 20 Oct 2026" from the service's reviewed_by (a
// name) and reviewed_at. Whichever of the two is missing is left out; null when
// both are.
function offlineNote(name, at) {
  const who = typeof name === 'string' ? name.trim() : '';
  const date = typeof at === 'string' ? new Date(at) : null;
  const when = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  if (!who && !when) return null;
  return `Taken offline${who ? ` by ${who}` : ''}${when ? ` on ${when}` : ''}`;
}

// admin_service_queue_counts as one whole number per queue; a queue the answer
// lacks, or has anything else for, is null (unknown).
function queueCounts(data) {
  const out = {};
  for (const key of ['new', 'edits', 'live']) {
    const n = data?.[key];
    out[key] = Number.isInteger(n) && n >= 0 ? n : null;
  }
  return out;
}

const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];

// What an edit drops from the live version (both arguments come from
// normaliseVersion). A price part counts as dropped when the edit no longer has
// it at all, not when its value changed; the wording is the price row's.
function removedPriceParts(live, version) {
  const parts = (n) => {
    const out = [];
    if (n.custom_quote) out.push(['quote', 'Custom quote (price on request)']);
    for (const [key, label] of SIZES) {
      const cents = n.size_prices?.[key];
      if (typeof cents === 'number') out.push([`size_${key}`, `${label} ${formatEuro(cents)}`]);
    }
    if (n.base_price_cents !== null) {
      out.push(['base', `${n.size_prices ? 'Base ' : ''}${formatEuro(n.base_price_cents)}`]);
    }
    if (n.extra_pet_price_cents !== null) out.push(['extra_pet', `Extra pet +${formatEuro(n.extra_pet_price_cents)}`]);
    if (n.weekend_surcharge_pct !== null) out.push(['weekend', `Weekends +${n.weekend_surcharge_pct}%`]);
    if (n.holiday_surcharge_pct !== null) out.push(['holiday', `Holidays +${n.holiday_surcharge_pct}%`]);
    return out;
  };
  const kept = new Set(parts(version).map(([id]) => id));
  return parts(live).filter(([id]) => !kept.has(id)).map(([, text]) => text);
}

// Included items the edit no longer lists.
function removedItems(live, version) {
  const kept = new Set(version.whats_included);
  return live.whats_included.filter((item) => !kept.has(item));
}

// Files the edit no longer holds, named by their place in the LIVE NOW strip
// ("Photo 3", "Video 4").
function removedMedia(live, version) {
  const kept = new Set(version.media.map((m) => m.path));
  return live.media.flatMap((m, i) => (kept.has(m.path) ? [] : [
    `${m.type === 'video' ? 'Video' : m.type === 'photo' ? 'Photo' : 'File'} ${i + 1}`,
  ]));
}
// </pure>

const sb = supabaseClient({ persistSession: true });
const $ = (id) => document.getElementById(id);

const FILTERS = [
  ['pending', 'Waiting for review'], ['rejected', 'Rejected'],
  ['approved', 'Approved'], ['suspended', 'Suspended'], ['all', 'All'],
];
const CATEGORIES = {
  pet_sitting: 'Pet Sitting', dog_walking: 'Dog Walking', doggy_day_care: 'Doggy Day Care',
  boarding: 'Boarding', grooming: 'Grooming', pet_taxi: 'Pet Taxi', pet_training: 'Pet Training',
  puppy_visits: 'Puppy Visits', cat_sitting: 'Cat Sitting', other: 'Other',
};
const REASONS = [
  "Your profile photo doesn't clearly show your face.",
  'Some contact details are missing or incorrect.',
  'Your biography is too short or unclear.',
  "We couldn't verify your experience or documents.",
];
const TABS = [
  ['apps', 'Applications'], ['new', 'New services'], ['edits', 'Edits'], ['live', 'Live services'],
  ['problems', 'Problems'], ['reports', 'Reports'], ['pros', 'Pros'],
];
const SERVICE_REASONS = [
  'Photos are not your own work', 'Price or description is unclear',
  'Not an allowed service', 'Other',
];
let activeTab = 'apps';
let filter = 'pending';
let rows = [];
let prosSort = PRO_SORTS[0][0]; // the Pros tab's order
const expandedPros = new Set(); // ids of the pros whose cancellation reasons are open
// The sort control and the table exist only after a successful load, so a
// setup or error message is never drawn over.
let prosLoaded = false;
// A pro's cancellations, fetched once when the row is first opened and kept
// until the next load: pro id -> {status: 'loading'|'ok'|'error', rows, message}.
const cancellations = new Map();
const cancellationSlots = new Map(); // pro id -> the element on screen that shows them
// Set once the API says admin_pro_cancellations doesn't exist: the opened row
// then shows only the reason counts.
let cancellationsMissing = false;
const CANCELLATIONS_LIMIT = 20;
// Problems: the case open below the list (a booking id); the cases with a
// request on its way (nothing may be sent for them again, and an answer that
// isn't expected is ignored); the cases the database answered for since the
// last load, {kind: 'decision'|'reversal'|'retry', decision, ids} by booking id;
// answers that came in while the list was being loaded again; and what the
// reviewer has typed per case (note and amount), kept until that case is saved.
let selectedCase = null;
const requests = createRequestTracker();
const savedCases = new Map();
const overlays = new Map(); // booking id -> {row, meta, seq}: seq is the load it waits for
const drafts = new Map(); // booking id -> {note, amount}
const caseChats = new Map(); // booking id -> {status: 'loading'|'ok'|'error'|'missing', open, rows, message}
const CHAT_LIMIT = 100;
// The Payment health section under the cases (admin_payment_health), fetched
// with each load of the tab: {status: 'loading'|'ok'|'error'|'missing', health, message}.
let health = null;
const HEALTH_LIMIT = 20;
// Marking a payment handled (admin_mark_payment_handled), per event id: what the reviewer has typed and how it
// stands, {open, note, error, focus}, kept across the redraws of the Payment health card. Its request is tracked
// by `requests` (so none is sent twice, and an answer after sign-out is ignored); payPainters redraw a row.
const handling = new Map();
const payPainters = new Map(); // event id -> redraws that payment's row on screen
// The outcome of the last marking, at the top of the Payment health card until the tab is loaded again.
let healthNotice = null;
// A message above the list that must survive the reload an action triggers.
let problemNotice = null;
let keepNotice = false;
// Reports: the report open below the list (a report id); how many are open in all (the list is cut at
// REPORTS_LIMIT); what the reviewer has typed per report ({note, reason, error}), kept until that report is
// handled; and the outcome of the last action, above the list until the tab is loaded again. A report's request
// is tracked by `requests` too (by its id), so none is sent twice.
let selectedReport = null;
let reportTotal = 0;
let reportNotice = null;
const reportDrafts = new Map();
const REPORTS_LIMIT = 200;
let counts = {}; // tab -> number waiting; unset or null while unknown
// Tabs whose number is the true count (from the last answer of
// admin_service_queue_counts). The others come from a list, which stops at 200
// rows, so 200 there means "200 or more".
let exact = new Set();
// Set once the API says admin_service_queue_counts doesn't exist (migration
// 102 older than that function): the counts then come from the lists.
let countsRpcMissing = false;

function show(section) {
  for (const id of ['signin', 'notAdmin', 'setup', 'loadError', 'dash']) $(id).hidden = id !== section;
  $('signout').hidden = section === 'signin';
}

// Every value below comes from applicants: build nodes with textContent,
// never innerHTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

const waited = (iso) => waitedFor(iso, Date.now());

async function route() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('signin');
  const { data: isAdmin, error } = await sb.rpc('is_app_admin');
  if (error) {
    $('loadErrorText').textContent = `Couldn't check access: ${error.message}`;
    return show('loadError');
  }
  if (!isAdmin) {
    $('grantSql').textContent = `insert into public.app_admins (user_id)\nvalues ('${session.user.id}');`;
    return show('notAdmin');
  }
  show('dash');
  await load();
}

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  prosLoaded = false;
  if (!keepNotice) {
    problemNotice = null;
    reportNotice = null;
  }
  keepNotice = false;
  healthNotice = null;
  savedCases.clear();
  renderTabs();
  renderFilters();
  $('listMsg').textContent = 'Loading…';
  $('list').replaceChildren();
  loadCounts(seq);
  if (activeTab === 'apps') await loadApplications(seq);
  else if (activeTab === 'pros') await loadPros(seq);
  else if (activeTab === 'problems') await loadProblems(seq);
  else if (activeTab === 'reports') await loadReports(seq);
  else await loadServices(seq);
}

async function loadApplications(seq) {
  const { data, error } = await sb.rpc('admin_list_pro_applications', { p_status: filter });
  if (seq !== loadSeq) return; // a newer load() has taken over
  // PGRST202: the API can't find the function, i.e. 100 isn't live yet.
  if (error?.code === 'PGRST202') return show('setup');
  if (error) {
    $('listMsg').textContent = `Couldn't load applications: ${error.message}`;
    return;
  }
  rows = data ?? [];
  if (filter === 'pending') counts.apps = rows.length;
  renderTabs();
  renderList();
}

async function loadServices(seq) {
  const { data, error } = await sb.rpc('admin_list_service_queue', { p_queue: activeTab });
  if (seq !== loadSeq) return;
  if (error) {
    if (!exact.has(activeTab)) counts[activeTab] = null; // unknown, not the old number
    renderTabs();
    // The applications work without 101 and 102, so only this tab says so.
    $('listMsg').textContent = error.code === 'PGRST202'
      ? "The services review database isn't set up yet. Apply migrations 101 and 102 from the Zoovo-app/zoovo-app repo, then reload this page."
      : `Couldn't load services: ${error.message}`;
    return;
  }
  rows = data ?? [];
  if (!exact.has(activeTab)) counts[activeTab] = rows.length;
  renderTabs();
  renderList();
}

async function loadPros(seq) {
  rows = []; // the sort control must never redraw another tab's rows
  cancellations.clear();
  cancellationSlots.clear();
  const { data, error } = await sb.rpc('admin_list_pros');
  if (seq !== loadSeq) return;
  if (error) {
    // Like the services: the other tabs work without it, so only this one says so.
    $('listMsg').textContent = error.code === 'PGRST202'
      ? "The pros overview isn't set up yet. Apply migrations 109 to 116 from the Zoovo-app/zoovo-app repo, then reload this page."
      : `Couldn't load pros: ${error.message}`;
    return;
  }
  rows = data ?? [];
  prosLoaded = true;
  renderFilters(); // the sort control appears now
  renderList();
}

async function loadProblems(seq) {
  rows = []; // the list must never show another tab's rows
  caseChats.clear();
  chatPainters.clear();
  loadHealth(seq); // drawn under the cases; it never holds them up
  const { data, error } = await sb.rpc('admin_list_problem_cases', { p_filter: 'open' });
  if (seq !== loadSeq) return;
  if (error) {
    counts.problems = null; // unknown, not the old number
    renderTabs();
    // Like the pros: the other tabs work without it, so only this one says so.
    $('listMsg').textContent = error.code === 'PGRST202'
      ? "The problems view isn't set up yet. Apply migrations 109 to 116 from the Zoovo-app/zoovo-app repo, then reload this page."
      : `Couldn't load problems: ${error.message}`;
    return;
  }
  rows = Array.isArray(data) ? data : [];
  // An answer that came in while this list was on its way is newer than what
  // the list says about that case (the list may have been read before the save).
  rows = rows.map((r) => {
    const late = overlays.get(caseId(r));
    if (!late || late.seq !== seq) return r;
    savedCases.set(caseId(r), late.meta);
    return keepWaiting(late.row, r); // the answer has no waiting_since; this list's row has
  });
  overlays.clear();
  for (const id of [...drafts.keys()]) if (!rows.some((r) => caseId(r) === id)) drafts.delete(id); // cases that are gone
  counts.problems = openCount(); // the open list is the count
  renderTabs();
  renderList();
}

// The open reports about services, reviews and replies, oldest first (admin_list_reports).
async function loadReports(seq) {
  rows = []; // the list must never show another tab's rows
  reportTotal = 0;
  let answer;
  try {
    answer = await sb.rpc('admin_list_reports', { p_status: 'open', p_limit: REPORTS_LIMIT, p_offset: 0 });
  } catch (e) {
    answer = { data: null, error: { message: e?.message ?? 'network error' } };
  }
  if (seq !== loadSeq) return; // a newer load() has taken over
  const { data, error } = answer;
  const parsed = error ? null : reportList(data);
  if (!parsed) {
    counts.reports = null; // unknown, not the old number
    exact.delete('reports');
    renderTabs();
    // Like the pros and the problems: the other tabs work without it, so only this one says so.
    $('listMsg').textContent = error?.code === 'PGRST202'
      ? "The reports view isn't set up yet. Apply migrations 117 to 122 from the Zoovo-app/zoovo-app repo, then reload this page."
      : error ? `Couldn't load reports: ${error.message}` : "Couldn't load reports: the answer isn't a report list.";
    // An action has just been answered and the list can't be loaded again: its notice stays, so the reviewer
    // doesn't do it twice.
    const kept = reportNotice ? reportNoticeShown(reportNotice, error?.message ?? 'the answer isn’t a report list') : null;
    $('list').replaceChildren(...(kept ? [notice(kept.kind, kept.text)] : []));
    return;
  }
  rows = parsed.items;
  reportTotal = parsed.total;
  for (const id of [...reportDrafts.keys()]) if (!rows.some((r) => r.id === id)) reportDrafts.delete(id); // reports that are gone
  counts.reports = parsed.total; // the true count, not the length of a list that stops at REPORTS_LIMIT
  exact.add('reports');
  renderTabs();
  renderList();
}

// admin_payment_health: what needs the team but has no case on this tab.
async function loadHealth(seq) {
  health = { status: 'loading' };
  let answer;
  try {
    answer = await sb.rpc('admin_payment_health', { p_limit: HEALTH_LIMIT });
  } catch (e) {
    answer = { data: null, error: { message: e?.message ?? 'network error' } };
  }
  if (seq !== loadSeq) return; // a newer load() has taken over
  const { data, error } = answer;
  const parsed = error ? null : paymentHealth(data);
  health = error?.code === 'PGRST202' ? { status: 'missing' }
    : error ? { status: 'error', message: error.message }
      : parsed ? { status: 'ok', health: parsed }
        : { status: 'error', message: 'the answer isn’t a payment health list' };
  // What was typed for a payment that is no longer listed (handled, or a booking holds it now) is dropped.
  if (parsed) for (const id of [...handling.keys()]) if (!requests.isBusy(id) && !parsed.payments.some((p) => p.eventId === id)) handling.delete(id);
  repaintHealth(); // once the cases are drawn
}

// The counts on the tabs. Each answer is dropped if a newer load() has started
// (or the reviewer signed out) in the meantime.
async function loadCounts(seq) {
  await Promise.all([loadApplicationCount(seq), loadServiceCounts(seq), loadProblemCount(seq), loadReportCount(seq)]);
}

// The open reports, unless the list on screen already says. One row is asked for: the answer has the total.
async function loadReportCount(seq) {
  if (activeTab === 'reports') return;
  let total = null;
  try {
    const { data, error } = await sb.rpc('admin_list_reports', { p_status: 'open', p_limit: 1, p_offset: 0 });
    const parsed = error ? null : reportList(data);
    if (parsed) total = parsed.total;
  } catch {
    // no count for this tab
  }
  if (seq !== loadSeq) return;
  counts.reports = total;
  if (total === null) exact.delete('reports');
  else exact.add('reports');
  renderTabs();
}

// The open problems, unless the list on screen already says.
async function loadProblemCount(seq) {
  if (activeTab === 'problems') return;
  let count = null;
  try {
    const { data, error } = await sb.rpc('admin_list_problem_cases', { p_filter: 'open' });
    if (!error && Array.isArray(data)) count = data.length;
  } catch {
    // no count for this tab
  }
  if (seq !== loadSeq) return;
  counts.problems = count;
  renderTabs();
}

// The pending applications, unless the list on screen already says.
async function loadApplicationCount(seq) {
  if (activeTab === 'apps' && filter === 'pending') return;
  let count = null;
  try {
    const { data, error } = await sb.rpc('admin_list_pro_applications', { p_status: 'pending' });
    if (!error) count = (data ?? []).length;
  } catch {
    // no count for this tab
  }
  if (seq !== loadSeq) return;
  counts.apps = count;
  renderTabs();
}

// The three service queues in one call; the lists are the fallback.
async function loadServiceCounts(seq) {
  if (!countsRpcMissing) {
    let answer = null;
    let missing = false;
    try {
      const { data, error } = await sb.rpc('admin_service_queue_counts');
      if (error?.code === 'PGRST202') missing = true;
      else if (!error) answer = queueCounts(data);
    } catch {
      // no counts this time
    }
    if (seq !== loadSeq) return;
    if (!missing) {
      for (const key of ['new', 'edits', 'live']) {
        if (answer && answer[key] !== null) {
          counts[key] = answer[key];
          exact.add(key);
        } else {
          exact.delete(key);
          if (key !== activeTab) counts[key] = null; // unknown; the open tab keeps what its list said
        }
      }
      renderTabs();
      return;
    }
    countsRpcMissing = true;
  }
  await Promise.all(['new', 'edits', 'live'].filter((key) => activeTab !== key).map(async (key) => {
    let count = null;
    try {
      const { data, error } = await sb.rpc('admin_list_service_queue', { p_queue: key });
      if (!error) count = (data ?? []).length;
    } catch {
      // no count for this tab
    }
    if (seq !== loadSeq) return;
    counts[key] = count;
    renderTabs();
  }));
}

const tabButtons = {};
function buildTabs() {
  for (const [key] of TABS) {
    const b = el('button', { className: 'chip' });
    b.onclick = () => { activeTab = key; load(); };
    tabButtons[key] = b;
  }
  const refresh = el('button', { className: 'chip', textContent: 'Refresh', onclick: load });
  $('tabs').replaceChildren(...Object.values(tabButtons), el('span', { className: 'spacer' }), refresh);
}

function renderTabs() {
  for (const [key, label] of TABS) {
    const n = counts[key];
    const b = tabButtons[key];
    b.textContent = typeof n === 'number' ? `${label} · ${n >= 200 && !exact.has(key) ? '200+' : n}` : label;
    b.setAttribute('aria-pressed', String(activeTab === key));
  }
  document.body.classList.toggle('wide', activeTab === 'pros'); // the table needs the room
}

function renderFilters() {
  const filters = $('filters');
  filters.replaceChildren();
  // The status filters are the applications'; the Pros tab has its sort once loaded.
  filters.hidden = !(activeTab === 'apps' || (activeTab === 'pros' && prosLoaded));
  if (activeTab === 'pros') {
    if (!prosLoaded) return;
    const sort = el('select', {}, ...PRO_SORTS.map(([value, label]) => el('option', { value, textContent: label })));
    sort.value = prosSort;
    sort.onchange = () => { prosSort = sort.value; renderList(); };
    filters.append(el('span', { className: 'spacer' }), el('label', { className: 'sortby' }, 'Sort by', sort));
    return;
  }
  for (const [value, label] of FILTERS) {
    const b = el('button', { className: 'chip', textContent: label });
    b.setAttribute('aria-pressed', String(filter === value));
    b.onclick = () => { filter = value; load(); };
    filters.append(b);
  }
}

// `keepCard`: the Problems list changed under a case card that must stay as it is.
function renderList(keepCard = false) {
  // The RPCs return at most 200 rows.
  const capped = rows.length >= 200 ? ' (the list stops at 200)' : '';
  if (activeTab === 'pros') return renderPros(capped);
  if (activeTab === 'problems') return renderProblems(capped, keepCard);
  if (activeTab === 'reports') return renderReports();
  const order = activeTab === 'live' ? 'latest change first' : 'oldest first';
  $('listMsg').textContent = rows.length ? `${rows.length} shown, ${order}${capped}` : 'Nothing here.';
  $('list').replaceChildren(...(activeTab === 'apps' ? rows.map(card) : rows.map((r) => serviceCard(r, activeTab))));
}

// The URL is normalised first, so "../" tricks can't leave the bucket.
function ownAvatarUrl(value) {
  try {
    const href = new URL(value).href;
    return AVATAR_PREFIXES.some((prefix) => href.startsWith(prefix)) ? href : null;
  } catch {
    return null;
  }
}

const BADGE_TAG = { ok: 'tag ok', pending: 'tag added', todo: 'tag', attention: 'tag warn' };

// `number` is what the applicant typed and is shown as it is; `href` is the
// link kvkUrl built from its 8 digits.
function kvkLink(number, href, className = '') {
  return el('a', { className, href, target: '_blank', rel: 'noopener noreferrer', textContent: `KvK ${number.trim()} ↗` });
}

function card(a) {
  const photo = el('img', { alt: '', referrerPolicy: 'no-referrer' });
  const avatar = ownAvatarUrl(a.avatar_url ?? '');
  if (avatar) photo.src = avatar;

  const person = [a.first_name, a.last_name].filter(Boolean).join(' ');
  // The KvK number of a business links to the company in the KvK register. An
  // older application may hold another kind of number; that stays a plain fact.
  const kvk = a.is_business ? kvkUrl(a.business_reg_number) : null;
  const stripeNote = stripeTypeNote(a.is_business, a.verification?.business_type);
  const tags = el('div', { className: 'tags' },
    el('span', { className: 'tag status', textContent: a.status }),
    el('span', { className: 'tag' }, a.is_business ? 'Business' : 'Private',
      ...(kvk ? [' · ', kvkLink(a.business_reg_number, kvk)] : [])),
    stripeNote ? el('span', { className: 'tag warn', textContent: stripeNote }) : null,
    ...(a.categories ?? []).map((c) => el('span', {
      className: 'tag',
      textContent: c === 'other' && a.other_category_label ? `Other: ${a.other_category_label}` : (CATEGORIES[c] ?? c),
    })),
  );
  // Without the verification fields (a database from before migration 112) the
  // badges are left out.
  const badges = verificationBadges(a.verification);
  const badgeTags = badges.length ? el('div', { className: 'tags' }, ...badges.map((b) => el('span', {
    className: BADGE_TAG[b.state],
    textContent: `${b.label}: ${stateText(b.label, b.state)}`,
  }))) : null;

  const facts = el('dl');
  const fact = (term, value) => { if (value) facts.append(el('dt', { textContent: term }), el('dd', {}, value)); };
  fact('Person', person || null);
  fact('Email', a.email ? el('a', { href: `mailto:${encodeURIComponent(a.email).replace('%40', '@')}`, textContent: a.email }) : null);
  fact('Phone', /^\+[0-9]{7,15}$/.test(a.phone ?? '') ? el('a', { href: `tel:${a.phone}`, textContent: a.phone }) : a.phone);
  fact('Address', [a.address_line, `${a.postcode ?? ''} ${a.city ?? ''}`.trim(), a.country].filter(Boolean).join(', '));
  fact('Company / VAT', kvk ? null : a.business_reg_number);
  fact('Service area', a.service_area_label);
  fact('Experience', `${a.years_experience} years`);
  fact('Languages', (a.languages ?? []).join(', ').toUpperCase());
  fact('Submitted', new Date(a.submitted_at).toLocaleString());
  if (a.rejection_reason) fact('Rejection reason', a.rejection_reason);
  if (a.suspension_reason) fact('Suspension reason', a.suspension_reason);

  const docs = el('div', { className: 'row' });
  for (const d of a.documents ?? []) {
    docs.append(el('button', {
      className: 'chip',
      textContent: `${d.kind === 'insurance' ? 'Insurance' : 'Certification'}: ${d.label}`,
      onclick: (e) => openDocument(d.storage_path, e.currentTarget),
    }));
  }

  const body = el('div', {},
    el('h2', { textContent: a.display_name }),
    tags,
    badgeTags,
    a.status === 'pending' ? el('p', { className: 'waiting', textContent: `Waiting ${waited(a.submitted_at)}` }) : null,
    facts,
    el('div', { className: 'bio', textContent: a.bio }),
    (a.documents ?? []).length ? el('p', { className: 'muted', textContent: 'Documents (links expire after 10 minutes):' }) : null,
    (a.documents ?? []).length ? docs : null,
    actions(a),
  );
  return el('article', { className: 'card app' }, photo, body);
}

function actions(a) {
  const box = el('div', { className: 'actions' });
  if (a.status === 'pending') {
    const approve = el('button', { className: 'btn', textContent: 'Approve' });
    approve.onclick = () => {
      if (!confirm(`Approve ${a.display_name}? They get the Verified badge and an email right away.`)) return;
      act('admin_review_pro_application', { p_pro_id: a.id, p_approve: true }, approve);
    };

    const preset = el('select', {}, el('option', { value: '', textContent: 'Reason for rejecting…' }),
      ...REASONS.map((r) => el('option', { value: r, textContent: r })));
    preset.setAttribute('aria-label', `Reason for rejecting ${a.display_name}`);
    const note = el('textarea', { rows: 2, maxLength: 1000, placeholder: 'Note for the applicant (sent by email)' });
    note.setAttribute('aria-label', `Note for ${a.display_name} (sent by email)`);
    const reject = el('button', { className: 'btn secondary', textContent: 'Reject' });
    reject.onclick = () => {
      const reason = [preset.value, note.value.trim()].filter(Boolean).join(' ');
      if (reason.length < 5) return alert('Pick a reason or write a note for the applicant.');
      act('admin_review_pro_application', { p_pro_id: a.id, p_approve: false, p_reason: reason }, reject);
    };
    box.append(el('div', { className: 'row' }, approve), preset, note, el('div', { className: 'row' }, reject));
  } else if (a.status === 'approved') {
    const suspend = el('button', { className: 'btn secondary', textContent: 'Suspend' });
    suspend.onclick = () => {
      const answer = prompt('Why are you suspending this professional? (kept on record)');
      if (answer === null) return; // cancelled
      const reason = answer.trim();
      if (reason.length < 5) return alert('Give a reason of at least 5 characters.');
      act('admin_set_pro_status', { p_pro_id: a.id, p_status: 'suspended', p_reason: reason }, suspend);
    };
    box.append(el('div', { className: 'row' }, suspend));
  } else if (a.status === 'suspended') {
    const reinstate = el('button', { className: 'btn navy', textContent: 'Reinstate' });
    reinstate.onclick = () => act('admin_set_pro_status', { p_pro_id: a.id, p_status: 'approved' }, reinstate);
    box.append(el('div', { className: 'row' }, reinstate));
  }
  return box;
}

// ---------------------------------------------------------------------------
// Pros. Names, emails and KvK numbers come from the professionals: textContent
// only, as everywhere else on this page.
// ---------------------------------------------------------------------------

const PRO_ORDER_TEXT = {
  rate: 'highest cancellation rate first', bookings: 'most bookings in 90 days first',
  problems: 'most open problems first', name: 'A to Z',
};

function renderPros(capped) {
  if (!prosLoaded) return; // still loading, or the message above is the answer
  const n = rows.length;
  $('listMsg').textContent = n
    ? `${n} ${n === 1 ? 'pro' : 'pros'} · ${PRO_ORDER_TEXT[prosSort] ?? PRO_ORDER_TEXT.rate}${capped}`
    : 'Nothing here.';
  $('list').replaceChildren(...(n ? [
    prosTable(sortPros(rows, prosSort)),
    el('p', {
      className: 'muted',
      textContent: 'Rate = cancellations by the pro ÷ the pro’s bookings in the last 90 days. Cancellations by customers aren’t counted here. A KvK number opens the company in the KvK register.',
    }),
  ] : []));
}

function prosTable(pros) {
  const th = (text, className = '') => el('th', { scope: 'col', textContent: text, className });
  const head = el('thead', {}, el('tr', {},
    th('Pro'), th('Bookings (90 d / all)', 'num'), th('Cancelled by the pro (90 d)'),
    th('Problems (open / all)'), th('Identity'), th('Payouts'), th('Private or business'),
    el('th', { scope: 'col' }, el('span', { className: 'sr', textContent: 'Details' }))));
  return el('div', { className: 'tablewrap' },
    el('table', { className: 'pros' }, head, el('tbody', {}, ...pros.flatMap(proRows))));
}

const whole = (n) => (Number.isFinite(n) ? n : 0);

// "✓ Verified", or what is still open. `hint` goes under it.
function badgeCell(badge, hint) {
  if (!badge) return el('td', {}, none('—'));
  const text = stateText(badge.label, badge.state);
  if (badge.state === 'ok') return el('td', { className: 'good' }, `✓ ${text}`);
  return el('td', {},
    el('span', { className: badge.state === 'todo' ? 'muted' : 'amber', textContent: text }),
    ...(hint ? [el('br'), none(hint)] : []));
}

// What the opened row shows under the reason counts: the cancellations.
function renderCancellations(slot, entry) {
  if (!entry) return slot.replaceChildren(); // not asked for yet, or the API has no such function
  if (entry.status === 'loading') return slot.replaceChildren(none('Loading the cancellations…'));
  if (entry.status === 'error') {
    return slot.replaceChildren(el('span', { className: 'error', textContent: `Couldn't load the cancellations: ${entry.message}` }));
  }
  const list = cancellationRows(entry.rows);
  if (!list.length) return slot.replaceChildren();
  const th = (text, className = '') => el('th', { scope: 'col', textContent: text, className });
  const table = el('table', { className: 'sub' },
    el('thead', {}, el('tr', {},
      th('Cancelled on'), th('Booking'), th('Reason'), th('Note to the customer'), th('Refunded', 'num'))),
    el('tbody', {}, ...list.map((c) => el('tr', {},
      el('td', { className: 'nowrap', textContent: c.cancelledOn }),
      el('td', { textContent: c.booking }),
      el('td', { textContent: c.reason }),
      el('td', {}, c.note ?? none('No note')),
      el('td', { className: 'num', textContent: c.refunded })))));
  return slot.replaceChildren(...[table,
    entry.rows.length >= CANCELLATIONS_LIMIT ? none(`The latest ${CANCELLATIONS_LIMIT} are shown.`) : null].filter(Boolean));
}

// admin_pro_cancellations once per pro (until the next load), when the row is
// opened. Without that function the row keeps showing only the reason counts.
// A failed fetch is tried again only when the reviewer opens the row again.
async function loadCancellations(id, retry = false) {
  if (cancellationsMissing || typeof id !== 'string') return;
  const known = cancellations.get(id);
  if (known && !(retry && known.status === 'error')) return; // loading, here, or failed
  const paint = () => {
    const slot = cancellationSlots.get(id);
    if (slot?.isConnected) renderCancellations(slot, cancellations.get(id));
  };
  const seq = loadSeq;
  cancellations.set(id, { status: 'loading' });
  paint();
  let answer;
  try {
    answer = await sb.rpc('admin_pro_cancellations', { p_pro: id, p_limit: CANCELLATIONS_LIMIT });
  } catch (e) {
    answer = { data: null, error: { message: e?.message ?? 'network error' } };
  }
  if (seq !== loadSeq) return; // a newer load() has cleared the cache
  const { data, error } = answer;
  if (error?.code === 'PGRST202') {
    cancellationsMissing = true;
    cancellations.delete(id);
  } else if (error) {
    cancellations.set(id, { status: 'error', message: error.message });
  } else {
    cancellations.set(id, { status: 'ok', rows: Array.isArray(data) ? data : [] });
  }
  paint();
}

// A pro's row, and under it (hidden until opened) the reasons for the
// cancellations. Only a pro with cancellations in the last 90 days has them.
function proRows(p) {
  const name = p.display_name ?? 'Unknown';
  const [identity, payouts] = verificationBadges(p.verification);
  const cancels = whole(p.pro_cancels_90d);
  const reasons = reasonCounts(p.cancel_reasons_90d);
  const canOpen = cancels > 0;
  const open = canOpen && expandedPros.has(p.id);

  const status = p.status === 'approved' ? 'tag ok' : p.status === 'suspended' ? 'tag warn' : 'tag';
  const problems = whole(p.problems_total) === 0
    ? el('td', {}, '0')
    : el('td', {}, `${whole(p.problems_open)} open`, el('span', { className: 'muted', textContent: ` of ${whole(p.problems_total)}` }));
  const kvk = p.is_business && typeof p.kvk === 'string' && p.kvk.trim() ? p.kvk : null;
  const stripeNote = stripeTypeNote(p.is_business, p.verification?.business_type);
  const subline = proSubline(p); // the city, else the email

  const row = el('tr', { className: open ? 'open' : '' },
    el('td', {},
      el('div', { className: 'name', textContent: name }),
      subline ? el('div', { className: 'muted', textContent: subline }) : null,
      el('div', { className: 'tags' }, el('span', { className: status, textContent: p.status ?? 'unknown' }))),
    el('td', { className: 'num', textContent: `${whole(p.bookings_90d)} / ${whole(p.bookings_total)}` }),
    whole(p.bookings_total) === 0
      ? el('td', {}, none('No bookings yet'))
      : el('td', { className: 'cancels', textContent: `${cancels} · ${cancelRate(p.pro_cancel_rate_90d)}` }),
    problems,
    badgeCell(identity),
    badgeCell(payouts, payouts?.state === 'attention' ? 'Not taking bookings' : null),
    el('td', {},
      p.is_business ? 'Business' : 'Private',
      kvk ? el('br') : null,
      // Like the applications card: only a real KvK number links; any other stays plain.
      kvk ? (kvkUrl(kvk) ? kvkLink(kvk, kvkUrl(kvk), 'small') : none(`Reg. no. ${kvk.trim()}`)) : null,
      stripeNote ? el('div', { className: 'tags' }, el('span', { className: 'tag warn', textContent: stripeNote })) : null),
    el('td'));
  if (!canOpen) return [row];

  // Under the reason counts: the cancellations themselves, once fetched.
  const slot = el('div', { className: 'subwrap' });
  const detail = el('tr', { id: `reasons-${p.id}`, className: open ? 'open' : '', hidden: !open },
    el('td', { colSpan: 8, className: 'detail' }, el('div', { className: 'reasons' },
      el('div', { className: 'tags' },
        el('b', { textContent: 'Cancellation reasons, last 90 days' }),
        ...(reasons.length
          ? reasons.map((r) => el('span', { className: 'tag', textContent: `${r.label} × ${r.count}` }))
          : [none('No reasons recorded')])),
      slot,
      none('Each one was refunded in full to the customer, and the pro was paid nothing for them.'))));
  cancellationSlots.set(p.id, slot);
  renderCancellations(slot, cancellations.get(p.id));
  if (open) loadCancellations(p.id); // opened before a reload: fetch again

  // The label starts with the visible words, so voice control can say them.
  const toggleText = (isOpen) => (isOpen ? 'Hide reasons' : 'Reasons');
  const toggle = el('button', { type: 'button', className: 'chip small', textContent: toggleText(open) });
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-controls', detail.id);
  toggle.setAttribute('aria-label', `${toggleText(open)} for ${name}`);
  toggle.onclick = () => {
    const show = detail.hidden;
    if (show) expandedPros.add(p.id);
    else expandedPros.delete(p.id);
    detail.hidden = !show;
    row.classList.toggle('open', show);
    detail.classList.toggle('open', show);
    toggle.textContent = toggleText(show);
    toggle.setAttribute('aria-expanded', String(show));
    toggle.setAttribute('aria-label', `${toggleText(show)} for ${name}`);
    if (show) loadCancellations(p.id, true);
  };
  row.lastElementChild.append(toggle);
  return [row, detail];
}

// ---------------------------------------------------------------------------
// Problems. These actions move money, so: the note is required, the amount is
// checked before anything is sent, the reviewer confirms in words that name
// the amount, nothing is sent twice, and the page shows what the database
// answered, never what it hoped for. Everything in a case (names, notes, the
// chat) comes from users: textContent only, as everywhere else on this page.
// ---------------------------------------------------------------------------

const caseId = (row) => (typeof row?.booking?.id === 'string' ? row.booking.id : null);

// Cases not yet decided on this page. A case the database answered for, with
// nothing left open in the answer, no longer counts.
const openCount = () => rows.filter((r) => !(savedCases.has(caseId(r)) && !isOpenCase(r))).length;

const mailLink = (email) => (typeof email === 'string' && email
  ? el('a', { href: `mailto:${encodeURIComponent(email).replace('%40', '@')}`, textContent: email })
  : none('no email'));

function notice(kind, text) {
  const node = el('div', { className: `banner ${kind}`, textContent: text });
  node.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  return node;
}

function renderProblems(capped, keepCard = false) {
  if (!rows.some((r) => caseId(r) === selectedCase)) selectedCase = rows.length ? caseId(rows[0]) : null;
  $('listMsg').textContent = rows.length ? `${openCount()} open, oldest first${capped}` : 'No open problems.';
  const chosen = rows.find((r) => caseId(r) === selectedCase);
  // Another case was answered: redraw the table only. Replacing the open card
  // would take the focus and the caret from a note being typed.
  const onScreen = keepCard && chosen ? $('list').querySelector('article.case') : null;
  if (onScreen && onScreen.dataset.caseId === caseId(chosen) && $('list').querySelector('.tablewrap')) {
    return $('list').querySelector('.tablewrap').replaceWith(casesTable());
  }
  $('list').replaceChildren(...[
    el('p', { className: 'muted', textContent: 'Reports after a booking, and card disputes. The pro’s payout stays on hold until you decide.' }),
    problemNotice ? notice(problemNotice.kind, problemNotice.text) : null,
    rows.length ? casesTable() : null,
    chosen ? caseCard(chosen) : null,
    healthCard(),
  ].filter(Boolean));
}

// The Payment health section: the payments Stripe took that no booking holds,
// and the scheduled jobs' errors, newest first. Ids and errors are shown as text.
function healthCard() {
  payPainters.clear(); // the rows below are drawn afresh
  const body = [];
  if (!health || health.status === 'loading') body.push(none('Loading…'));
  else if (health.status === 'missing') {
    body.push(none('Payment health isn’t set up yet. Apply migrations 109 to 116 from the Zoovo-app/zoovo-app repo.'));
  } else if (health.status === 'error') {
    body.push(el('span', { className: 'error', textContent: `Couldn’t load payment health: ${health.message}` }));
  } else {
    const { payments, errors } = health.health;
    if (!payments.length && !errors.length) {
      body.push(none('All clear: every payment Stripe took belongs to a booking, and no scheduled job logged an error.'));
    }
    if (payments.length) {
      body.push(el('span', { className: 'colhead', textContent: 'PAYMENTS NO BOOKING HOLDS' }),
        none('Stripe took these payments, but no booking records them. Refund them at Stripe, then mark each one handled, with a note, to take it off this list.'),
        ...payments.map(paymentRow));
    }
    if (errors.length) {
      body.push(el('span', { className: 'colhead', textContent: 'JOB ERRORS' }),
        none('A scheduled job failed on a booking and skipped it. It tries that booking again on its next run; the same error is listed once.'),
        ...errors.map((e) => el('span', {}, `${e.when} · ${e.job} · booking `, el('span', { className: 'ids', textContent: e.bookingId ?? '—' }),
          e.error ? ` · ${e.error}` : '', e.sqlstate ? ` (${e.sqlstate})` : '')));
    }
    if (payments.length >= HEALTH_LIMIT || errors.length >= HEALTH_LIMIT) body.push(none(`The latest ${HEALTH_LIMIT} of each are shown.`));
  }
  return el('section', { className: 'card health' }, el('h2', { textContent: 'Payment health' }),
    healthNotice ? notice(healthNotice.kind, healthNotice.text) : null, ...body);
}

// Draws the card again, if it is on screen.
function repaintHealth() {
  $('list').querySelector('section.health')?.replaceWith(healthCard());
}

// One unplaced payment: its PaymentIntent and when it arrived, and "Mark handled". That opens a note (5 to 1000
// characters, as every note here), asks to confirm, and sends admin_mark_payment_handled once; a refusal is shown
// by the note and the typed words stay. When the database has answered, the list is loaded again.
function paymentRow(p) {
  const holder = el('div', { className: 'payment' });
  const paint = () => holder.replaceChildren(...paymentParts(p, paint));
  payPainters.set(p.eventId, paint);
  paint();
  return holder;
}

function paymentParts(p, paint) {
  const id = p.eventId;
  const name = p.paymentIntentId ?? id;
  const state = handling.get(id) ?? {};
  const line = el('div', { className: 'line' },
    el('span', {}, el('span', { className: 'ids', textContent: name }), ` · received ${p.when}`));
  if (!state.open) {
    const open = el('button', { type: 'button', className: 'chip small', textContent: 'Mark handled' });
    // The label starts with the visible words, so voice control can say them.
    open.setAttribute('aria-label', `Mark handled: payment ${name}`);
    open.onclick = () => { handling.set(id, { open: true, note: state.note ?? '', focus: true }); paint(); };
    line.append(open);
    return [line];
  }

  const busy = requests.isBusy(id);
  const note = el('textarea', { rows: 2, maxLength: 1000, disabled: busy, value: state.note ?? '' });
  note.setAttribute('aria-label', `Note for payment ${name} (required, saved with the action)`);
  const error = el('p', { className: 'error', textContent: state.error ?? '' });
  error.setAttribute('role', 'alert');
  const status = el('p', { className: 'muted', textContent: busy ? 'Saving… please wait. Don’t close this page.' : '' });
  status.setAttribute('role', 'status');
  note.oninput = () => { handling.set(id, { ...handling.get(id), note: note.value, error: '' }); error.textContent = ''; };

  const mark = el('button', { type: 'button', className: 'btn navy', textContent: 'Mark handled', disabled: busy });
  const cancel = el('button', { type: 'button', className: 'chip small', textContent: 'Cancel', disabled: busy });
  cancel.onclick = () => { handling.delete(id); paint(); };
  mark.onclick = () => markHandled(p, note.value);

  if (state.focus) {
    handling.set(id, { ...state, focus: false });
    queueMicrotask(() => note.focus()); // once the row is on screen
  }
  return [line, el('div', { className: 'mark' },
    el('label', {}, 'Note (required, saved with the action)', note),
    el('span', { className: 'muted', textContent: 'Say how it was settled at Stripe, for example the refund’s id.' }),
    el('div', { className: 'row center' }, mark, cancel),
    error, status)];
}

async function markHandled(p, noteText) {
  const id = p.eventId;
  const show = (part) => { handling.set(id, { open: true, note: noteText, ...part }); payPainters.get(id)?.(); };
  if (requests.isBusy(id)) return;
  const problem = validateNote(noteText);
  if (problem) return show({ error: problem, focus: true });
  if (!confirm(markHandledConfirmText(p))) return;
  const args = markHandledArgs(p, noteText);
  if (!args) return show({ error: 'Couldn’t mark it handled: this payment has no id.' });
  const token = requests.start(id);
  if (token === null) return; // a request for this payment is already on its way
  show({}); // locks the note and the buttons while it is on its way
  let result;
  try {
    result = await sb.rpc('admin_mark_payment_handled', args);
  } catch (e) {
    result = { data: null, error: { message: e?.message ?? 'network error' } };
  }
  if (!requests.finish(id, token)) return; // the reviewer signed out meanwhile
  const { data, error } = result;
  if (error) return show({ error: markHandledErrorText(error), focus: true });
  handling.delete(id);
  // Believed only from the answer: it must name this payment and say when it was marked.
  const said = markedHandledText(data, p);
  healthNotice = said ? { kind: 'ok', text: said }
    : { kind: 'warn', text: 'The server answered, but not with the payment that was sent. The list was reloaded; check it before you do anything else.' };
  if (activeTab !== 'problems') return;
  loadHealth(loadSeq); // the marked payment is off the list when it comes back
  repaintHealth(); // the notice, and "Loading…" in place of the list until then
}

function casesTable() {
  const th = (text, className = '') => el('th', { scope: 'col', textContent: text, className });
  const head = el('thead', {}, el('tr', {},
    th('Reported by'), th('Reason'), th('Booking'), th('Amount', 'num'), th('Attention')));
  return el('div', { className: 'tablewrap' },
    el('table', { className: 'cases' }, head, el('tbody', {}, ...rows.map(caseTableRow))));
}

function caseTableRow(row) {
  const id = caseId(row);
  const b = row.booking ?? {};
  const items = caseItems(row);
  const selected = id !== null && id === selectedCase;
  const waiting = waitingTexts(row);
  // A case the database answered for, with nothing left open: a decision is
  // resolved; a reversal or a retry is only queued, the worker still has to do it.
  const saved = savedCases.get(id);
  const closed = saved !== undefined && !isOpenCase(row);
  const SAVED_LABEL = { decision: 'Resolved', record: 'Recorded' }; // the others are only queued: the worker still has to act
  const savedLabel = saved && (saved.decision === 'acknowledge' ? 'Acknowledged' : SAVED_LABEL[saved.kind]);
  const attention = attentionLabel(row) || (closed ? (savedLabel ?? 'Queued') : '—');
  const failed = row.attention === 'refund_failed' || row.attention === 'transfer_failed';
  const need = closed && savedLabel ? 'need done' : failed ? 'need bad' : 'need';

  const pick = (item) => {
    const button = el('button', { type: 'button', className: 'linkish', textContent: item.who });
    // The label starts with the visible name, so voice control can say it.
    button.setAttribute('aria-label', `${item.who}, open the case: ${item.reason}`);
    if (selected) button.setAttribute('aria-current', 'true');
    // Opening the case that is already open would only throw away a note being typed.
    button.onclick = () => { if (id === selectedCase) return; selectedCase = id; renderList(); };
    return button;
  };
  return el('tr', { className: selected ? 'selected' : '' },
    el('td', {}, ...items.map((item) => el('div', { className: 'item' }, pick(item), el('br'), el('span', { className: 'muted', textContent: item.role })))),
    el('td', {}, ...items.map((item) => el('div', { className: 'item', textContent: item.reason }))),
    el('td', {},
      el('div', { textContent: [b.service_title, row.pro?.display_name].filter(Boolean).join(' · ') || 'Booking' }),
      el('span', { className: 'muted', textContent: `${bookingWhen(b.start_at, b.end_at)}${b.transfer_status === 'sent' ? ' · transfer already sent' : ''}` })),
    el('td', { className: 'num', textContent: formatEuro(b.price_cents) }),
    el('td', {},
      el('div', { className: need, textContent: attention }),
      waiting ? el('span', { className: 'muted wait', textContent: waiting.list }) : null));
}

const pane = (title, ...lines) => el('div', { className: 'pane' },
  el('span', { className: 'colhead', textContent: title }),
  ...lines.filter((l) => l !== null && l !== undefined && l !== false)
    .map((l) => (typeof l === 'string' ? el('span', { textContent: l }) : l)));

// The payments on another PaymentIntent that the case row lists (stray_payments), one line each, then what to do
// about them. Everything is text from the database or fixed words.
function strayPaymentsBanner(row) {
  const lines = strayPayments(row);
  if (!lines.length) return null;
  const node = el('div', { className: 'banner warn stray' },
    ...lines.map((p) => el('div', { textContent: p.text })),
    ...strayPaymentNotes(row).map((text) => el('p', { textContent: text })));
  node.setAttribute('role', 'status');
  return node;
}

function caseCard(row) {
  const b = row.booking ?? {};
  const id = caseId(row);
  const items = caseItems(row);
  const waiting = waitingTexts(row);
  const money = (label, value) => [el('span', { textContent: label }), el('span', { className: 'r', textContent: value })];
  const proName = row.pro?.display_name ?? 'Deleted account';
  const customerName = row.customer?.name ?? 'Deleted account';

  const tags = el('div', { className: 'tags' },
    ...items.map((i) => el('span', {
      className: 'tag status',
      textContent: i.role === 'pet parent' || i.role === 'pro' ? `reported by the ${i.role}` : `${i.who} (${i.role})`,
    })),
    b.transfer_status === 'frozen' ? el('span', { className: 'tag added', textContent: 'payout on hold' }) : null,
    b.transfer_status === 'sent' ? el('span', { className: 'tag added', textContent: 'transfer already sent' }) : null,
    attentionLabel(row) && row.attention !== 'problem'
      ? el('span', { className: 'tag warn', textContent: attentionLabel(row) }) : null);

  const saved = savedCases.get(id);
  const savedBanner = !saved ? null
    : saved.kind === 'decision'
      ? (savedText(row, saved) ? notice('ok', savedText(row, saved))
        : notice('warn', 'The server answered, but not with the decision that was sent. Check the state below before you do anything else.'))
      : saved.kind === 'reversal'
        ? notice('ok', `Reversal requested. Transfer status now: ${transferLabel(b.transfer_status)}.`)
        : saved.kind === 'record'
          ? (recordedText(row, saved) ? notice('ok', recordedText(row, saved))
            : notice('warn', 'The server answered, but that Stripe refund is still listed. Check the state below before you do anything else.'))
          : saved.kind === 'requeue'
            ? (requeuedText(row, saved) ? notice('ok', requeuedText(row, saved))
              : notice('warn', 'The server answered, but a refund is still waiting to be sent again. Check the state below before you do anything else.'))
            : saved.kind === 'check'
              ? notice('ok', 'Lookup requested. Nothing has moved; refresh in a minute to see what Stripe says.')
              : notice('ok', 'Retry queued. The job runs again; refresh in a minute to see whether it worked.');

  const cancelled = cancellationText(b);
  const refunds = refundRows(row);
  const problems = problemDetails(row);
  const stripeIds = [['Payment', b.payment_intent_id], ['Transfer', b.transfer_id]].filter(([, v]) => typeof v === 'string' && v);

  const article = el('article', { className: 'card case' },
    el('div', { className: 'case-head' },
      el('h2', { textContent: `${[...new Set(items.map((i) => i.reason))].join(', ')} · ${b.service_title ?? 'Booking'}` }),
      tags,
      waiting ? el('span', { className: 'waiting', textContent: waiting.card }) : null),
    strayPaymentsBanner(row),
    savedBanner,
    el('div', { className: 'cols' },
      pane('BOOKING',
        el('span', {}, el('b', { textContent: b.service_title ?? 'Booking' }), ` · ${proName}`),
        bookingWhen(b.start_at, b.end_at),
        `Status: ${typeof b.status === 'string' ? b.status.replaceAll('_', ' ') : '—'}`,
        cancelled),
      pane('PEOPLE',
        el('span', {}, el('b', { textContent: 'Pet parent: ' }), customerName, ' · ', mailLink(row.customer?.email)),
        el('span', {}, el('b', { textContent: 'Pro: ' }), proName, ' · ', mailLink(row.pro?.email))),
      el('div', { className: 'pane' },
        el('span', { className: 'colhead', textContent: 'PAYMENT AND REFUNDS' }),
        el('div', { className: 'money' },
          ...money(b.payment_status === 'unpaid' ? 'Not paid' : `Paid by ${methodLabel(b.payment_method)}`, formatEuro(b.price_cents)),
          ...money('Payment status', paymentStatusLabel(b.payment_status)),
          ...money('Refunded so far', formatEuro(b.refunded_cents)),
          ...money('Zoovo 20%', formatEuro(b.commission_cents)),
          ...money('Pro’s share', formatEuro(b.payout_cents)),
          ...money('Transfer', transferLabel(b.transfer_status)),
          ...money('Payout due', whenLabel(b.payout_due_at))),
        ...stripeIds.map(([label, value]) => el('span', {}, `${label}: `, el('span', { className: 'ids', textContent: value }))),
        el('span', { className: 'colhead', textContent: 'REFUNDS' }),
        ...(refunds.length ? refunds.map((r) => el('span', { className: r.failed ? 'error' : '' },
          `${r.amount} · ${r.reason} · ${r.status} · ${r.when}`, r.note ? ` · “${r.note}”` : '')) : [none('No refunds yet.')])),
      el('div', { className: 'pane report' },
        el('span', { className: 'colhead', textContent: problems.length === 1 ? 'THE REPORT' : 'THE REPORTS' }),
        ...(problems.length ? problems.map((p) => el('div', { className: 'problem' },
          el('b', { textContent: `${p.kind}${p.open ? '' : ' (resolved)'}. ` }),
          p.note ? `“${p.note}”` : none('No note.'),
          el('div', { className: 'muted', textContent: `${p.who} (${p.role}) · ${p.when}${p.dispute ? ` · dispute: ${p.dispute}` : ''}` }),
          p.resolution ? el('div', { textContent: `${p.resolution}${p.resolutionNote ? `: “${p.resolutionNote}”` : ''}` }) : null))
          : [none('No problem is recorded for this booking.')]),
        id ? chatPanel(row, id) : null)),
    id ? caseActions(row, id) : null);
  article.dataset.caseId = id ?? '';
  return article;
}

// "Show chat": admin_booking_messages, once per case until the next load, read only.
const chatPainters = new Map(); // booking id -> repaints the chat on screen, if any

function chatPanel(row, id) {
  const slot = el('div', { className: 'chat' });
  const toggle = el('button', { type: 'button', className: 'chip small', textContent: 'Show chat (read only)' });
  toggle.setAttribute('aria-expanded', 'false');
  const paint = () => {
    const entry = caseChats.get(id);
    const shown = entry?.open === true;
    toggle.textContent = shown ? 'Hide chat' : 'Show chat (read only)';
    toggle.setAttribute('aria-expanded', String(shown));
    if (!shown) return slot.replaceChildren();
    if (entry.status === 'loading') return slot.replaceChildren(none('Loading the chat…'));
    if (entry.status === 'missing') {
      return slot.replaceChildren(none('The chat view isn’t set up yet. Apply migrations 109 to 116 from the Zoovo-app/zoovo-app repo.'));
    }
    if (entry.status === 'error') return slot.replaceChildren(el('span', { className: 'error', textContent: `Couldn’t load the chat: ${entry.message}` }));
    const lines = chatLines(entry.rows, row);
    const log = el('div', { className: 'chatlog', tabIndex: 0 }, ...(lines.length ? lines.map((l) => el('div', { className: 'msg' },
      el('b', { textContent: l.who }), el('span', { className: 'muted', textContent: ` · ${l.when}` }),
      el('div', { className: l.muted ? 'muted' : '', textContent: l.text }))) : [none('No messages in this chat.')]));
    log.setAttribute('role', 'region');
    log.setAttribute('aria-label', 'Chat between the pet parent and the pro (read only)');
    slot.replaceChildren(log, ...(entry.rows.length >= CHAT_LIMIT ? [none(`The latest ${CHAT_LIMIT} messages are shown.`)] : []));
  };
  chatPainters.set(id, paint);
  toggle.onclick = async () => {
    const known = caseChats.get(id);
    // A failed fetch is tried again only when the chat is opened again.
    if (known && (known.status !== 'error' || known.open)) { known.open = !known.open; return paint(); }
    const seq = loadSeq;
    caseChats.set(id, { status: 'loading', open: true });
    paint();
    let answer;
    try {
      answer = await sb.rpc('admin_booking_messages', { p_booking_id: id, p_limit: CHAT_LIMIT });
    } catch (e) {
      answer = { data: null, error: { message: e?.message ?? 'network error' } };
    }
    if (seq !== loadSeq) return; // a newer load() has cleared the cache
    const { data, error } = answer;
    const open = caseChats.get(id)?.open !== false;
    caseChats.set(id, !error ? { status: 'ok', open, rows: Array.isArray(data) ? data : [] }
      : error.code === 'PGRST202' ? { status: 'missing', open }
        : { status: 'error', open, message: error.message });
    chatPainters.get(id)?.();
  };
  paint();
  return el('div', { className: 'pane-chat' }, toggle, slot);
}

// The decisions, the reversal and the retries of one case.
function caseActions(row, id) {
  const b = row.booking ?? {};
  // Exactly the decisions the case row lists (allowed_decisions): the database applies the same rules.
  const allowed = allowedDecisions(row);
  // The database has just answered for this case: the reversal, the retry, the
  // recording and the second sending wait for the next load, so none can be
  // asked for on a state that is already moving.
  const justSaved = savedCases.has(id);
  const jobs = justSaved ? [] : failedJobs(row);
  const flags = justSaved ? [] : moneyFlags(row); // Stripe refunds the books don't agree with
  const requeue = !justSaved && canRequeue(row);
  const check = !justSaved && canCheckTransfer(row);
  const canReverse = !justSaved && b.transfer_status === 'sent';
  // Only a database that doesn't list its failed jobs leaves a failure unexplained.
  const moneyFailed = !justSaved && !Array.isArray(row.failed_jobs)
    && (row.attention === 'refund_failed' || row.attention === 'transfer_failed');
  const needsNote = allowed.length > 0 || canReverse || flags.some((f) => f.recordable) || requeue || check;
  if (!needsNote && !jobs.length && !moneyFailed && !flags.length) return null;

  const busy = requests.isBusy(id); // a request for this case is still on its way
  const draft = drafts.get(id) ?? {}; // what was typed here before the list was drawn again
  const keep = (part) => drafts.set(id, { ...drafts.get(id), ...part });
  const left = refundableCents(row) ?? 0;
  const box = el('div', { className: 'actions sep' });
  const formError = el('p', { className: 'error' });
  formError.setAttribute('role', 'alert');
  const status = el('p', { className: 'muted' });
  status.setAttribute('role', 'status');
  if (busy) status.textContent = 'Saving… please wait. Don’t close this page.';

  const note = el('textarea', { rows: 3, maxLength: 1000, disabled: busy, value: draft.note ?? '' });
  note.oninput = () => keep({ note: note.value });
  const optionRow = (className, ...children) => el('div', { className: `option ${className}`.trim() }, ...children);
  const hint = (text) => el('span', { className: 'hint', textContent: text });

  // Sends one action. The card locks first (act), so a second click can't
  // send a second request, and the case stays locked until the answer is in.
  // `meta` is what the answer is checked against: {kind, decision, ids}.
  const go = (fn, args, button, meta) => {
    const token = requests.start(id);
    if (token === null) return; // a request for this case is already on its way
    status.textContent = 'Saving… please wait. Don’t close this page.';
    act(fn, args, button, (result) => finishCaseAction(id, token, meta, result));
  };
  // The note first: it is the top of the form.
  const refuse = (message, field) => { formError.textContent = message; field?.focus(); };

  if (needsNote) {
    box.append(el('label', {}, 'Note (required, saved with the action)', note),
      allowed.length ? el('span', { className: 'muted', textContent: decisionNoticeText(row) }) : null,
      formError);
  }
  if (allowed.length) {
    box.append(el('span', { className: 'decision-title', textContent: 'Decision' }));
    if (allowed.includes('withhold')) {
      box.append(el('span', { className: 'muted', textContent: 'This case has a card dispute. A disputed charge can’t be refunded here, so you can only release or withhold the payout.' }));
    }
  }

  const amount = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', disabled: busy });
  amount.setAttribute('aria-label', 'Refund amount in euros');

  const decide = (decision, button) => {
    if (requests.isBusy(id)) return;
    const cents = decision === 'partial_refund' ? parseEuroToCents(amount.value) : null;
    const problem = validateDecision(row, decision, cents, note.value);
    // A row that can't say what the reviewer saw is never sent: the list is loaded again, as after the RPC's
    // own stale-view refusal.
    if (problem === CASE_CHANGED) return reloadWith(CASE_CHANGED);
    if (problem) return refuse(problem, validateNote(note.value) ? note : amount);
    formError.textContent = '';
    if (!confirm(confirmText(row, decision, cents))) return;
    // What the reviewer saw: the money log up to seen_log_id (p_seen_log_id). The RPC refuses the decision
    // when payment events arrived after it (then the list is reloaded, see finishCaseAction).
    const args = decisionArgs(row, decision, cents, note.value);
    if (!args) return reloadWith(CASE_CHANGED); // validateDecision checked the row already; never send a guess
    go('admin_resolve_booking_problems', args, button,
      // The problems open on the card that was on screen: the answer must have closed these. A case with
      // none open is checked by the refund it asked for (cents, on top of what was refunded before).
      { kind: 'decision', decision, ids: openProblems(row).map((p) => p.id),
        cents: decision === 'full_refund' ? left : cents, refundedBefore: b.refunded_cents ?? 0 });
  };
  const options = {
    full_refund: () => {
      const button = el('button', { type: 'button', className: 'btn secondary', textContent: decisionButtonLabel(row, 'full_refund'), disabled: busy });
      button.onclick = () => decide('full_refund', button);
      return optionRow('', button, hint(decisionPreview(row, 'full_refund', null) || 'Nothing is left to refund.'));
    },
    partial_refund: () => {
      const suggestion = suggestedRefund(row);
      // What was typed before wins over the suggestion, even if it was cleared.
      amount.value = draft.amount ?? (suggestion ? centsToInput(suggestion) : '');
      const button = el('button', { type: 'button', className: 'btn', textContent: decisionButtonLabel(row, 'partial_refund'), disabled: busy });
      button.onclick = () => decide('partial_refund', button);
      const preview = hint('');
      const update = () => {
        const cents = parseEuroToCents(amount.value);
        const text = cents === null ? '' : decisionPreview(row, 'partial_refund', cents);
        preview.textContent = text || (amount.value.trim()
          ? `Enter a refund from €0.01 to ${formatEuro(left)}, like 7 or 7,50.`
          : `Enter the amount to refund, up to ${formatEuro(left)}.`);
      };
      amount.oninput = () => { keep({ amount: amount.value }); update(); };
      update();
      const field = el('label', { className: 'amount-label' }, 'Amount ',
        el('span', { className: 'amount' }, el('span', { className: 'muted', textContent: '€' }), amount));
      return optionRow(suggestion ? 'suggested' : '', button, field, preview,
        suggestion ? el('span', { className: 'muted wide', textContent: `Suggested ${formatEuro(suggestion)}: the cancellation policy applied at the start time, minus what was already refunded.` }) : null);
    },
    release: () => {
      const button = el('button', { type: 'button', className: 'btn navy', textContent: decisionButtonLabel(row, 'release'), disabled: busy });
      button.onclick = () => decide('release', button);
      return optionRow('', button, hint(decisionPreview(row, 'release', null)));
    },
    withhold: () => {
      const button = el('button', { type: 'button', className: 'btn secondary', textContent: decisionButtonLabel(row, 'withhold'), disabled: busy });
      button.onclick = () => decide('withhold', button);
      return optionRow('', button, hint(decisionPreview(row, 'withhold', null)));
    },
    acknowledge: () => {
      const button = el('button', { type: 'button', className: 'btn secondary', textContent: decisionButtonLabel(row, 'acknowledge'), disabled: busy });
      button.onclick = () => decide('acknowledge', button);
      return optionRow('', button, hint(decisionPreview(row, 'acknowledge', null)));
    },
  };
  for (const decision of allowed) box.append(options[decision]());

  // A refund made at Stripe that the books don't have (or whose status they disagree with). The Stripe id comes
  // from the case, shown as text; the note is the reviewer's.
  const noteFirst = () => {
    const problem = validateNote(note.value);
    if (problem) { refuse(problem, note); return false; }
    formError.textContent = '';
    return true;
  };
  for (const flag of flags) {
    const says = flag.status ? ` (Stripe says: ${flag.status})` : '';
    if (!flag.recordable) {
      // The database's own reason, in its words.
      box.append(optionRow('', hint(`${flag.label}${says}: `), el('span', { className: 'ids', textContent: flag.stripeId }),
        el('span', { className: 'muted wide', textContent: `Can’t be recorded yet: ${flag.refusal}` })));
      continue;
    }
    const record = el('button', { type: 'button', className: 'btn navy', textContent: `Record refund${flag.cents ? ` · ${formatEuro(flag.cents)}` : ''}`, disabled: busy });
    record.onclick = () => {
      if (!noteFirst() || !confirm(recordRefundConfirmText(row, flag))) return;
      go('admin_record_external_refund', { p_booking_id: id, p_stripe_refund_id: flag.stripeId, p_note: note.value.trim() },
        record, { kind: 'record', stripeId: flag.stripeId });
    };
    box.append(optionRow('', record, hint(`${flag.label}${says}: `), el('span', { className: 'ids', textContent: flag.stripeId }),
      el('span', { className: 'muted wide', textContent: 'Brings the books in line with what Stripe did. Nothing is sent to Stripe. Decisions that refund wait until this is recorded.' })));
  }

  // Refunds that failed for good are not retried by themselves: a new refund request takes their place.
  if (requeue) {
    const refunds = requeueableRefunds(row);
    const total = refunds.reduce((sum, r) => sum + (Number.isInteger(r.amount) ? r.amount : 0), 0);
    const again = el('button', { type: 'button', className: 'btn secondary', textContent: refunds.length === 1 ? 'Send the failed refund again' : `Send ${refunds.length} failed refunds again`, disabled: busy });
    again.onclick = () => {
      if (!noteFirst() || !confirm(requeueConfirmText(row))) return;
      go('admin_requeue_refund', { p_booking: id, p_note: note.value.trim() }, again, { kind: 'requeue', cents: total });
    };
    box.append(optionRow('', again, hint(`${formatEuro(total)} that failed for good is asked from Stripe again, as a new refund. Uses the note above.`)));
  }

  // Only asks Stripe: the worker looks the transfer up and reports what it finds.
  if (check) {
    const lookup = el('button', { type: 'button', className: 'btn secondary', textContent: 'Check the transfer at Stripe', disabled: busy });
    lookup.onclick = () => {
      if (!noteFirst() || !confirm(checkTransferConfirmText(row))) return;
      go('admin_check_transfer', { p_booking_id: id, p_note: note.value.trim() }, lookup, { kind: 'check' });
    };
    box.append(optionRow('', lookup, hint('Only asks Stripe whether the transfer exists, and adopts it if it does. No money moves. Uses the note above.')));
  }

  if (canReverse) {
    const reverse = el('button', { type: 'button', className: 'btn secondary', textContent: reverseLabel(row), disabled: busy });
    reverse.onclick = () => {
      if (!noteFirst() || !confirm(reverseConfirmText(row))) return;
      go('admin_reverse_transfer', { p_booking_id: id, p_note: note.value.trim() }, reverse, { kind: 'reversal' });
    };
    box.append(optionRow('', reverse, hint('Takes the money back from the pro’s Stripe account. Uses the note above.')));
  }

  // Retry only what the database says it will accept; for the rest, its reason.
  for (const job of jobs) {
    const failedWith = job.error ? `Failed with: ${job.error}` : '';
    if (!job.retryable) {
      box.append(optionRow('', hint(`Can’t retry the ${job.label}: ${job.refusal ?? 'the database did not say why'}.${failedWith ? ` ${failedWith}` : ''}`)));
      continue;
    }
    const retry = el('button', { type: 'button', className: 'btn navy', textContent: retryLabel(job), disabled: busy });
    retry.onclick = () => {
      if (!confirm(retryConfirmText(job, row))) return;
      formError.textContent = '';
      go('admin_retry_payment_job', { p_job_id: job.id }, retry, { kind: 'retry' });
    };
    box.append(optionRow('', retry, hint(failedWith || 'This job failed.')));
  }
  if (moneyFailed && !jobs.length) {
    box.append(el('span', { className: 'muted', textContent: 'A refund or transfer failed, but the database did not say which job, so it can’t be retried from here.' }));
  }

  box.append(status);
  return box;
}

// Says why above the Problems list (an alert when the reviewer has moved to
// another tab, so the message isn't lost) and loads the list again, so the
// card shows what is true now.
function reloadWith(text) {
  if (activeTab !== 'problems') alert(text);
  else {
    problemNotice = { kind: 'bad', text: `${text} The list was reloaded; check the case before trying again.` };
    keepNotice = true;
  }
  return load();
}

// What to do with the answer to an action. `meta` is what was sent ({kind,
// decision, ids}). An answer that no request is waiting for (the reviewer
// signed out meanwhile) is ignored. A success shows the row the database sent
// back; an error (the stale-view refusal reads CASE_CHANGED), or an answer
// that isn't a case, reloads the list so the card shows what is true now.
async function finishCaseAction(id, token, meta, { data, error }) {
  if (!requests.finish(id, token)) return;
  const here = activeTab === 'problems';
  if (error) return reloadWith(saveErrorText(error));
  const updated = asCaseRow(data, id);
  // The note and the amount are spent once the database took the action and
  // answered with the case (or, for a reversal, with anything); a retry uses neither.
  if (updated ? meta.kind !== 'retry' : meta.kind === 'reversal') drafts.delete(id);
  if (here && updated) {
    if (!rows.some((r) => caseId(r) === id)) {
      // The list is being loaded again: that load may have read the case before this save. It shows this answer instead.
      overlays.set(id, { row: updated, meta, seq: loadSeq });
      return;
    }
    rows = rows.map((r) => (caseId(r) === id ? keepWaiting(updated, r) : r)); // the answer has no waiting_since
    savedCases.set(id, meta);
    counts.problems = openCount();
    renderTabs();
    return renderList(id !== selectedCase); // another case's card is left alone
  }
  if (here) {
    // A decision, a recording or a second sending is only believed from the row it answers with; a reversal,
    // a retry or a lookup asked something the list shows afterwards.
    const ASKED = {
      reversal: 'Reversal requested. The list was reloaded; the transfer status shows where it stands.',
      retry: 'Retry queued. The list was reloaded; refresh in a minute to see whether it worked.',
      check: 'Lookup requested. The list was reloaded; refresh in a minute to see what Stripe says.',
    };
    problemNotice = ASKED[meta.kind]
      ? { kind: 'ok', text: ASKED[meta.kind] }
      : { kind: 'bad', text: 'The server answered with something unexpected. The list was reloaded; check the case before trying again.' };
    keepNotice = true;
  }
  return load();
}

// ---------------------------------------------------------------------------
// Reports (R11): reports about services, reviews and the replies under them. A report closes with one of
// four actions, each with the team's note; the server also closes every other open report on the same target.
// The names, titles and texts come from users: textContent only, as everywhere else on this page.
// ---------------------------------------------------------------------------

const REPORTS_INTRO = 'Reports about services, reviews and replies. Every action closes the report and is saved with your note.';
const REPORTS_FOOTNOTE = 'Review reports show Dismiss and Hide review; reply reports show Dismiss and Hide reply. User, post, message and comment reports stay where they are today.';
const SAVING = 'Saving… please wait. Don’t close this page.';

const objectOf = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null);

function renderReports() {
  if (!rows.some((r) => r.id === selectedReport)) selectedReport = rows.length ? rows[0].id : null;
  const more = reportTotal > rows.length ? ` (the oldest ${rows.length} are shown)` : '';
  $('listMsg').textContent = rows.length ? `${reportTotal} open, oldest first${more}` : 'No open reports.';
  const chosen = rows.find((r) => r.id === selectedReport);
  const shown = reportNotice ? reportNoticeShown(reportNotice, null) : null; // the list was loaded just now
  $('list').replaceChildren(...[
    el('p', { className: 'muted', textContent: REPORTS_INTRO }),
    shown ? notice(shown.kind, shown.text) : null,
    rows.length ? reportsTable() : null,
    chosen ? reportCard(chosen) : null,
    rows.length ? el('p', { className: 'muted', textContent: REPORTS_FOOTNOTE }) : null,
  ].filter(Boolean));
}

function reportsTable() {
  const th = (text) => el('th', { scope: 'col', textContent: text });
  const head = el('thead', {}, el('tr', {},
    th('Reported by'), th('Reason'), th('What'), th('As reported'), th('Waiting')));
  return el('div', { className: 'tablewrap' },
    el('table', { className: 'cases reports' }, head, el('tbody', {}, ...rows.map(reportTableRow))));
}

function reportTableRow(item) {
  const text = reportRowText(item);
  const waiting = reportWaiting(item, Date.now());
  const selected = item.id === selectedReport;
  const pick = el('button', { type: 'button', className: 'linkish', textContent: text.by });
  // The label starts with the visible name, so voice control can say it.
  pick.setAttribute('aria-label', `${text.by}, open the report: ${text.reason}`);
  if (selected) pick.setAttribute('aria-current', 'true');
  // Opening the report that is already open would only redraw its card, and take the caret from a note being typed.
  pick.onclick = () => { if (item.id === selectedReport) return; selectedReport = item.id; renderList(); };
  return el('tr', { className: selected ? 'selected' : '' },
    el('td', {}, pick),
    el('td', { textContent: text.reason }),
    el('td', {}, el('span', { className: 'kind', textContent: text.kind }), el('br'), text.what),
    el('td', {}, text.reported ?? none('No text')),
    el('td', { className: 'wait', textContent: waiting ? `${waiting.list}${selected ? ' · open below' : ''}` : '—' }));
}

// The service, review or reply as it is now, next to the report.
function reportTargetPane(item) {
  const t = objectOf(item.target);
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (item.target_type === 'service') {
    if (t === null) return pane('THE SERVICE, AS IT IS NOW', none('This service has been deleted.'));
    return pane('THE SERVICE, AS IT IS NOW',
      el('span', {}, el('b', { textContent: text(t.title) ?? 'Untitled service' }), text(t.pro_display_name) ? ` · ${text(t.pro_display_name)}` : null),
      typeof t.status === 'string' ? `Status: ${t.status}` : null);
  }
  if (t === null) return pane('THE REVIEW AND ITS REPLY', none(`This ${item.target_type === 'review' ? 'review' : 'reply'} has been deleted.`));
  const comment = text(t.comment);
  const reply = text(t.reply);
  const hidden = (label) => el('span', { className: 'tag warn', textContent: label });
  // The server sends one flag per kind of report (`hidden` for a review, `reply_hidden` for a reply): the one
  // this report is about is shown, on the review or on the reply.
  const flagged = reportHidden(item);
  const reviewHidden = flagged && item.target_type === 'review';
  const replyHidden = flagged && item.target_type === 'review_reply';
  return pane('THE REVIEW AND ITS REPLY',
    el('span', {}, el('b', { textContent: text(t.author_first_name) ?? 'A former member' }), reviewHidden ? ' ' : null,
      reviewHidden ? hidden('review hidden by the team') : null),
    comment ? el('span', { className: 'quote', textContent: `“${comment}”` }) : none('No comment.'),
    reply
      ? el('div', { className: 'box reply' }, el('b', { textContent: `Reply from ${text(t.pro_display_name) ?? 'the pro'}` }),
        `: “${reply}”`, replyHidden ? ' ' : null, replyHidden ? hidden('reply hidden by the team') : null)
      : none('No reply.'));
}

function reportCard(item) {
  const id = item.id;
  const text = reportRowText(item);
  const waiting = reportWaiting(item, Date.now());
  const t = objectOf(item.target);
  const status = item.target_type === 'service' && typeof t?.status === 'string'
    ? el('span', { className: t.status === 'live' ? 'tag ok' : 'tag warn', textContent: t.status }) : null;
  const state = reportTargetState(item);
  const article = el('article', { className: 'card case' },
    el('div', { className: 'case-head' },
      el('h2', { textContent: text.heading }),
      el('div', { className: 'tags' }, el('span', { className: 'tag status', textContent: text.tag }), status),
      waiting ? el('span', { className: 'waiting', textContent: waiting.card }) : null),
    state ? notice('warn', state) : null,
    el('div', { className: 'cols' },
      reportTargetPane(item),
      pane('THE REPORT',
        el('span', {}, el('b', { textContent: `${text.reason}.` })),
        text.reported ? `As reported: ${text.reported}` : none('No text as reported.'),
        el('span', { className: 'muted', textContent: reportFromLine(item) }))),
    reportDecision(item));
  article.dataset.reportId = id;
  return article;
}

// The decision: one note, and an action for each thing the team can do. A take-down has its own box with the
// reason the pro reads; the server keeps that text as the note too, so the note above is not used for it.
function reportDecision(item) {
  const id = item.id;
  const actions = reportActions(item);
  if (actions.length === 0) return null;
  const busy = requests.isBusy(id); // a request for this report is still on its way
  const draft = reportDrafts.get(id) ?? {}; // what was typed here before the list was drawn again
  const keep = (part) => reportDrafts.set(id, { ...reportDrafts.get(id), ...part });
  const formError = el('p', { className: 'error', textContent: draft.error ?? '' });
  formError.setAttribute('role', 'alert');
  const saving = el('p', { className: 'muted', textContent: busy ? SAVING : '' });
  saving.setAttribute('role', 'status');

  const note = el('textarea', { rows: 3, maxLength: 1000, disabled: busy, value: draft.note ?? '' });
  note.oninput = () => { keep({ note: note.value, error: '' }); formError.textContent = ''; };
  const reason = el('input', { type: 'text', maxLength: 1000, autocomplete: 'off', disabled: busy, value: draft.reason ?? '' });
  reason.oninput = () => { keep({ reason: reason.value, error: '' }); formError.textContent = ''; };

  const optionRow = (className, ...children) => el('div', { className: `option ${className}`.trim() }, ...children);
  const hint = (action) => el('span', { className: 'hint', textContent: reportActionHint(item, action) });
  const button = (action, className) => {
    const b = el('button', { type: 'button', className: `btn ${className}`, textContent: reportActionLabel(action), disabled: busy });
    b.onclick = () => decideReport(item, action, b, action === 'take_down' ? reason : note, formError, saving);
    return b;
  };

  const box = el('div', { className: 'actions sep' },
    el('span', { className: 'decision-title', textContent: 'Decision' }),
    el('label', {}, 'Note (required, saved with the decision; only the team sees it)', note),
    actions.includes('take_down')
      ? el('span', { className: 'muted', textContent: 'For a take-down, the reason for the pro below is saved as the note instead.' }) : null,
    formError);
  for (const action of actions) {
    if (action === 'dismiss') box.append(optionRow('', button(action, 'outline'), hint(action)));
    else if (action === 'take_down') {
      box.append(optionRow('suggested', button(action, ''), hint(action),
        el('label', { className: 'stack' }, 'Reason for the pro (required)', reason),
        el('span', { className: 'notified wide', textContent: TAKE_DOWN_NOTIFIED })));
    } else box.append(optionRow('', button(action, 'navy'), hint(action)));
  }
  box.append(saving);
  return box;
}

// Checks the text, asks, and sends the action once. The card locks first (act), so a second click can't send a
// second request, and it stays locked until the answer is in. `field` holds the text sent as the note: the note
// for most actions, the reason for the pro for a take-down.
function decideReport(item, action, button, field, formError, saving) {
  const id = item.id;
  if (requests.isBusy(id)) return;
  const problem = validateHandling(item, action, field.value);
  if (problem) {
    formError.textContent = problem;
    field.focus();
    return;
  }
  formError.textContent = '';
  if (!confirm(handleConfirmText(item, action, field.value))) return;
  const args = handleArgs(item, action, field.value); // validateHandling passed; never send a guess
  if (!args) {
    formError.textContent = 'Couldn’t send: this report can’t be handled from here.';
    return;
  }
  const token = requests.start(id);
  if (token === null) return; // a request for this report is already on its way
  saving.textContent = SAVING;
  act('admin_handle_report', args, button, (result) => finishReportAction(item, action, token, result));
}

// What to do with the answer. An answer that no request is waiting for (the reviewer signed out meanwhile) is
// ignored. A success is told from what the database answered (handledText), then the list is loaded again; a
// refusal because the state moved on reloads it too, with the reason above the list; any other refusal
// stays on the card, unlocked, with the words typed.
async function finishReportAction(item, action, token, { data, error }) {
  const id = item.id;
  if (!requests.finish(id, token)) return;
  const here = activeTab === 'reports';
  if (error) {
    const text = handleErrorText(error);
    if (!here) {
      alert(text); // a message for a tab the reviewer has left must not be lost
      return load();
    }
    if (handleRefusalIsStale(error)) {
      reportNotice = { kind: 'bad', text, reloads: true };
      keepNotice = true;
      return load();
    }
    reportDrafts.set(id, { ...reportDrafts.get(id), error: text });
    return renderList();
  }
  const said = handledText(data, item, action);
  if (said) reportDrafts.delete(id);
  if (!here) return load();
  reportNotice = said ? { kind: 'ok', text: said }
    : { kind: 'warn', text: 'The server answered, but not with the report that was sent.', reloads: true };
  keepNotice = true;
  return load();
}

// ---------------------------------------------------------------------------
// Services. Everything a professional wrote (titles, descriptions, labels,
// notes, even the media paths) goes in through textContent or an allow-listed
// URL, never innerHTML.
// ---------------------------------------------------------------------------

const MODES = {
  customer_home: "at the pet parent's home", pro_home: "at the professional's place", both: 'at either place',
};
const UNITS = { fixed: 'Fixed price', hour: 'Per hour', day: 'Per day', night: 'Per night', visit: 'Per visit' };
const REQUIREMENTS = {
  vaccinated_only: 'Vaccinated pets only', small_dogs_only: 'Small dogs only',
  large_dogs_accepted: 'Large dogs welcome', cats_accepted: 'Cats welcome',
  medication: 'Can give medication', puppies: 'Puppies welcome',
  senior_pets: 'Senior pets welcome', special_needs: 'Special needs welcome',
};
const POLICIES = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict' };

function categoryText(n) {
  if (!n.category) return null;
  if (n.category === 'other') return n.other_category_label ? `Other: ${n.other_category_label}` : 'Other';
  return CATEGORIES[n.category] ?? n.category;
}

// "<address_label> · <mode, radius>". Never the coordinates.
function locationText(n) {
  const how = [
    n.location_mode ? (MODES[n.location_mode] ?? n.location_mode) : null,
    n.service_radius_km !== null ? `up to ${n.service_radius_km} km` : null,
  ].filter(Boolean).join(', ');
  return [n.address_label, how].filter(Boolean).join(' · ') || null;
}

const policyText = (n) => (n.cancellation_policy ? (POLICIES[n.cancellation_policy] ?? n.cancellation_policy) : null);

const none = (text = 'Not set') => el('span', { className: 'muted', textContent: text });

// `other` is the version to compare against (its changed part is marked), or
// undefined when there is nothing to compare.
function textNodes(value, other) {
  if (value === null) return [none()];
  const [before, changed, after] = splitChange(value, other);
  return [before, changed ? el('mark', { textContent: changed }) : null, after];
}
const compareText = (read) => (v, o) => textNodes(read(v), o ? read(o) : undefined);

// An item the edit dropped from the live version: shown on the SUBMITTED side,
// struck through and muted.
const removedLine = (text) => el('div', { className: 'removed' }, 'Removed: ', el('s', { textContent: text }));

function priceNodes(v, o) {
  const same = (key) => !o || JSON.stringify(v[key]) === JSON.stringify(o[key]);
  const piece = (text, unchanged) => (unchanged ? text : el('mark', { textContent: text }));
  const join = (items) => items.flatMap((item, i) => (i ? [' · ', item] : [item]));
  const prices = [];
  if (v.custom_quote) prices.push(piece('Custom quote (price on request)', same('custom_quote')));
  for (const [key, label] of SIZES) {
    const cents = v.size_prices?.[key];
    if (typeof cents === 'number') prices.push(piece(`${label} ${formatEuro(cents)}`, !o || (o.size_prices?.[key] ?? null) === cents));
  }
  if (v.base_price_cents !== null) {
    prices.push(piece(`${v.size_prices ? 'Base ' : ''}${formatEuro(v.base_price_cents)}`, same('base_price_cents')));
  }
  const extras = [];
  if (v.extra_pet_price_cents !== null) extras.push(piece(`Extra pet +${formatEuro(v.extra_pet_price_cents)}`, same('extra_pet_price_cents')));
  if (v.weekend_surcharge_pct !== null) extras.push(piece(`Weekends +${v.weekend_surcharge_pct}%`, same('weekend_surcharge_pct')));
  if (v.holiday_surcharge_pct !== null) extras.push(piece(`Holidays +${v.holiday_surcharge_pct}%`, same('holiday_surcharge_pct')));
  const unit = v.price_unit ? piece(UNITS[v.price_unit] ?? v.price_unit, same('price_unit')) : null;
  const removed = o ? removedPriceParts(o, v).map(removedLine) : [];
  if (!prices.length && !extras.length && !unit) return [none('No price set'), ...removed];
  return [
    el('div', {}, ...(unit ? [unit, ': '] : []), ...(prices.length ? join(prices) : [none('No price set')])),
    extras.length ? el('div', {}, ...join(extras)) : null,
    ...removed,
  ];
}

function listNodes(v, o) {
  const removed = o ? removedItems(o, v) : [];
  if (!v.whats_included.length && !removed.length) return [none('None')];
  return [el('ul', { className: 'plain' },
    ...v.whats_included.map((item) =>
      el('li', {}, !o || o.whats_included.includes(item) ? item : el('mark', { textContent: item }))),
    ...removed.map((item) => el('li', { className: 'removed' }, 'Removed: ', el('s', { textContent: item }))))];
}

function requirementNodes(v, o) {
  if (!v.requirements.length) return [none('None')];
  return [el('div', { className: 'tags' }, ...v.requirements.map((key) => el('span', {
    className: o && !o.requirements.includes(key) ? 'tag added' : 'tag',
    textContent: REQUIREMENTS[key] ?? key,
  })))];
}

// An image of a service (`url` is already allow-listed). If the file does not
// load, say a path with nothing uploaded behind it, the image (and the link
// around it) turns into a "File missing" tag, so the reviewer sees the gap.
function mediaImg(props, url) {
  const img = el('img', { referrerPolicy: 'no-referrer', ...props });
  img.addEventListener('error', () => {
    const shown = img.parentElement?.tagName === 'A' ? img.parentElement : img;
    shown.replaceWith(el('span', { className: 'tag warn', textContent: 'File missing' }));
  }, { once: true });
  img.src = url;
  return img;
}

// A photo opens full size in a new tab; a video shows its poster and a Play
// button that swaps in the player (nothing is downloaded before that).
function thumb(m, number, added) {
  const holder = el('span', { className: added ? 'thumb added' : 'thumb' });
  const src = serviceMediaUrl(m.path);
  const poster = serviceMediaUrl(m.poster_path);
  const badge = (text) => holder.append(el('span', { className: added ? 'badge added' : 'badge', textContent: text }));
  if (m.type === 'photo' && src) {
    holder.append(el('a', { href: src, target: '_blank', rel: 'noopener noreferrer' },
      mediaImg({ loading: 'lazy', alt: `Photo ${number}` }, src)));
    if (added) badge('New');
  } else if (m.type === 'video' && src) {
    if (poster) holder.append(mediaImg({ loading: 'lazy', alt: `Video ${number}` }, poster));
    const play = el('button', { type: 'button', className: 'play', textContent: 'Play' });
    play.setAttribute('aria-label', `Play video ${number}`);
    play.onclick = () => {
      const video = el('video', { controls: true, preload: 'none', src });
      if (poster) video.poster = poster;
      holder.classList.add('playing');
      holder.replaceChildren(video);
      const started = video.play();
      if (started?.catch) started.catch(() => {}); // the controls are right there
    };
    holder.append(play);
    badge(added ? 'New video' : 'Video');
  } else {
    holder.append('Not shown'); // an unknown type or a path outside the allow-list
  }
  return holder;
}

function mediaNodes(v, o) {
  const removed = o ? removedMedia(o, v) : [];
  if (!v.media.length) return [none('No photos or videos'), ...(removed.length ? [removedLine(removed.join(', '))] : [])];
  const before = o ? new Set(o.media.map((m) => m.path)) : null;
  return [
    el('div', { className: 'strip' },
      ...v.media.map((m, i) => thumb(m, i + 1, before !== null && !before.has(m.path)))),
    removed.length ? removedLine(removed.join(', ')) : null,
  ];
}

function coverNode(n) {
  for (const m of n.media) {
    const url = serviceMediaUrl(m.type === 'video' ? m.poster_path : m.path);
    if (url && (m.type === 'photo' || m.type === 'video')) {
      return mediaImg({ className: 'cover', alt: '', loading: 'lazy' }, url);
    }
  }
  return el('span', { className: 'cover' });
}

// What the team reviews, in display order. compareOnly rows are the card's
// header when there is nothing to compare.
const ROWS = [
  { label: 'Title', fields: ['title'], compareOnly: true, render: compareText((n) => n.title) },
  { label: 'Category', fields: ['category', 'other_category_label'], compareOnly: true, render: compareText(categoryText) },
  { label: 'Photos and videos', fields: ['media'], render: mediaNodes },
  {
    label: 'Price',
    fields: ['price_unit', 'base_price_cents', 'size_prices', 'extra_pet_price_cents',
      'weekend_surcharge_pct', 'holiday_surcharge_pct', 'custom_quote'],
    render: priceNodes,
  },
  // Only a visit or a fixed price needs one, so a single service without it
  // doesn't show an empty row; in an edit a change to or from it still does.
  {
    label: 'Duration', fields: ['duration_minutes'], skipIfUnset: true,
    render: compareText((n) => durationLabel(n.duration_minutes)),
  },
  { label: 'Description', fields: ['description'], render: compareText((n) => n.description) },
  { label: "What's included", fields: ['whats_included'], render: listNodes },
  { label: 'Experience', fields: ['experience_note'], render: compareText((n) => n.experience_note) },
  { label: 'Location', fields: ['location_mode', 'service_radius_km', 'address_label'], compareOnly: true, render: compareText(locationText) },
  { label: 'Requirements', fields: ['requirements'], render: requirementNodes },
  { label: 'Extra requirements', fields: ['extra_requirements'], render: compareText((n) => n.extra_requirements) },
  { label: 'Cancellation policy', fields: ['cancellation_policy'], render: compareText(policyText) },
];

const block = (label, ...content) => el('div', { className: 'field' },
  el('span', { className: 'field-label', textContent: label }), ...content);
// `column` names the side in a comparison, for the narrow layout where the two
// sides stack and the LIVE NOW / SUBMITTED heading is hidden.
const panel = (nodes, changed = false, column = '') => {
  const node = el('div', { className: changed ? 'box changed' : 'box' }, ...nodes);
  if (column) node.dataset.col = column;
  return node;
};

// Settings of the service itself: not versioned, so never compared. In the Live
// tab an offline service also says who took it offline and when.
function settingsBlocks(r, queue) {
  const s = r.service ?? {};
  const hours = weeklyHoursLines(s.weekly_hours);
  const by = queue === 'live' && s.status === 'removed' ? offlineNote(s.reviewed_by, s.reviewed_at) : null;
  return [
    s.status === 'removed' && (s.removed_reason || by)
      ? block('Why it was taken offline',
        s.removed_reason ? panel([s.removed_reason]) : null,
        by ? el('span', { className: 'muted', textContent: by }) : null)
      : null,
    block('Weekly hours', panel(hours.length ? hours.map((line) => el('div', { textContent: line })) : [none('No opening hours set')])),
    block('Bookings per day', panel([typeof s.max_bookings_per_day === 'number' ? String(s.max_bookings_per_day) : none()])),
  ];
}

function singleView(r, n, queue) {
  return [
    ...ROWS.filter((row) => !row.compareOnly && !(row.skipIfUnset && row.fields.every((f) => n[f] === null)))
      .map((row) => block(row.label, panel(row.render(n)))),
    ...settingsBlocks(r, queue),
  ];
}

// Live and submitted side by side; changed rows in amber, the rest hidden.
function editView(r) {
  const s = r.service ?? {};
  const a = normaliseVersion(r.live);
  const b = normaliseVersion(r.version);
  const changed = new Set(changedFields(r.live, r.version));
  const labels = changeLabels(r.live, r.version);

  const text = el('span', { className: 'text' }, 'Changed: ');
  if (labels.length) {
    labels.forEach((label, i) => {
      if (i) text.append(i === labels.length - 1 ? ' and ' : ', ');
      text.append(el('b', { textContent: label }));
    });
  } else {
    text.append('nothing visible (the exact location may differ)');
  }
  text.append('. ', s.status === 'removed' ? 'The service is offline and stays offline if you approve.'
    : s.status === 'paused' ? 'The service is paused and stays paused if you approve.'
      : 'Pet parents see the live version until you decide.');
  const summary = el('div', { className: 'summary' }, text);

  const changedRows = [];
  const unchangedRows = [];
  for (const row of ROWS) {
    if (row.fields.some((f) => changed.has(f))) {
      changedRows.push(block(row.label, el('div', { className: 'cols' }, panel(row.render(a), false, 'LIVE NOW'), panel(row.render(b, a), true, 'SUBMITTED'))));
    } else {
      const unchanged = block(row.label, panel(row.render(b)));
      unchanged.hidden = true;
      unchangedRows.push(unchanged);
    }
  }

  if (unchangedRows.length) {
    const toggle = el('button', { type: 'button', className: 'chip small', textContent: 'Show unchanged fields' });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.onclick = () => {
      const open = unchangedRows[0].hidden;
      for (const row of unchangedRows) row.hidden = !open;
      toggle.textContent = open ? 'Hide unchanged fields' : 'Show unchanged fields';
      toggle.setAttribute('aria-expanded', String(open));
    };
    summary.append(toggle);
  }

  return [
    summary,
    changedRows.length ? el('div', { className: 'cols colheads' },
      el('span', { className: 'colhead', textContent: 'LIVE NOW' }),
      el('span', { className: 'colhead', textContent: 'SUBMITTED' })) : null,
    ...changedRows,
    ...unchangedRows,
    ...settingsBlocks(r, 'edits'),
  ];
}

function serviceCard(r, queue) {
  const s = r.service ?? {};
  const shown = queue === 'live' ? (r.live ?? r.version) : (r.version ?? r.live);
  const n = normaliseVersion(shown);
  const title = n.title ?? 'Untitled service';

  const tags = el('div', { className: 'tags' });
  const tag = (kind, label) => tags.append(el('span', { className: kind ? `tag ${kind}` : 'tag', textContent: label }));
  if (queue === 'new') tag('status', 'new service');
  if (queue === 'edits') tag('status', editTagText(s.status));
  if (queue === 'live') tag(s.status === 'live' ? 'status' : 'warn', STATUS_LABELS[s.status] ?? s.status);
  else if (s.status === 'paused' || s.status === 'removed') tag('warn', STATUS_LABELS[s.status]);
  if (queue === 'live' && r.version) tag('added', 'edit waiting for review');
  if (categoryText(n)) tag('', categoryText(n));
  if (locationText(n)) tag('', locationText(n));

  const head = el('div', { className: 'svc-head' },
    coverNode(n),
    el('div', { className: 'svc-title' },
      el('h2', { textContent: title }),
      tags,
      el('span', {}, 'by ', el('strong', { textContent: r.pro?.display_name ?? 'Unknown' }), ` · ${r.pro?.status ?? 'unknown'} professional`),
      queue !== 'live' && r.submitted_at ? el('span', { className: 'waiting', textContent: `Waiting ${waited(r.submitted_at)}` }) : null,
    ));
  return el('article', { className: 'card svc' },
    head,
    ...(queue === 'edits' ? editView(r) : singleView(r, n, queue)),
    serviceActions(r, queue, title));
}

function serviceActions(r, queue, title) {
  const s = r.service ?? {};
  const controls = el('div', { className: 'actions sep' });

  if ((queue === 'new' || queue === 'edits') && r.version?.id) {
    const edit = queue === 'edits';
    const approve = el('button', { className: 'btn', textContent: edit ? 'Approve the change' : 'Approve' });
    approve.onclick = () => {
      const question = edit
        ? `Approve this change to "${title}"? The new version replaces the live one right away and the professional gets an email.${s.status === 'live' ? '' : ` The service stays ${STATUS_LABELS[s.status] ?? s.status}.`}`
        : r.pro?.status === 'approved'
          ? `Approve "${title}"? It goes live right away and the professional gets an email.`
          // A service is public only once its professional is approved (spec §8.1).
          : `Approve "${title}"? It goes live once the professional is approved. The professional gets an email.`;
      if (!confirm(question)) return;
      act('admin_review_service_version', { p_version_id: r.version.id, p_approve: true }, approve);
    };

    const preset = el('select', {}, el('option', { value: '', textContent: 'Choose a reason…' }),
      ...SERVICE_REASONS.map((x) => el('option', { value: x, textContent: x })));
    // The server cuts a reason at 1000 characters, preset and note together, so
    // the note gets what the chosen preset leaves.
    const note = el('textarea', { rows: 3, maxLength: noteLimit('') });
    preset.onchange = () => {
      const limit = noteLimit(preset.value);
      note.maxLength = limit;
      if (note.value.length > limit) note.value = note.value.slice(0, limit);
    };
    const reject = el('button', { className: 'btn secondary', textContent: edit ? 'Reject the change' : 'Reject' });
    reject.onclick = () => {
      const reason = joinReason(preset.value, note.value);
      if (reason.length < 5) {
        return alert(preset.value === 'Other' ? 'Write a note for the professional.' : 'Pick a reason or write a note for the professional.');
      }
      act('admin_review_service_version', { p_version_id: r.version.id, p_approve: false, p_reason: reason }, reject);
    };
    controls.append(
      el('div', { className: 'row' }, approve),
      el('label', {}, 'Reason for rejecting', preset),
      el('label', {}, 'Note for the professional (sent by email)', note),
      el('div', { className: 'row center' }, reject, el('span', {
        className: 'muted',
        textContent: edit ? (s.status === 'live' ? 'The live version stays online.' : 'The live version stays as it is.')
          : 'The professional can fix it and send it again.',
      })),
    );
  }

  if ((queue === 'new' || queue === 'edits') && !r.version?.id) {
    controls.append(el('div', { className: 'row' },
      el('span', { className: 'tag warn', textContent: 'Can’t review: version id missing' })));
  }

  const dashed = controls.children.length > 0;
  const offlineRow = (button, hint) => controls.append(
    el('div', { className: dashed ? 'row center sep dashed' : 'row center' }, button, el('span', { className: 'muted', textContent: hint })));
  if ((queue === 'edits' || queue === 'live') && (s.status === 'live' || s.status === 'paused')) {
    const offline = el('button', { className: 'btn navy', textContent: 'Take the service offline' });
    offline.onclick = () => {
      const answer = prompt(`Why are you taking "${title}" offline? The professional sees this reason.`);
      if (answer === null) return; // cancelled
      const reason = answer.trim();
      if (reason.length < 5) return alert('Give a reason of at least 5 characters.');
      act('admin_set_service_status', { p_service_id: s.id, p_status: 'removed', p_reason: reason }, offline);
    };
    offlineRow(offline, "Hides the live version too. Use for problems that can't wait.");
  } else if (queue === 'live' && s.status === 'removed' && r.live) {
    const back = el('button', { className: 'btn navy', textContent: 'Put back online' });
    back.onclick = () => {
      if (!confirm(`Put "${title}" back online? Pet parents can see and book it again right away.`)) return;
      act('admin_set_service_status', { p_service_id: s.id, p_status: 'live' }, back);
    };
    offlineRow(back, 'Shows the live version to pet parents again.');
  }
  return controls.children.length ? controls : null;
}

// `handle` takes over from the default (alert on error, then reload) and gets
// {data, error}; the card stays locked until it renders something else.
async function act(fn, args, button, handle) {
  // Lock every control on the card so approve and reject can't both be sent.
  const controls = [...button.closest('article').querySelectorAll('button, select, textarea, input')];
  for (const c of controls) c.disabled = true;
  let result;
  try {
    result = await sb.rpc(fn, args);
  } catch (e) {
    result = { data: null, error: { message: e?.message ?? 'network error' } };
  }
  if (handle) return handle(result);
  const { error } = result;
  // Reload either way: after an error the card may be stale (e.g. another
  // reviewer already decided), so it must not stay live.
  if (error) alert(`Couldn't save: ${error.message}`);
  await load();
}

async function openDocument(path, button) {
  // Open the tab synchronously, inside the click, so pop-up blockers allow it;
  // the signed link is fetched afterwards.
  const tab = window.open('about:blank', '_blank');
  if (!tab) return alert('Your browser blocked the pop-up. Allow pop-ups for this page and try again.');
  tab.opener = null; // the document tab must not be able to reach this page
  button.disabled = true;
  const { data, error } = await sb.storage.from('pro-documents').createSignedUrl(path, 600);
  button.disabled = false;
  if (error || !/^https:\/\//.test(data?.signedUrl ?? '')) {
    tab.close();
    return alert(`Couldn't open the document: ${error?.message ?? 'no link came back'}`);
  }
  if (!tab.closed) tab.location.href = data.signedUrl;
}

$('signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('signinBtn').disabled = true;
  $('signinMsg').textContent = '';
  const { error } = await sb.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value,
  });
  $('signinBtn').disabled = false;
  if (error) { $('signinMsg').textContent = error.message; return; }
  $('password').value = '';
  route();
});

$('signout').onclick = async () => {
  await sb.auth.signOut();
  loadSeq++; // a load() still in flight must not render into the cleared list
  rows = [];
  prosLoaded = false;
  expandedPros.clear();
  cancellations.clear();
  cancellationSlots.clear();
  selectedCase = null;
  problemNotice = null;
  requests.reset(); // an answer still on its way is no longer expected
  drafts.clear();
  overlays.clear();
  savedCases.clear();
  caseChats.clear();
  chatPainters.clear();
  health = null;
  selectedReport = null;
  reportTotal = 0;
  reportNotice = null;
  reportDrafts.clear();
  handling.clear();
  payPainters.clear();
  healthNotice = null;
  counts = {};
  exact = new Set();
  activeTab = 'apps';
  renderTabs();
  $('list').replaceChildren(); // no applicant or service data stays in the page
  route();
};

buildTabs();
route();
