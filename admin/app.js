// supabase.js (UMD) is copied next to this file at build time / by `npm run admin`.
const { createClient } = window.supabase;

// Public project settings (same publishable key the app ships with; all admin power is
// enforced server-side by the admin_* database functions).
const SUPABASE_URL = 'https://qdcdveoidmnwqnabfuvd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hDaXcrVZbq3Dz3iPDDHZhA_xK13buHX';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, storageKey: 'convoy-admin' } });

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtTime = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const ago = (d) => {
  if (!d) return 'never';
  const s = (Date.now() - Date.parse(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const initials = (n) => esc((n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 2600);
}

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    toast(error.message);
    throw error;
  }
  return data;
}

// ─── Auth ───────────────────────────────────────────────────────────────
let signingUp = false;
$('#auth-toggle').onclick = () => {
  signingUp = !signingUp;
  $('#auth-submit').textContent = signingUp ? 'Create account' : 'Sign in';
  $('#auth-toggle').textContent = signingUp ? 'Have an account? Sign in' : 'New here? Create an account';
  $('#auth-sub').textContent = signingUp ? 'Create your Convoy account. You’ll get a confirmation email.' : 'Sign in with your Convoy account.';
  $('#password').autocomplete = signingUp ? 'new-password' : 'current-password';
  $('#auth-msg').textContent = '';
};
$('#auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const msg = $('#auth-msg');
  msg.className = 'msg';
  msg.textContent = '…';
  const creds = { email: $('#email').value.trim(), password: $('#password').value };
  const { data, error } = signingUp ? await sb.auth.signUp({ ...creds, options: { emailRedirectTo: new URL('./', document.baseURI).href } }) : await sb.auth.signInWithPassword(creds);
  if (error) {
    msg.className = 'msg err';
    msg.textContent = error.message;
  } else if (signingUp && !data.session) {
    msg.className = 'msg ok';
    msg.textContent = 'Check your email and click the confirmation link, then sign in here.';
  }
};
const signOut = async () => {
  await sb.auth.signOut();
  route();
};
$('#sign-out').onclick = signOut;
$('#denied-out').onclick = signOut;
sb.auth.onAuthStateChange(() => route());

async function route() {
  const { data } = await sb.auth.getSession();
  const session = data.session;
  $('#auth').classList.toggle('hidden', Boolean(session));
  if (!session) {
    $('#app').classList.add('hidden');
    $('#denied').classList.add('hidden');
    return;
  }
  const isAdmin = await sb.rpc('admin_whoami').then((r) => r.data === true);
  $('#denied').classList.toggle('hidden', isAdmin);
  $('#app').classList.toggle('hidden', !isAdmin);
  if (isAdmin) {
    $('#me').textContent = session.user.email;
    show(current);
  }
}

// ─── Views ──────────────────────────────────────────────────────────────
let current = 'overview';
document.querySelectorAll('nav [data-view]').forEach((b) => (b.onclick = () => show(b.dataset.view)));

function show(view) {
  current = view;
  document.querySelectorAll('nav [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  ({ overview, users, drives, clubs, reports, audit })[view]();
}

async function overview() {
  $('#view').innerHTML = '<h1>Overview</h1><div class="muted">Loading…</div>';
  const s = await rpc('admin_stats');
  const ent = s.entitlements || {};
  const sum = (prefix) => Object.entries(ent).filter(([k]) => k.startsWith(prefix + ':')).reduce((a, [, n]) => a + n, 0);
  const cards = [
    ['Users', s.users], ['New this week', s.users_7d], ['Active this week', s.active_7d], ['Banned', s.banned],
    ['Pro', sum('pro')], ['Clubs plan', sum('club')], ['Style Pack', sum('cosmetics')], ['Paid tickets', s.paid_tickets],
    ['Trips synced', s.trips], ['Kilometers', s.trip_km], ['Live drives', s.active_drives], ['Clubs', s.clubs],
    ['Upcoming events', s.upcoming_events], ['Active reports', s.active_reports],
  ];
  $('#view').innerHTML = `<h1>Overview</h1>
    <div class="grid">${cards.map(([k, v]) => `<div class="stat"><span class="muted">${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <p class="muted" style="margin-top:18px">Paid users by source: ${
      Object.keys(ent).length ? Object.entries(ent).map(([k, v]) => `<span class="chip">${esc(k)} · ${esc(v)}</span>`).join(' ') : 'none yet'
    }</p>`;
}

async function users(search = '') {
  $('#view').innerHTML = `<h1>Users</h1>
    <div class="toolbar"><input id="q" placeholder="Search email, username, name or id" value="${esc(search)}" /></div>
    <div class="card"><div class="table-wrap" id="users-table"><div class="empty">Loading…</div></div></div>`;
  let t;
  $('#q').oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => loadUsers(e.target.value), 300);
  };
  loadUsers(search);
}

async function loadUsers(search) {
  const rows = await rpc('admin_list_users', { p_search: search || null, p_limit: 100, p_offset: 0 });
  if (!rows.length) {
    $('#users-table').innerHTML = '<div class="empty">No users found.</div>';
    return;
  }
  $('#users-table').innerHTML = `<table><thead><tr><th>User</th><th class="hide-sm">Email</th><th>Plan</th><th class="hide-sm">Joined</th><th class="hide-sm">Last seen</th><th>Status</th></tr></thead><tbody>${rows
    .map((u) => {
      const banned = u.banned_until && Date.parse(u.banned_until) > Date.now();
      const status = [
        u.is_admin ? '<span class="chip good">admin</span>' : '',
        banned ? '<span class="chip bad">banned</span>' : '',
        !u.email_confirmed ? '<span class="chip">unconfirmed</span>' : '',
      ].join('');
      return `<tr class="click" data-id="${esc(u.id)}">
        <td><div class="who"><div class="av" style="background:${esc(u.avatar_color || '#555')}">${initials(u.display_name || u.email)}</div>
          <div><div>${esc(u.display_name || '—')}</div><div class="muted" style="font-size:13px">${u.username ? '@' + esc(u.username) : 'no profile yet'}</div></div></div></td>
        <td class="hide-sm">${esc(u.email)}</td>
        <td>${(u.entitlements || []).map((e) => `<span class="chip pro">${esc(e)}</span>`).join('') || '<span class="muted">free</span>'}</td>
        <td class="hide-sm">${fmtDate(u.created_at)}</td>
        <td class="hide-sm">${ago(u.last_sign_in_at)}</td>
        <td>${status}</td></tr>`;
    })
    .join('')}</tbody></table>`;
  document.querySelectorAll('#users-table tr[data-id]').forEach((tr) => (tr.onclick = () => openUser(tr.dataset.id)));
}

async function openUser(id) {
  const d = await rpc('admin_user_detail', { p_user: id });
  const u = d.user || {};
  const p = d.profile || {};
  const banned = u.banned_until && Date.parse(u.banned_until) > Date.now();
  const adminGrants = (d.entitlements || []).filter((e) => e.source === 'admin');
  $('#drawer-root').innerHTML = `<div class="scrim" id="scrim"></div><aside class="drawer">
    <div class="who"><div class="av" style="width:48px;height:48px;font-size:17px;background:${esc(p.avatar_color || '#555')}">${initials(p.display_name || u.email)}</div>
      <div><h2>${esc(p.display_name || u.email)}</h2><div class="muted">${p.username ? '@' + esc(p.username) : 'no profile yet'}</div></div></div>

    <div class="section"><h3>Account</h3><div class="kv">
      <span>Email</span><span>${esc(u.email)}</span>
      <span>User id</span><span style="font-size:12px;word-break:break-all">${esc(u.id)}</span>
      <span>Joined</span><span>${fmtTime(u.created_at)}</span>
      <span>Last sign-in</span><span>${fmtTime(u.last_sign_in_at)}</span>
      <span>Email confirmed</span><span>${u.email_confirmed_at ? 'yes' : 'no'}</span>
      <span>Status</span><span>${banned ? `<span class="chip bad">banned until ${fmtTime(u.banned_until)}</span>` : '<span class="chip good">active</span>'}</span>
      <span>Stripe customer</span><span>${esc(d.stripe_customer || '—')}</span>
    </div></div>

    <div class="section"><h3>Activity</h3><div class="kv">
      <span>Trips</span><span>${esc(d.trips?.count ?? 0)} · ${esc(d.trips?.km ?? 0)} km</span>
      <span>Last trip</span><span>${fmtTime(d.trips?.last)}</span>
      <span>Friends</span><span>${esc(d.friends)}</span>
      <span>Clubs</span><span>${(d.clubs || []).map((c) => `${esc(c.name)} (${esc(c.role)})`).join(', ') || '—'}</span>
      <span>Reports (7 d)</span><span>${esc(d.reports_7d)}</span>
      <span>Devices</span><span>${esc(d.devices)}</span>
    </div></div>

    <div class="section"><h3>Plans</h3>
      <div style="margin-bottom:10px">${(d.entitlements || []).map((e) => `<span class="chip pro">${esc(e.entitlement)} · ${esc(e.source)}${e.expires_at ? ' · until ' + fmtDate(e.expires_at) : ''}</span>`).join('') || '<span class="muted">Free</span>'}</div>
      <div class="btns">
        <button data-grant="pro" data-days="30">Comp Pro 30 days</button>
        <button data-grant="pro" data-days="">Comp Pro forever</button>
        <button data-grant="club" data-days="30">Comp Clubs 30 days</button>
        <button data-grant="cosmetics" data-days="">Give Style Pack</button>
        ${adminGrants.map((e) => `<button class="danger" data-revoke="${esc(e.entitlement)}">Remove comp ${esc(e.entitlement)}</button>`).join('')}
      </div>
      <p class="muted" style="font-size:13px;margin:8px 0 0">Comps are separate from paid subscriptions and are never touched by Stripe or App Store syncs.</p>
    </div>

    <div class="section"><h3>Moderation</h3><div class="btns">
      ${banned
        ? '<button data-ban="">Unban</button>'
        : '<button data-ban="24">Ban 24 hours</button><button data-ban="168">Ban 7 days</button><button class="danger" data-ban="876000">Ban permanently</button>'}
      <button class="danger" id="delete-user">Delete user…</button>
    </div><p class="muted" style="font-size:13px;margin:8px 0 0">Banning signs them out, stops their location sharing and removes them from live drives.</p></div>

    <button class="ghost" id="close">Close</button>
  </aside>`;
  const close = () => ($('#drawer-root').innerHTML = '');
  $('#scrim').onclick = close;
  $('#close').onclick = close;
  const refresh = async (msg) => {
    toast(msg);
    await openUser(id);
    if (current === 'users') loadUsers($('#q')?.value || '');
  };
  document.querySelectorAll('[data-grant]').forEach((b) => (b.onclick = async () => {
    await rpc('admin_set_entitlement', { p_user: id, p_entitlement: b.dataset.grant, p_grant: true, p_days: b.dataset.days ? Number(b.dataset.days) : null });
    refresh('Granted');
  }));
  document.querySelectorAll('[data-revoke]').forEach((b) => (b.onclick = async () => {
    await rpc('admin_set_entitlement', { p_user: id, p_entitlement: b.dataset.revoke, p_grant: false, p_days: null });
    refresh('Removed');
  }));
  document.querySelectorAll('[data-ban]').forEach((b) => (b.onclick = async () => {
    const hours = b.dataset.ban ? Number(b.dataset.ban) : null;
    if (hours && !confirm(`Ban ${u.email}?`)) return;
    await rpc('admin_ban_user', { p_user: id, p_hours: hours });
    refresh(hours ? 'User banned' : 'User unbanned');
  }));
  $('#delete-user').onclick = async () => {
    const typed = prompt(`This permanently deletes ${u.email} and all their trips, friends and clubs they own.\n\nType their email to confirm:`);
    if (!typed) return;
    await rpc('admin_delete_user', { p_user: id, p_confirm_email: typed });
    close();
    toast('User deleted');
    if (current === 'users') loadUsers($('#q')?.value || '');
  };
}

function tableView(title, cols, rows, rowHtml, empty) {
  $('#view').innerHTML = `<h1>${esc(title)}</h1><div class="card"><div class="table-wrap">${
    rows.length
      ? `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table>`
      : `<div class="empty">${esc(empty)}</div>`
  }</div></div>`;
}

async function drives() {
  const rows = await rpc('admin_list_drives');
  tableView('Live drives', ['Drive', 'Code', 'Host', 'People', 'Club', 'Started', ''], rows, (d) => `<tr>
    <td>${esc(d.name)}</td><td><code>${esc(d.code)}</code></td><td>${d.owner ? '@' + esc(d.owner) : '—'}</td>
    <td>${esc(d.members)}</td><td>${esc(d.club || '—')}</td><td>${ago(d.created_at)}</td>
    <td><button class="danger" data-end="${esc(d.id)}">End</button></td></tr>`, 'No drives happening right now.');
  document.querySelectorAll('[data-end]').forEach((b) => (b.onclick = async () => {
    if (!confirm('End this drive for everyone?')) return;
    await rpc('admin_end_drive', { p_id: b.dataset.end });
    toast('Drive ended');
    drives();
  }));
}

async function clubs() {
  const rows = await rpc('admin_list_clubs');
  tableView('Clubs', ['Club', 'Owner', 'Members', 'Upcoming', 'Payouts', 'Created', ''], rows, (c) => `<tr>
    <td><div class="who"><div class="av" style="background:${esc(c.color)}">${initials(c.name)}</div>${esc(c.name)}</div></td>
    <td>${c.owner ? '@' + esc(c.owner) : '—'}</td><td>${esc(c.members)}</td><td>${esc(c.upcoming_events)}</td>
    <td>${c.payouts_ready ? '<span class="chip good">ready</span>' : '<span class="muted">no</span>'}</td><td>${fmtDate(c.created_at)}</td>
    <td><button class="danger" data-del="${esc(c.id)}" data-name="${esc(c.name)}">Delete</button></td></tr>`, 'No clubs yet.');
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`Delete the club "${b.dataset.name}" with all its events and RSVPs? Paid tickets must be refunded in Stripe.`)) return;
    await rpc('admin_delete_club', { p_id: b.dataset.del });
    toast('Club deleted');
    clubs();
  }));
}

async function reports() {
  const rows = await rpc('admin_list_reports');
  tableView('Road reports', ['Type', 'Where', 'Reporter', 'Votes', 'Reported', 'Expires', ''], rows, (r) => `<tr>
    <td>${esc(r.type)}</td>
    <td><a style="color:var(--accent)" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(r.lat)}&mlon=${encodeURIComponent(r.lng)}#map=16/${encodeURIComponent(r.lat)}/${encodeURIComponent(r.lng)}">map</a></td>
    <td>${r.reporter ? '@' + esc(r.reporter) : '—'}</td><td>👍 ${esc(r.confirms)} · 👎 ${esc(r.dismisses)}</td>
    <td>${ago(r.created_at)}</td><td>${fmtTime(r.expires_at)}</td>
    <td><button class="danger" data-rm="${esc(r.id)}">Remove</button></td></tr>`, 'No active reports.');
  document.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
    await rpc('admin_remove_report', { p_id: b.dataset.rm });
    toast('Report removed');
    reports();
  }));
}

async function audit() {
  const rows = await rpc('admin_audit_log', { p_limit: 200 });
  tableView('Audit log', ['When', 'Admin', 'Action', 'Target', 'Details'], rows, (a) => `<tr>
    <td>${fmtTime(a.created_at)}</td><td>${esc(a.admin)}</td><td><span class="chip">${esc(a.action)}</span></td>
    <td style="font-size:12px;word-break:break-all">${esc(a.target)}</td><td style="font-size:12px">${esc(a.details ? JSON.stringify(a.details) : '')}</td></tr>`,
    'Nothing yet. Every admin action is recorded here.');
}

route();
