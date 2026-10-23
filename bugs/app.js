import { supabaseClient } from '/assets/supabase.js';

const sb = supabaseClient({ persistSession: true });
const $ = (id) => document.getElementById(id);
const STATUSES = [
  ['new', 'New'], ['in_progress', 'In progress'], ['done', 'Done'], ['wont_fix', "Won't fix"],
];
let reports = [];
let filter = 'new';

function show(section) {
  for (const id of ['signin', 'notAdmin', 'setup', 'loadError', 'dash']) $(id).hidden = id !== section;
  $('signout').hidden = section === 'signin';
}

async function route() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('signin');
  const { data: isAdmin, error } = await sb.rpc('is_app_admin');
  // PGRST202: the API can't find the function, i.e. migration 084 isn't live.
  if (error?.code === 'PGRST202') return show('setup');
  if (error) {
    $('loadErrorText').textContent = `Couldn't check access: ${error.message}`;
    return show('loadError');
  }
  if (!isAdmin) {
    $('grantSql').textContent =
      `insert into public.app_admins (user_id)\nvalues ('${session.user.id}');`;
    return show('notAdmin');
  }
  show('dash');
  await load();
}

async function load() {
  $('listMsg').textContent = 'Loading…';
  const { data, error } = await sb
    .from('bug_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    $('listMsg').textContent = `Couldn't load reports: ${error.message}`;
    return;
  }
  reports = data;
  render();
}

function render() {
  const counts = Object.fromEntries(STATUSES.map(([s]) => [s, 0]));
  for (const r of reports) counts[r.status] = (counts[r.status] || 0) + 1;

  const filters = $('filters');
  filters.replaceChildren();
  for (const [value, label] of [...STATUSES, ['all', 'All']]) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(filter === value));
    b.append(label);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = value === 'all' ? reports.length : counts[value];
    b.append(n);
    b.onclick = () => { filter = value; render(); };
    filters.append(b);
  }
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const refresh = document.createElement('button');
  refresh.className = 'chip';
  refresh.textContent = 'Refresh';
  refresh.onclick = load;
  filters.append(spacer, refresh);

  const shown = filter === 'all' ? reports : reports.filter((r) => r.status === filter);
  $('listMsg').textContent = shown.length ? '' : 'Nothing here.';
  $('list').replaceChildren(...shown.map(card));
}

// Report fields are untrusted user input: build every node with
// textContent, never innerHTML.
function card(r) {
  const el = document.createElement('article');
  el.className = 'card report';

  const top = document.createElement('div');
  top.className = 'top';
  const dot = document.createElement('span');
  dot.className = `dot s-${r.status}`;
  const time = document.createElement('time');
  const created = new Date(r.created_at);
  time.dateTime = r.created_at;
  time.textContent = created.toLocaleString();
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Status');
  for (const [value, label] of STATUSES) select.add(new Option(label, value, false, value === r.status));
  select.onchange = async () => {
    select.disabled = true;
    const { error } = await sb.from('bug_reports').update({ status: select.value }).eq('id', r.id);
    select.disabled = false;
    if (error) { alert(`Couldn't update: ${error.message}`); select.value = r.status; return; }
    r.status = select.value;
    render();
  };
  top.append(dot, time, select);

  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = r.description;
  el.append(top, desc);

  if (r.steps) {
    const steps = document.createElement('div');
    steps.className = 'steps';
    steps.textContent = r.steps;
    el.append(steps);
  }

  const tags = document.createElement('div');
  tags.className = 'tags';
  const tag = (text) => { const t = document.createElement('span'); t.className = 'tag'; t.textContent = text; tags.append(t); };
  if (r.app_version) tag(`Zoovo ${r.app_version}${r.build ? ` (${r.build})` : ''}`);
  if (r.platform) tag([r.platform, r.os_version].filter(Boolean).join(' '));
  if (r.screen) tag(`screen: ${r.screen}`);
  if (r.reported_user_id) tag(`user ${r.reported_user_id}`);
  tag(`ref ${r.id.slice(0, 8)}`);
  el.append(tags);

  if (r.contact_email) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.style.margin = '0';
    const a = document.createElement('a');
    a.href = `mailto:${encodeURIComponent(r.contact_email).replace('%40', '@')}?subject=${encodeURIComponent('Your Zoovo bug report')}`;
    a.textContent = r.contact_email;
    p.append('Reply to ', a);
    el.append(p);
  }
  return el;
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

$('signout').onclick = async () => { await sb.auth.signOut(); route(); };

route();
