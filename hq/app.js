/* =========================================================
   Basha HQ v4.0 — app.js
   Rule: only real data. Two live sources:
     1. Notion, through the Cloudflare bridge (decisions, pipeline, brief, activity, paper fund)
     2. The PumpRadar auto-trader on Railway (wallet, bot mode, trades)
   If a source is down, its cards say so — nothing is simulated to fill the gap.
   ========================================================= */
(() => {
'use strict';

/* ---------- 1. CONFIG ---------- */
const VERSION = 'v4.0';
const BRIDGE = 'https://hq-live-7k2.faisalbasemsalah.workers.dev';
const BOT = 'https://pumpradar-production-37fa.up.railway.app/pub/trader';
const PHASE4 = { start: 20, stop: 10 };
const GH = 'https://github.com/effess96/';
// Fixed schedule of the scheduled tasks + dated items (Amman time). kind 'you' = needs Basha.
const AGENDA = [
  ['Night study', 'team', 0, 10], ['Night study', 'team', 2, 10], ['Night study + vault notes', 'team', 4, 10],
  ['Daily shift · brief, paper prices, DropRadar scan', 'team', 5, 35],
  ['Bot curfew ends · buying allowed', 'bot', 7, 0], ['Bot curfew starts · no new buys', 'bot', 1, 0],
  ['Evening check-in (push to phone)', 'team', 19, 52],
  ['Auto-trader dry-run review → decide', 'you', 18, 45, '2026-10-29'],
  ['Portfolio weekly paper review', 'team', 5, 35, '2026-10-30'],
  ['YieldHour 30-day test starts · security check · bot weekly review', 'you', 10, 0, '2026-11-01'],
  ['Art Studio: first 5 Redbubble designs to approve', 'you', 10, 0, '2026-11-08'],
  ['DP1 listing-ready review', 'you', 10, 0, '2026-11-09'],
  ['DropRadar verdict: go public or stay private', 'you', 10, 0, '2026-11-11'],
  ['Phase 4 · 30-day review', 'you', 10, 0, '2026-11-27'],
  ['YieldHour verdict: scale / iterate / kill', 'you', 10, 0, '2026-11-30']
];
// The team as it really works today (roles from the agent setups)
const TEAM = [
  { id: 'dp', name: 'Digital Products', c: '#22d3ee', role: 'Builds DP1 for Gumroad. Drafts only; Basha approves every listing.' },
  { id: 'ap', name: 'Art Studio', c: '#f472b6', role: 'Draws the 3 icon packs and Redbubble designs. Nothing uploads without approval.' },
  { id: 'ra', name: 'Research Analyst', c: '#2ec4b6', role: 'Facts with source + date; runs the daily DropRadar scan.' },
  { id: 'pr', name: 'PumpRadar Bot', c: '#ff9f1c', role: 'Checks trades against the Phase 4 rules; Sunday review. Never holds keys.' },
  { id: 'pa', name: 'Portfolio Advisor', c: '#3ddc84', role: '$10,000 paper fund: daily prices, weekly review. Paper only.' },
  { id: 'kk', name: 'Knowledge Keeper', c: '#fde68a', role: 'Turns lessons into vault notes for Basha and the team.' },
  { id: 'aa', name: 'Automation Agent', c: '#4c8dff', role: 'Builds A4 Listing Pack Builder; one automation at a time.' },
  { id: 'ca', name: 'Content Agent', c: '#ff7a6b', role: 'Listing copy, pins and build-in-public drafts. Posts nothing.' },
  { id: 'sl', name: 'Skills & Leverage', c: '#a78bfa', role: 'Studying: which skills pay most for the next income streams.' },
  { id: 'hm', name: 'House Manager', c: '#e3b341', role: 'Studying: how to run a bigger team (the future hive).' }
];
const AREA_C = { Trading: '#ff9f1c', 'Digital Products': '#22d3ee', 'Art Studio': '#f472b6', DropRadar: '#3ddc84', YieldHour: '#f5d76e', HQ: '#95a0bb', Agents: '#a78bfa' };
const STAGE_C = { Idea: '#95a0bb', Building: '#6fa3ff', Review: '#f5b94a', Ready: '#a78bfa', Live: '#3ddc84', Earning: '#e6c36f', Parked: '#6b7694' };
const STREAM_ORDER = ['Trading', 'Digital Products', 'Art Studio', 'DropRadar', 'YieldHour', 'HQ'];

/* ---------- 2. STATE + HELPERS ---------- */
const S = { w: null, wOk: null, wAt: 0, b: null, bOk: null, bAt: 0, tab: 'today', logF: 'all' };
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const usd = v => v == null || isNaN(v) ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = v => (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(2);
const tone = v => v > 0.004 ? 'up' : v < -0.004 ? 'down' : '';
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const ammanParts = (ms = Date.now()) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date(ms));
  const g = t => (p.find(x => x.type === t) || {}).value;
  return { y: g('year'), m: g('month'), d: g('day'), h: +g('hour') % 24, mi: +g('minute'), wd: g('weekday') };
};
const todayAmman = () => { const p = ammanParts(); return `${p.y}-${p.m}-${p.d}`; };
const hhmm = ms => { const p = ammanParts(ms); return pad(p.h) + ':' + pad(p.mi); };
const ago = ms => { if (!ms) return 'never'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const until = ms => { const m = Math.round((ms - Date.now()) / 60000); return m < 60 ? `in ${Math.max(0, m)} min` : m < 1440 ? `in ${Math.floor(m / 60)} h ${m % 60} m` : `in ${Math.round(m / 1440)} d`; };
// due date (YYYY-MM-DD) → label + urgency, counted in Amman days
function dueInfo(d) {
  if (!d) return { label: '', cls: '' };
  const days = Math.round((Date.parse(d.slice(0, 10) + 'T00:00:00+03:00') - Date.parse(todayAmman() + 'T00:00:00+03:00')) / 864e5);
  if (days < 0) return { label: `${-days} d late`, cls: 'late' };
  if (days === 0) return { label: 'today', cls: 'soon' };
  if (days === 1) return { label: 'tomorrow', cls: 'soon' };
  const dt = new Date(d.slice(0, 10) + 'T12:00:00+03:00');
  return { label: `${dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Amman' })} · ${days} d`, cls: days <= 3 ? 'soon' : '' };
}
const linkify = s => esc(s).replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1');   // Notion's auto-links → plain text

/* ---------- 3. LOAD ---------- */
async function loadWorld() {
  try {
    const r = await fetch(BRIDGE, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); if (d.error) throw new Error(d.error);
    S.w = d; S.wOk = true; S.wAt = Date.parse(d.updated) || Date.now();
  } catch (e) { S.wOk = false; }
  renderAll();
}
async function loadBot() {
  try {
    const r = await fetch(BOT, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); if (!d || !d.mode) throw new Error('bad data');
    S.b = d; S.bOk = true; S.bAt = Date.now();
  } catch (e) { S.bOk = false; if (!(S.w && S.w.wallet)) loadSolana(); }
  renderMoney(); renderSources();
}
// Last resort when bot AND bridge are down: read the wallet straight from Solana (read-only).
// Same address as the old map: a wallet saved in the old map on this device wins, else the trader bot wallet.
const OLD_WALLET = store.get('bashaHQ.rmWallet2', null) || (() => { try { return localStorage.getItem('bashaHQ.rmWallet2'); } catch (e) { return null; } })();
const WALLET = (OLD_WALLET && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(OLD_WALLET)) ? OLD_WALLET : '76stXq8KvAwdkvvV6ssmZYjdSo3NQSsTN8Zhf9G4oG4A';
const RPCS = ['https://solana-rpc.publicnode.com', 'https://solana.drpc.org', 'https://api.mainnet-beta.solana.com'];
async function loadSolana() {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [WALLET] }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message);
      const px = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd').then(x => x.json()).catch(() => null);
      if (!px || !px.solana) return;
      S.sol = { sol: j.result.value / 1e9, solUsd: px.solana.usd, at: Date.now() }; renderMoney(); return;
    } catch (e) { /* try the next public server */ }
  }
}

/* ---------- 4. TOP: clock + sources ---------- */
function renderClock() {
  const p = ammanParts();
  $('clock').textContent = `${p.wd} ${+p.d} ${new Date().toLocaleDateString('en-GB', { month: 'short', timeZone: 'Asia/Amman' })} · ${pad(p.h)}:${pad(p.mi)} Amman`;
}
function renderSources() {
  const pill = (name, ok, at) => {
    const cls = ok === null ? '' : !ok ? 'bad' : Date.now() - at > 15 * 60000 ? 'stale' : 'ok';
    const txt = ok === null ? 'connecting…' : ok ? ago(at) : 'offline';
    return `<span class="src ${cls}" title="${esc(name)}"><i></i>${esc(name)} · ${txt}</span>`;
  };
  $('sources').innerHTML = pill('Notion', S.wOk, S.wAt) + pill('Trader bot', S.bOk, S.bAt);
}

/* ---------- 5. TODAY: needs you ---------- */
function renderNeeds() {
  const w = S.w, el = $('needs');
  if (S.wOk === null) { el.innerHTML = '<div class="empty">Loading…</div>'; return; }
  if (!S.wOk) { el.innerHTML = '<div class="empty"><b>Notion bridge offline.</b> Decisions can\'t load right now. Open Notion → House Agents → HQ Decisions directly.</div>'; $('needCount').textContent = ''; return; }
  let html = '', n = 0;
  if (Array.isArray(w.decisions)) {
    n += w.decisions.length;
    // due within 3 days (or no date) → full card; later ones fold into one-line rows you can open
    const soon = w.decisions.filter(d => !d.due || dueInfo(d.due).cls), later = w.decisions.filter(d => d.due && !dueInfo(d.due).cls);
    html += soon.map(decisionCard).join('');
    if (later.length) html += `<p class="later-h">Later · ${later.length}</p>` + later.map(d => `<details class="later"><summary><b>${esc(d.title)}</b><span class="due">${esc(dueInfo(d.due).label)}</span><small>Recommended: <em>${esc(d.recommended || '—')}</em></small></summary>${decisionCard(d)}</details>`).join('');
    if (!w.decisions.length) html += '<div class="empty">No open decisions. 👍</div>';
  } else if (w.decisions && w.decisions.error) {
    html += `<div class="empty"><b>Decisions database not readable:</b> ${esc(w.decisions.error)}</div>`;
  } else {
    html += '<div class="empty"><b>Install bridge v2</b> to see decision cards here. Until then, open Notion → HQ Decisions.</div>';
  }
  // today's branches to merge (tick them off once merged)
  const bs = w.briefSections, today = todayAmman();
  if (bs && bs.date === today && bs.branches.length) {
    const ticks = store.get('hq.merged.' + today, {});
    const left = bs.branches.filter(b => !ticks[b]);
    n += left.length ? 1 : 0;
    html += `<div class="card"><p class="sub-head">Merge today's work${left.length ? '' : ' · all done ✓'}</p><ul class="mini-list">${bs.branches.map(b => {
      const m = b.match(/effess96\/([\w.-]+)\s*→\s*([\w/.-]+)/), done = !!ticks[b];
      const url = m ? `${GH}${m[1]}/compare/main...${m[2]}` : '';
      return `<li><span class="ic">${done ? '✓' : '⑂'}</span><div style="flex:1;${done ? 'opacity:.5;text-decoration:line-through' : ''}">${m ? `<b>${esc(m[1])}</b> · ${esc(m[2])}` : esc(b)}${url && !done ? `<div><a href="${esc(url)}" target="_blank" rel="noopener">Open on GitHub →</a></div>` : ''}</div><button class="btn" data-merge="${esc(b)}">${done ? 'Undo' : 'Merged'}</button></li>`;
    }).join('')}</ul><div class="meta">"Merged" is only remembered on this device. GitHub's "nothing to compare" means it's already merged.</div></div>`;
  }
  // leftover "Waiting for Basha" lines from the brief that aren't marked done
  const waits = bs && bs.date === today ? bs.waiting.filter(t => !/^(✅|done\b)/i.test(t)) : [];
  if (waits.length) { n += waits.length; html += `<div class="card"><p class="sub-head">From this morning's brief</p><ul class="mini-list">${waits.map(t => `<li><span class="ic">!</span><span>${linkify(t)}</span></li>`).join('')}</ul></div>`; }
  el.innerHTML = html;
  $('needCount').textContent = n ? String(n) : '';
  el.querySelectorAll('[data-merge]').forEach(b => b.onclick = () => {
    const k = 'hq.merged.' + todayAmman(), t = store.get(k, {}); t[b.dataset.merge] = !t[b.dataset.merge]; store.set(k, t); renderNeeds();
  });
}
function decisionCard(d) {
  const due = dueInfo(d.due), c = AREA_C[d.area] || '#95a0bb';
  const opts = (d.options.length ? d.options : ['(no options written yet)']).map((o, i) => {
    const rec = d.recommended && o.trim().toLowerCase() === d.recommended.trim().toLowerCase();
    return `<div class="opt${rec ? ' rec' : ''}"><span class="n">${i + 1}</span><span>${esc(o)}</span>${rec ? '<span class="tag">Recommended</span>' : ''}</div>`;
  }).join('');
  return `<article class="card">
    <div class="dec-top"><span class="chip area" style="--c:${c}">${esc(d.area || 'General')}</span>${d.by ? `<span>from ${esc(d.by)}</span>` : ''}<span class="due ${due.cls}">${esc(due.label)}</span></div>
    <div class="dec-title">${esc(d.title)}</div>
    <div class="opts">${opts}</div>
    ${d.why ? `<p class="why"><b>Why:</b> ${esc(d.why)}</p>` : ''}
    <div class="dec-actions"><a class="btn gold" href="${esc(d.url)}" target="_blank" rel="noopener">Decide in Notion</a>${d.link ? `<a class="btn" href="${esc(d.link)}" target="_blank" rel="noopener">Open related</a>` : ''}</div>
  </article>`;
}

/* ---------- 6. TODAY: money ---------- */
function renderMoney() {
  const b = S.b, w = S.w || {};
  // Real wallet: the bot reads it itself; the bridge is the fallback
  let val = null, src = '', at = 0;
  if (S.bOk && b.walletUsd != null) { val = b.walletUsd; src = 'trader bot'; at = S.bAt; }
  else if (w.wallet && w.wallet.sol != null && w.wallet.solUsd) { val = w.wallet.sol * w.wallet.solUsd; src = 'Solana via bridge'; at = Date.parse(w.wallet.at) || S.wAt; }
  else if (S.sol) { val = S.sol.sol * S.sol.solUsd; src = 'Solana direct'; at = S.sol.at; }
  const pnl = val == null ? null : val - PHASE4.start, stopped = val != null && val <= PHASE4.stop;
  const pct = val == null ? 50 : Math.max(0, Math.min(100, (val - PHASE4.stop) / (2 * (PHASE4.start - PHASE4.stop)) * 100));
  const real = `<div class="mtile"><div class="lab">Real wallet · Phase 4<span class="badge ${stopped ? 'halt' : 'real'}">${stopped ? 'STOPPED' : 'REAL'}</span></div>
    <div class="big mono">${usd(val)}</div>
    <div class="delta mono ${pnl == null ? 'dim' : tone(pnl)}">${pnl == null ? 'no wallet reading right now' : `${signed(pnl)} (${(pnl / PHASE4.start * 100).toFixed(1)}%) vs $${PHASE4.start} start`}</div>
    <div class="bar"><i style="width:${pct}%"></i></div><div class="scale mono"><span>$${PHASE4.stop} hard stop</span><span>$${PHASE4.start}</span><span>$${PHASE4.start * 1.5}</span></div>
    <div class="meta">${val == null ? 'Bot and bridge both unreachable.' : `${esc(src)} · ${ago(at)}`}${b && b.wallet ? ` · <a href="https://solscan.io/account/${esc(b.wallet)}" target="_blank" rel="noopener">${esc(b.wallet.slice(0, 4))}…${esc(b.wallet.slice(-4))}</a>` : ''}</div></div>`;

  let bot;
  if (!S.bOk) bot = `<div class="mtile"><div class="lab">Auto-trader<span class="badge off">${S.bOk === null ? '…' : 'OFFLINE'}</span></div><div class="big">—</div><div class="meta">${S.bOk === null ? 'Connecting…' : 'Railway not answering. Retrying every 20 s. Telegram /trader still works.'}</div></div>`;
  else {
    const mode = b.halted ? ['HALTED', 'halt'] : ({ live: ['LIVE', 'live'], dry: ['DRY RUN', 'dry'], off: ['OFF', 'off'], 'no-key': ['NO KEY', 'off'], error: ['ERROR', 'halt'] }[b.mode] || [String(b.mode).toUpperCase(), '']);
    const h = ammanParts().h, cf = b.limits && b.limits.curfew || [1, 7], curfew = h >= cf[0] && h < cf[1];
    const status = b.halted ? ['Halted', 'down'] : curfew ? ['Curfew', 'warn'] : ['Hunting', 'up'];
    const st = (k, v, c = '') => `<div class="stat"><span>${k}</span><b class="${c}">${v}</b></div>`;
    const lastLog = (b.log || [])[0];
    bot = `<div class="mtile"><div class="lab">Auto-trader<span class="badge ${mode[1]}">${mode[0]}</span></div>
      <div class="stats">${st('Buys today', `${b.buysToday}/${b.maxBuys}`)}${st('Open', `${(b.positions || []).length}/${b.limits ? b.limits.maxOpen : 4}`)}${st('Realized', usd(b.realizedTodayUsd), tone(b.realizedTodayUsd))}${st('Status', status[0], status[1])}</div>
      ${(b.positions || []).map(p => `<div class="trow mono"><span>${esc(p.sym || '?')}${p.dry ? ' <small class="dim">dry</small>' : ''}</span><span>${usd(p.costUsd)}</span><span class="${p.x > 1 ? 'up' : p.x < 1 ? 'down' : ''}">${p.x == null ? '—' : p.x.toFixed(2) + '×'} · ${p.ageMin}m</span></div>`).join('')}
      <div class="meta">${b.halted && b.haltReason ? `<b class="down">${esc(b.haltReason)}</b> · ` : ''}${lastLog ? `Last: ${esc(lastLog.t)} (${hhmm(lastLog.ts)})` : 'No bot activity yet.'} · kill switch: /stop in Telegram</div></div>`;
  }

  const p = w.paper;
  const paper = `<div class="mtile"><div class="lab">Paper fund · $10,000<span class="badge paper">PAPER</span></div>
    <div class="big mono">${p && p.value != null ? usd(p.value) : '—'}</div>
    <div class="delta mono ${p && p.pnl != null ? tone(p.pnl) : 'dim'}">${p && p.pnl != null ? `${signed(p.pnl)}${p.pnlPct ? ` (${esc(p.pnlPct)})` : ''} · cash ${usd(p.cash)}` : (S.wOk && !S.w.v ? 'needs bridge v2' : 'no snapshot yet')}</div>
    <div class="meta">${p ? `Snapshot ${esc(p.label)} · Portfolio Advisor, Notion` : 'Updated by the 05:35 daily shift on US trading days.'}</div></div>`;
  $('money').innerHTML = real + bot + paper;

  const trades = w.realTrades || [];
  $('trades').innerHTML = trades.length ? `<div class="card" style="margin-top:10px"><p class="sub-head">Real Money Desk · last ${Math.min(5, trades.length)}</p>${trades.slice(0, 5).map(t =>
    `<div class="trow mono"><span>${esc(String(t.token || '?').slice(0, 10))}${t.rules ? '' : ' <small class="down">rule broken</small>'}</span><span>${t.status === 'Open' ? 'open' : esc(t.date || '')}</span><span class="${tone(t.pnl || 0)}">${t.pnl == null ? usd(t.entry) : signed(t.pnl)}</span></div>`).join('')}</div>` : '';
}

/* ---------- 7. TODAY: agenda + done ---------- */
function renderAgenda() {
  const now = Date.now(), today = Date.parse(todayAmman() + 'T00:00:00+03:00'), items = [];
  AGENDA.forEach(([label, kind, h, m, only]) => {
    let t;
    if (only) { t = Date.parse(`${only}T${pad(h)}:${pad(m)}:00+03:00`); if (t <= now) return; }
    else { t = today + (h * 60 + m) * 60000; if (t <= now) t += 864e5; }
    items.push({ label, kind, t });
  });
  items.sort((a, b) => a.t - b.t);
  // keep the next 24 h of routine plus the next 3 dated "you" items
  const soon = items.filter(i => i.t - now < 864e5), later = items.filter(i => i.t - now >= 864e5 && i.kind === 'you').slice(0, 3);
  $('agenda').innerHTML = soon.concat(later).map(i => {
    const sameDay = ammanParts(i.t).d === ammanParts().d;
    const when = sameDay || i.t - now < 864e5 ? hhmm(i.t) : new Date(i.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Amman' });
    return `<li class="${i.kind}"><span class="when">${when}</span><span class="what">${esc(i.label)}</span><span class="in">${until(i.t)}</span></li>`;
  }).join('');
}
function renderDone() {
  const w = S.w, el = $('done');
  if (!S.wOk) { el.innerHTML = '<li class="dim">Notion bridge offline.</li>'; $('briefDate').textContent = ''; return; }
  const bs = w.briefSections, items = bs ? bs.done : (w.brief || []).filter(t => !/^(done|branches|waiting)/i.test(t));
  $('briefDate').textContent = bs && bs.date ? `morning brief · ${bs.date}` : 'morning brief';
  el.innerHTML = items.length ? items.map(t => `<li>${linkify(t)}</li>`).join('') : '<li class="dim">No morning brief yet. The daily shift writes it at 05:35.</li>';
}

/* ---------- 8. PIPELINE ---------- */
function renderPipeline() {
  const w = S.w, el = $('pipeline');
  if (!S.wOk) { el.innerHTML = '<div class="empty">Notion bridge offline.</div>'; return; }
  if (!Array.isArray(w.pipeline)) { el.innerHTML = `<div class="empty">${w.pipeline && w.pipeline.error ? `<b>Pipeline not readable:</b> ${esc(w.pipeline.error)}` : '<b>Install bridge v2</b> to see the pipeline. It lives in Notion → HQ Pipeline.'}</div>`; return; }
  const groups = {};
  w.pipeline.forEach(p => (groups[p.stream || 'Other'] = groups[p.stream || 'Other'] || []).push(p));
  const order = STREAM_ORDER.filter(s => groups[s]).concat(Object.keys(groups).filter(s => !STREAM_ORDER.includes(s)));
  el.innerHTML = order.map(s => `<div class="stream"><div class="stream-h" style="--c:${AREA_C[s] || '#95a0bb'}"><i></i>${esc(s)} · ${groups[s].length}</div>${groups[s].map(p => {
    const due = dueInfo(p.due), pc = Math.max(0, Math.min(100, +p.progress || 0));
    return `<div class="pitem"><div class="pi-top"><span class="pi-name">${esc(p.item)}</span><span class="stage" style="--c:${STAGE_C[p.stage] || '#95a0bb'}">${esc(p.stage || '—')}</span></div>
      <div class="pbar" title="${pc}%"><i style="width:${pc}%"></i></div>
      <div class="pi-next"><span style="flex:1"><b>Next:</b> ${esc(p.next || '—')}</span><span class="due ${due.cls}">${esc(due.label)}</span></div>
      <div class="meta">${pc}% · ${esc(p.owner || '')}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">open</a>` : ''}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">edit in Notion</a>` : ''}</div></div>`;
  }).join('')}</div>`).join('') || '<div class="empty">Pipeline is empty.</div>';
}
function renderDrops() {
  const w = S.w, el = $('drops');
  if (!S.wOk) { el.innerHTML = '<div class="empty">Notion bridge offline.</div>'; $('dropMeta').textContent = ''; return; }
  if (!Array.isArray(w.drops)) { el.innerHTML = '<div class="empty"><b>Install bridge v2</b> to see finds. They live in Notion → DropRadar Finds.</div>'; return; }
  const d = w.drops, jo = d.filter(x => x.track === 'Jordan public').length, cr = d.length - jo;
  $('dropMeta').textContent = d.length ? `${jo} Jordan · ${cr} crypto · validation 29 Oct – 11 Nov` : 'validation 29 Oct – 11 Nov';
  el.innerHTML = d.length ? `<div class="card">${d.slice(0, 10).map((x, i) => {
    const dl = dueInfo(x.deadline);
    return `<div class="drop" style="${i ? 'border-top:1px solid var(--line);padding-top:10px;margin-top:10px' : ''}"><span class="d-name">${esc(x.find)}</span><span class="due ${dl.cls}">${dl.label ? 'ends ' + esc(dl.label) : ''}</span>
      <span class="d-meta">${esc(x.track)} · ${esc(x.type)}${x.value != null ? ` · ~$${x.value}` : ''}${x.minutes != null ? ` · ${x.minutes} min` : ''} · risk ${esc(x.risk || '?')} · ${esc(x.status)}${x.source ? ` · <a href="${esc(x.source)}" target="_blank" rel="noopener">source</a>` : ''}</span></div>`;
  }).join('')}<div class="meta">Scam-checked by Research Analyst. Nothing is entered without you.</div></div>` : '<div class="empty">No finds yet. The first scan runs with the 05:35 daily shift on 29 Oct.</div>';
}

/* ---------- 9. AGENTS ---------- */
function renderHealth() {
  const w = S.w, el = $('health');
  const h = w && w.health;
  const cell = (name, iso, every) => {
    const t = iso ? Date.parse(iso) : 0, age = t ? Date.now() - t : Infinity;
    const cls = !t ? 'bad' : age < every * 1.1 ? 'ok' : age < every * 2.1 ? 'stale' : 'bad';
    return `<div class="hcell ${cls}"><div class="h-name"><i></i>${esc(name)}</div><b>${t ? ago(t) : '—'}</b><small>${t ? 'last logged ' + hhmm(t) : 'no log line found'}</small></div>`;
  };
  if (!S.wOk) { el.innerHTML = '<div class="empty" style="grid-column:1/-1">Notion bridge offline.</div>'; return; }
  if (!h) { el.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Install bridge v2</b> to see when each scheduled run last finished.</div>'; return; }
  el.innerHTML = cell('Daily shift', h.shift, 864e5) + cell('Night study', h.study, 864e5) + cell('Evening check-in', h.checkin, 864e5);
}
function renderAgents() {
  const w = S.w || {}, ag = w.agents || {}, el = $('agents');
  el.innerHTML = TEAM.map(t => {
    const a = ag[t.id] || {}, mems = a.memories || [];
    const act = mems.find(m => !/\(night study\)/i.test(m.text)), studyT = (mems.find(m => /\(night study\)/i.test(m.text)) || {}).t;
    const actAt = act && act.t ? Date.parse(act.t) : 0, stAt = studyT ? Date.parse(studyT) : 0;
    const state = actAt && Date.now() - actAt < 864e5 ? ['active', 'Active today'] : stAt && Date.now() - stAt < 1.3 * 864e5 ? ['study', 'Studying'] : ['', 'Quiet'];
    return `<div class="agent" style="--c:${t.c}"><div class="ag-top"><span class="ag-name">${esc(t.name)}</span><span class="ag-state ${state[0]}">${state[1]}</span></div>
      <div class="ag-role">${esc(t.role)}</div>
      <div class="ag-line"><span>Did</span><p>${act ? `${linkify(act.text.replace(/^[^:]{0,40}:\s*/, ''))} <small>· ${ago(actAt)}</small>` : '<small>No logged work yet.</small>'}</p></div>
      <div class="ag-line"><span>Learned</span><p>${a.lastStudy ? esc(a.lastStudy) : '<small>—</small>'}</p></div></div>`;
  }).join('');
}
function renderLog() {
  const w = S.w, el = $('log'), f = S.logF;
  const kinds = [['all', 'All'], ['basha', 'You'], ['shift', 'Daily shift'], ['study', 'Night study'], ['work', 'Other work']];
  $('logFilters').innerHTML = kinds.map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('');
  $('logFilters').querySelectorAll('button').forEach(b => b.onclick = () => { S.logF = b.dataset.f; renderLog(); });
  if (!S.wOk) { el.innerHTML = '<li class="dim">Notion bridge offline.</li>'; return; }
  if (!w.activity) { el.innerHTML = '<li class="dim">Install bridge v2 to see the full activity log.</li>'; return; }
  const rows = w.activity.filter(a => f === 'all' || a.kind === f || (f === 'work' && a.kind === 'checkin'));
  el.innerHTML = rows.slice(0, 30).map(a => {
    const t = a.t ? Date.parse(a.t) : 0, name = (TEAM.find(x => x.id === a.agent) || {}).name;
    return `<li><div class="l-top"><span class="kind ${a.kind}">${a.kind === 'basha' ? 'you' : a.kind}</span>${name ? `<span>${esc(name)}</span>` : ''}<span style="margin-left:auto" class="mono">${t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Amman' }) + ' ' + hhmm(t) : ''}</span></div>${linkify(a.text)}</li>`;
  }).join('') || '<li class="dim">Nothing in this filter.</li>';
}

/* ---------- 10. TABS + FOOTER ---------- */
function setTab(t) {
  S.tab = t; store.set('hq.tab', t);
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.go === t));
  window.scrollTo({ top: 0 });
}
function renderFoot() {
  $('foot').innerHTML = `<b>Basha HQ ${VERSION}</b> · only live data: Notion (via the bridge) and the trader bot. Agents propose, Basha approves. Paper fund is simulated money; Phase 4 wallet is real.${S.w && !S.w.v ? ' · <b>bridge v1 detected</b>' : ''}`;
}
function renderAll() { renderSources(); renderNeeds(); renderMoney(); renderDone(); renderPipeline(); renderDrops(); renderHealth(); renderAgents(); renderLog(); renderFoot(); }

/* ---------- 11. START ---------- */
function init() {
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.go)));
  const saved = store.get('hq.tab', 'today'); if (['today', 'pipeline', 'agents', 'house'].includes(saved)) setTab(saved);
  renderClock(); renderAgenda(); renderAll();
  loadWorld(); loadBot();
  setInterval(loadWorld, 60000); setInterval(loadBot, 20000);
  setInterval(() => { renderClock(); renderAgenda(); renderSources(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadWorld(); loadBot(); renderClock(); renderAgenda(); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
