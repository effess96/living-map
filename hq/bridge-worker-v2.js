/* Basha HQ · Live bridge (Cloudflare Worker) v2.0
   Reads Basha's Notion at the moment HQ opens and returns plain JSON. The Notion key stays here
   as a secret; the website never sees it. Read-only: this worker never writes anything.

   Settings in Cloudflare (Settings → Variables and Secrets) — you already have these:
     NOTION_TOKEN (secret) · PAGE_ID · REAL_DB_ID · WALLET
   New in v2 (optional — the defaults below already point at the right databases):
     DECISIONS_DB_ID · PIPELINE_DB_ID · DROPS_DB_ID

   v2.0 changes
   - Adds: decisions (HQ Decisions), pipeline (HQ Pipeline), DropRadar finds, morning brief split
     into done / branches / waiting, activity log, scheduled-task health, night study, paper snapshot.
   - Keeps every field the old Living Map uses (agents, brief, realTrades, wallet), so it still works. */

const DEFAULTS = {
  DECISIONS_DB_ID: 'e2344009123e4ee99e6794a33df78508',
  PIPELINE_DB_ID: 'e8c140d8a0734cd19ae1183c58b61928',
  DROPS_DB_ID: '0eb9253bd53246a4b02b42d1526bea2e'
};
const AGENTS = {
  hm: ['House Manager'], ra: ['Research Analyst', 'Research'], pa: ['Portfolio Advisor', 'Portfolio'], ca: ['Content Agent'],
  aa: ['Automation Agent', 'Automation'], sl: ['Skills & Leverage', 'Skills and Leverage'], pr: ['PumpRadar Bot'],
  ap: ['Art Studio'], dp: ['Digital Products'], kk: ['Knowledge Keeper']
};
const CACHE_SECONDS = 60;          // Notion is read at most once a minute
const NV = '2022-06-28';

export default {
  async fetch(request, env, ctx) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const cache = caches.default, key = new Request(new URL(request.url).origin + '/world-v2');
    const hit = await cache.match(key);
    if (hit) return hit;
    try {
      const id = k => env[k] || DEFAULTS[k];
      // every source is read in parallel; one failing never breaks the others
      const [lines, realTrades, decisions, pipeline, drops, wallet] = await Promise.all([
        readPage(env),
        env.REAL_DB_ID ? readRealTrades(env).catch(() => null) : null,
        readDecisions(env, id('DECISIONS_DB_ID')).catch(e => ({ error: String(e.message || e) })),
        readPipeline(env, id('PIPELINE_DB_ID')).catch(e => ({ error: String(e.message || e) })),
        readDrops(env, id('DROPS_DB_ID')).catch(e => ({ error: String(e.message || e) })),
        env.WALLET ? readWallet(env.WALLET).catch(() => null) : null
      ]);
      const out = build(lines);
      Object.assign(out, { v: 2, realTrades, decisions, pipeline, drops, wallet });
      const res = new Response(JSON.stringify(out), { headers: cors });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      return new Response(JSON.stringify({ error: 'bridge could not read Notion', v: 2 }), { status: 502, headers: cors });
    }
  }
};

/* ---------- Notion helpers ---------- */
const H = env => ({ Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NV, 'Content-Type': 'application/json' });
const txt = p => (p && (p.title || p.rich_text) || []).map(t => t.plain_text).join('').trim();
const sel = p => p && p.select ? p.select.name : '';
const dat = p => p && p.date ? p.date.start : '';
const num = p => p && typeof p.number === 'number' ? p.number : null;
async function query(env, dbId, body) {
  const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, { method: 'POST', headers: H(env), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('notion ' + r.status + (r.status === 404 ? ' (share this database with the integration)' : ''));
  return (await r.json()).results;
}

// Every block of the page (and one level of children) as plain text lines with their heading
async function readPage(env) {
  const out = [];
  let heading = '';
  const walk = async (id, depth) => {
    let cursor;
    do {
      const r = await fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`, { headers: H(env) });
      if (!r.ok) throw new Error('notion ' + r.status);
      const j = await r.json();
      for (const b of j.results) {
        const data = b[b.type] || {};
        const text = (data.rich_text || []).map(t => t.plain_text).join('').trim();
        if (b.type.startsWith('heading')) { heading = text; continue; }
        if (text) out.push({ heading, text });
        if (b.has_children && depth < 1 && b.type !== 'child_page' && b.type !== 'child_database') await walk(b.id, depth + 1);
      }
      cursor = j.has_more ? j.next_cursor : null;
    } while (cursor);
  };
  await walk(env.PAGE_ID, 0);
  return out;
}

/* ---------- Databases ---------- */
async function readDecisions(env, dbId) {
  const rows = await query(env, dbId, { page_size: 30, filter: { property: 'Status', select: { equals: 'Open' } }, sorts: [{ property: 'Due', direction: 'ascending' }] });
  return rows.map(pg => { const p = pg.properties;
    return { title: txt(p['Decision']), options: txt(p['Options']).split('|').map(s => s.trim()).filter(Boolean), recommended: txt(p['Recommended']),
      why: txt(p['Why']), area: sel(p['Area']), due: dat(p['Due']), by: txt(p['Raised by']), link: p['Link'] && p['Link'].url || '', url: pg.url };
  });
}
async function readPipeline(env, dbId) {
  const rows = await query(env, dbId, { page_size: 50, sorts: [{ property: 'Due', direction: 'ascending' }] });
  return rows.map(pg => { const p = pg.properties;
    return { item: txt(p['Item']), stream: sel(p['Stream']), stage: sel(p['Stage']), progress: num(p['Progress']), next: txt(p['Next step']),
      due: dat(p['Due']), owner: txt(p['Owner']), link: p['Link'] && p['Link'].url || '', url: pg.url, edited: pg.last_edited_time };
  });
}
async function readDrops(env, dbId) {
  const rows = await query(env, dbId, { page_size: 20, sorts: [{ property: 'Found', direction: 'descending' }] });
  return rows.map(pg => { const p = pg.properties;
    return { find: txt(p['Find']), track: sel(p['Track']), type: sel(p['Type']), found: dat(p['Found']), deadline: dat(p['Deadline']),
      value: num(p['Value USD']), minutes: num(p['Minutes to enter']), risk: sel(p['Risk']), status: sel(p['Status']),
      source: p['Source URL'] && p['Source URL'].url || '', url: pg.url };
  });
}
// Real Money Desk (Phase 4): newest 20 trades, only what HQ shows (no wallet data)
async function readRealTrades(env) {
  const rows = await query(env, env.REAL_DB_ID, { page_size: 20, sorts: [{ property: 'Date', direction: 'descending' }] });
  return rows.map(pg => { const p = pg.properties;
    const entry = num(p['Entry USD']), exit = num(p['Exit USD']);
    return { token: txt(p['Token']), date: dat(p['Date']), status: sel(p['Status']) || 'Open', entry, pnl: entry != null && exit != null ? exit - entry : null, rules: !!(p['Followed rules'] && p['Followed rules'].checkbox) };
  });
}
// Public SOL balance of the trading wallet (read-only)
async function readWallet(addr) {
  const r = await fetch('https://api.mainnet-beta.solana.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }) });
  const j = await r.json(); const sol = j.result.value / 1e9;
  const px = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd').then(x => x.json()).catch(() => null);
  return { sol, solUsd: px && px.solana ? px.solana.usd : null, tokens: 0, at: new Date().toISOString() };
}

/* ---------- Page parsing ---------- */
// the agent named FIRST in the line owns it
function agentOf(text) {
  let best = null, at = Infinity;
  for (const [id, names] of Object.entries(AGENTS)) for (const n of names) { const i = text.indexOf(n); if (i >= 0 && i < at) { at = i; best = id; } }
  return best;
}
function dateOf(text) {
  const m = text.match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const dflt = /\(daily shift\)/i.test(text) ? ['05', '45'] : ['09', '00'];   // shift lines carry no time; the shift runs 05:35
  return `${m[1]}T${m[2] || dflt[0]}:${m[3] || dflt[1]}:00+03:00`;
}
function kindOf(text) {
  if (/\(daily shift\)/i.test(text)) return 'shift';
  if (/\(night study\)/i.test(text)) return 'study';
  if (/evening check-in/i.test(text)) return 'checkin';
  const body = text.replace(/^\d{4}-\d{2}-\d{2}[^—]*—\s*/, '');
  if (/^Basha(?! HQ)\b/.test(body)) return 'basha';
  return 'work';
}

function build(lines) {
  const agents = {}, activity = [];
  const add = (id, mem) => { (agents[id] = agents[id] || { memories: [] }).memories.push(mem); };
  for (const { heading, text } of lines) {
    const h = heading.toLowerCase();
    if (h.includes('recent activity')) {
      const id = agentOf(text), t = dateOf(text);
      const clean = text.replace(/^\d{4}-\d{2}-\d{2}[^—]*—\s*/, '');
      activity.push({ t, agent: id, kind: kindOf(text), text: clean.slice(0, 260) });
      if (id) add(id, { t, type: /reflect|lesson|learned/i.test(text) ? 'reflect' : 'act', text: clean.slice(0, 220) });
    } else if (h.includes('reflection')) {
      const id = agentOf(text); if (!id) continue;
      agents[id] = agents[id] || { memories: [] };
      if (!agents[id].reflection) agents[id].reflection = text.replace(/^.*?(—|:)\s*/, '').slice(0, 280);
    }
  }
  for (const a of Object.values(agents)) {
    a.memories = a.memories.slice(0, 5);
    if (a.memories[0]) a.thought = a.memories[0].text.split(/[.;]/)[0].slice(0, 90);
  }

  // Morning brief → done / branches / waiting
  const briefHead = (lines.find(l => l.heading.toLowerCase().startsWith('morning brief')) || {}).heading || '';
  const briefLines = briefHead ? lines.filter(l => l.heading === briefHead).map(l => l.text) : [];
  const sections = { date: (briefHead.match(/\d{4}-\d{2}-\d{2}/) || [''])[0], done: [], branches: [], waiting: [] };
  let cur = 'done';
  for (const t of briefLines) {
    if (/^done$/i.test(t)) { cur = 'done'; continue; }
    if (/^branches/i.test(t)) { cur = 'branches'; continue; }
    if (/^waiting for basha/i.test(t)) { cur = 'waiting'; continue; }
    sections[cur].push(t);
  }

  // Night study (newest section)
  const studyHead = (lines.find(l => /^night study/i.test(l.heading)) || {}).heading || '';
  const study = { date: (studyHead.match(/\d{4}-\d{2}-\d{2}/) || [''])[0], notes: [] };
  if (studyHead) lines.filter(l => l.heading === studyHead && l.text.includes('→') && !l.text.startsWith('[')).forEach(l => {
    const [who, topic] = l.text.split('→').map(s => s.trim());
    study.notes.push({ agent: agentOf(who), who, topic });
    const id = agentOf(who); if (id) { agents[id] = agents[id] || { memories: [] }; agents[id].lastStudy = topic; }
  });

  // Scheduled-task health from the activity log (newest at top)
  const health = {
    shift: (activity.find(a => a.kind === 'shift') || {}).t || null,
    study: (activity.find(a => a.kind === 'study') || {}).t || null,
    checkin: (activity.find(a => a.kind === 'checkin') || {}).t || null
  };

  // Paper portfolio: newest "Snapshot —" section
  const snapHead = (lines.find(l => /^snapshot/i.test(l.heading)) || {}).heading || '';
  let paper = null;
  if (snapHead) {
    const sl = lines.filter(l => l.heading === snapHead).map(l => l.text).join('\n');
    const money = re => { const m = sl.match(re); return m ? +m[1].replace(/,/g, '') : null; };
    paper = { label: snapHead.replace(/^snapshot\s*[—-]\s*/i, ''), value: money(/Current value:\s*\$([\d,]+\.?\d*)/i),
      cash: money(/Cash:\s*\$([\d,]+\.?\d*)/i), pnl: money(/Total P&L:\s*[−-]?\$([\d,]+\.?\d*)/i),
      pnlNeg: /Total P&L:\s*[−-]/i.test(sl), pnlPct: (sl.match(/Total P&L:[^(]*\(([−+-]?[\d.]+%)\)/i) || [, ''])[1] };
    if (paper.pnl != null && paper.pnlNeg) paper.pnl = -paper.pnl;
  }

  return {
    updated: new Date().toISOString(), source: 'notion-live', agents,
    brief: briefLines.slice(0, 6),          // old Living Map
    briefSections: sections, activity: activity.slice(0, 40), health, study, paper
  };
}
