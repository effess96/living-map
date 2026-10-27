/* =========================================================
   Basha HQ · Living Agents Map v3.0 — script.js
   Everything the map shows lives in ONE object: `world`.
   The house is painted on a <canvas> (a drawing surface) every frame.
   ========================================================= */
(() => {
'use strict';
if (window.__bashaMapLoaded) return;   // safety: never start twice
window.__bashaMapLoaded = true;

/* ---------- 1. CONFIG ---------- */
const MAP_W = 1000, MAP_H = 700, HALL_Y = 315;
const MEMORY_EVERY_MIN = 30;     // each agent logs a memory every 30 sim minutes
const REFLECT_THRESHOLD = 24;    // summed importance that triggers a reflection
const WALK_SPEED = 110;          // map units per real second
const STORE_KEY = 'bashaHQ.livingMap.v2';
// LIVE DATA: your Cloudflare bridge reads Notion at the moment you open the map.
// Paste your Worker URL between the quotes (looks like https://basha-live.<name>.workers.dev).
const WORLD_URL = '';
const LIVE_REFRESH_MIN = 1;    // refresh live data every minute while the map is open

// Risk rules for the paper portfolio. Object.freeze = no agent can change them.
const RULES = Object.freeze({
  startCash: 10000, maxPosition: 0.25, minCash: 0.30,
  stopLoss: -0.08, takeProfit: 0.12, maxTrade: 0.08, tradeEveryMin: 40
});

/* ---------- 2. HOUSE + GARDEN ----------
   Indoor rooms: the top 50 units are the wall (with windows/posters), the rest is floor. */
const ROOMS = {
  study:    { name: 'Study',          x: 50,  y: 75,  w: 175, h: 200, top: true, floor: 'wood',     wall: '#eadcc0', windows: [72] },
  office:   { name: 'Trading Office', x: 225, y: 75,  w: 175, h: 200, top: true, floor: 'tile',     wall: '#dfe7ef', windows: [18, 127] },
  living:   { name: 'Living Room',    x: 400, y: 75,  w: 200, h: 200, top: true, floor: 'wood',     wall: '#f0e2c4', windows: [14, 156] },
  studio:   { name: 'Studio',         x: 600, y: 75,  w: 150, h: 200, top: true, floor: 'carpet',   wall: '#f3dede', windows: [108], carpet: '#b85f63' },
  hall:     { name: 'Hallway',        x: 50,  y: 275, w: 700, h: 75,  floor: 'hall' },
  workshop: { name: 'Workshop',       x: 50,  y: 350, w: 175, h: 225, floor: 'concrete', wall: '#d9dde3' },
  gym:      { name: 'Gym',            x: 225, y: 350, w: 175, h: 225, floor: 'rubber',   wall: '#e2dcf0' },
  kitchen:  { name: 'Kitchen',        x: 400, y: 350, w: 175, h: 225, floor: 'checker',  wall: '#f4ecd6' },
  bedroom:  { name: 'Bedroom',        x: 575, y: 350, w: 175, h: 225, floor: 'carpet',   wall: '#e6e0f2', carpet: '#6f7bc0' },
  garden:   { name: 'Garden',         x: 760, y: 70,  w: 240, h: 520, outdoor: true, spot: { x: 880, y: 340 } }
};
const LAMPS = [[790, 282], [975, 405], [805, 610], [420, 622]];

// Where agents stand inside a room (one slot per agent index, so no one overlaps)
const SPOTS = [[0,0],[-62,34],[62,34],[-62,-22],[62,-22],[0,58],[-30,-40],[30,-40],[-34,18],[34,18]];

/* ---------- 3. AGENTS + DAILY SCHEDULES ----------
   Slot = [startHour, room, activity, [thoughts...], options]
   options: trade (portfolio trades), meet + share (talks to another agent),
            sleep (resting), reflect (forces a reflection on arrival)
   Looks: hair + skin colour and one accessory, drawn as pixel art. */
const AGENTS = [
  { id: 'hm', name: 'House Manager', short: 'HM', color: '#E3B341', home: 'living', hair: '#2b1d14', skin: '#e0ac7e', acc: 'tie',
    role: 'Runs the house: routines, comfort, energy and security checks. Coordinates the whole team.',
    schedule: [
      [0,  'living',  'Night watch', ['Hourly security sweep: all clear', 'Simulated door sensors: OK', 'Night lights at 10%']],
      [6,  'kitchen', 'Morning routine', ['Coffee machine on (simulated)', 'Checking the pantry list', 'Amman weather check']],
      [7,  'living',  'Daily briefing', ["Collecting everyone's plans", "Setting today's priorities", 'Briefing: 3 handoffs scheduled']],
      [9,  'bedroom', 'Comfort & energy check', ['Climate set to 22°C', 'Energy audit: idle devices off', 'Airing out the bedroom']],
      [11, 'living',  'Coordinating the team', ['Routing Research → Portfolio', 'Checking who is blocked', 'Updating world state']],
      [13, 'kitchen', 'Team lunch', ['Team lunch', 'Groceries list: 4 items']],
      [14, 'living',  'Monitoring house state', ['Energy use normal', 'Writing world state to memory', 'All agents on schedule']],
      [18, 'workshop','Sync with Automation', ['Reviewing new automations', 'Anything real-world → ask Basha'], { meet: 'aa', share: 'Asked Automation Agent for a weekly energy report' }],
      [19, 'garden',  'Garden check', ['Garden lights on', 'Watering the plants (simulated)', 'Checking the gate']],
      [20, 'living',  'Evening wind-down', ['Dimming lights to 40%', 'Daily summary for Basha', 'Closing open loops']],
      [22, 'living',  'Night watch', ['Night mode on', 'Security sweep: all clear']]
    ] },
  { id: 'ra', name: 'Research Analyst', short: 'RA', color: '#2EC4B6', home: 'study', hair: '#1d1b26', skin: '#f1c9a5', acc: 'glasses',
    role: 'Reads news, markets, crypto and opportunities. Feeds verified findings to the team.',
    schedule: [
      [0,  'bedroom', 'Idle · queueing news', ['Queueing overnight headlines', 'Low-power mode'], { sleep: true }],
      [7,  'kitchen', 'Breakfast headlines', ['Skimming morning headlines', 'Noting 3 stories to verify']],
      [8,  'study',   'Scanning crypto & airdrops', ['Scanning airdrops for YieldHour', 'Phishing-checking a promo link', 'Tracking SOL ecosystem news', 'Comparing yield rates']],
      [12, 'office',  'Briefing Portfolio Advisor', ['Sharing morning findings', 'Flagging a risky token'], { meet: 'pa', share: 'Shared the morning research brief with Portfolio Advisor' }],
      [13, 'kitchen', 'Team lunch', ['Team lunch', 'Swapping notes with the team']],
      [14, 'study',   'On-chain deep dive', ['Reading on-chain flows', 'Verifying sources', 'Building a watchlist']],
      [17, 'studio',  'Ideas for Content', ['Turning findings into post ideas'], { meet: 'ca', share: "Gave Content Agent 3 post ideas from today's research" }],
      [18, 'study',   'Market wrap', ['Reading the market wrap', 'Summarising the day']],
      [21, 'study',   "Tomorrow's watchlist", ["Writing tomorrow's watchlist", 'Ranking leads by risk']]
    ] },
  { id: 'pa', name: 'Portfolio Advisor', short: 'PA', color: '#3DDC84', home: 'office', hair: '#6b4226', skin: '#c68c5f', acc: 'visor',
    role: 'Manages the $10,000 paper portfolio. Logs every trade and reflection. Never touches real money.',
    schedule: [
      [0,  'bedroom', 'Resting · stops armed', ['Resting — stop-losses armed', 'Overnight: watching only'], { sleep: true }],
      [7,  'kitchen', 'Breakfast', ['Coffee + overnight P&L check']],
      [8,  'office',  'Pre-market risk review', ['Reviewing the locked risk rules', 'Checking cash buffer ≥ 30%', "Planning today's paper trades"]],
      [9,  'office',  'Managing paper positions', ['Watching momentum', 'Checking stop-losses', 'Sizing a paper trade'], { trade: true }],
      [12, 'office',  'Reading the research brief', ["Reading Research Analyst's brief", 'Updating the watchlist']],
      [13, 'kitchen', 'Team lunch', ['Team lunch', 'Explaining P&L to the team']],
      [14, 'office',  'Rebalancing', ['Rebalancing the paper portfolio', 'Trimming winners', 'Logging trades'], { trade: true }],
      [18, 'living',  'Report to House Manager', ['Reporting P&L to House Manager'], { meet: 'hm', share: "Reported today's paper P&L to House Manager" }],
      [19, 'office',  'Reflecting on trades', ["Reflecting on today's trades", 'What would I do differently?', 'Writing the trade journal'], { reflect: true }],
      [21, 'bedroom', 'Resting', ['Resting — positions on watch'], { sleep: true }]
    ] },
  { id: 'ca', name: 'Content Agent', short: 'CA', color: '#FF7A6B', home: 'studio', hair: '#3a1f1f', skin: '#f3d2b3', acc: 'beret',
    role: "Drafts posts and content for Basha's social media and products. Nothing posts without approval.",
    schedule: [
      [0,  'bedroom', 'Resting', ['Resting', 'Dreaming up hooks'], { sleep: true }],
      [8,  'kitchen', 'Breakfast', ['Breakfast + trend check']],
      [9,  'studio',  'Drafting posts', ['Drafting a LinkedIn post on agentic AI', 'Writing 3 hook options', 'Editing for clarity']],
      [12, 'study',   'Research for content', ["Reading Research Analyst's notes", 'Collecting facts for a thread']],
      [13, 'kitchen', 'Team lunch', ['Team lunch']],
      [14, 'studio',  'Product launch visuals', ['Designing listing images for the shops', 'Dark blue + gold palette', 'Exporting drafts']],
      [16, 'garden',  'Fresh-air brainstorm', ['Brainstorming hooks in the garden', 'Sketching a thumbnail idea']],
      [17, 'studio',  'Scheduling posts', ['Queueing posts for approval', "Waiting for Basha's OK"]],
      [19, 'living',  'Testing hooks', ['Testing hooks with House Manager'], { meet: 'hm', share: 'Tested 3 post hooks with House Manager' }],
      [21, 'bedroom', 'Resting', ['Resting'], { sleep: true }]
    ] },
  { id: 'aa', name: 'Automation Agent', short: 'AA', color: '#4C8DFF', home: 'workshop', hair: '#4a3426', skin: '#d9a37c', acc: 'goggles',
    role: 'Finds repetitive tasks and builds automations. Every automation ships with a rollback.',
    schedule: [
      [0,  'workshop','Nightly jobs', ['Running nightly backups (simulated)', 'Checking job logs']],
      [3,  'bedroom', 'Resting', ['Resting — jobs queued'], { sleep: true }],
      [8,  'kitchen', 'Breakfast', ['Breakfast']],
      [9,  'workshop','Mapping repetitive tasks', ['Mapping repetitive tasks', 'Timing a manual workflow', 'Drafting an automation spec']],
      [12, 'office',  'Automating the trade log', ['Automating the paper trade log'], { meet: 'pa', share: 'Proposed auto-logging paper trades to Notion' }],
      [13, 'kitchen', 'Team lunch', ['Team lunch']],
      [14, 'workshop','Notion sync script', ['Building a Notion sync (draft)', 'Testing on dummy data', 'Writing a rollback step']],
      [18, 'workshop','Pairing with House Manager', ['Demoing automations to House Manager']],
      [19, 'gym',     'Workflow session', ['Teaching workflows to Skills & Leverage'], { meet: 'sl', share: 'Ran a workflow session with Skills & Leverage' }],
      [22, 'workshop','Queueing nightly jobs', ['Queueing nightly jobs']]
    ] },
  { id: 'sl', name: 'Skills & Leverage', short: 'SL', color: '#A78BFA', home: 'gym', hair: '#1d1b26', skin: '#b97a56', acc: 'headband',
    role: 'Finds the skills Basha should learn next and the leverage he can use.',
    schedule: [
      [0,  'bedroom', 'Resting', ['Resting'], { sleep: true }],
      [7,  'garden',  'Morning calisthenics', ['Calisthenics plan for Basha', 'Boxing footwork drills']],
      [8,  'kitchen', 'Breakfast', ['Breakfast']],
      [9,  'gym',     'Mapping skill gaps', ['Mapping skill gaps: Python', 'Agentic AI: next lesson?', 'Ranking skills by leverage']],
      [12, 'study',   'Finding courses', ['Finding free courses', 'Comparing 3 learning paths']],
      [13, 'kitchen', 'Team lunch', ['Team lunch']],
      [14, 'gym',     '30-day learning sprint', ['Building a 30-day sprint', 'Splitting lessons into 25-min blocks']],
      [17, 'studio',  'Lessons → content', ['Turning a lesson into content'], { meet: 'ca', share: 'Turned a lesson into a content idea with Content Agent' }],
      [19, 'gym',     'Workflow session', ['Learning workflows from Automation']],
      [22, 'bedroom', 'Resting', ['Resting'], { sleep: true }]
    ] },
  { id: 'pr', name: 'PumpRadar Bot', short: 'PR', color: '#FF9F1C', home: 'office', hair: '#5a3a1a', skin: '#e8b98f', acc: 'cap',
    role: 'Read-only pump.fun analyst. Scores tokens, enforces the rules, keeps a paper journal. Never trades, never touches keys.',
    schedule: [
      [0,  'office',  'Night watch (no entries)', ['Logging overnight launches', 'Rule: no entries after 1 AM']],
      [1,  'bedroom', 'Resting · 1 AM rule', ['Resting — 1 AM rule'], { sleep: true }],
      [8,  'kitchen', 'Breakfast', ['Breakfast + overnight launch log']],
      [9,  'study',   'Narrative scan', ['Scanning narratives from the last 12h', 'Ranking: early + strong']],
      [11, 'office',  'Token autopsies', ['Top 10 hold 38% → SKIP', 'Checking dev wallet history', 'Bundle in block 0? → SKIP', 'Rules 6/6 pass → WATCH']],
      [13, 'kitchen', 'Team lunch', ['Team lunch']],
      [14, 'office',  'Paper journal', ['Logging paper verdicts', 'Updating the ruggers list'], { meet: 'pa', share: 'Compared paper journals with Portfolio Advisor' }],
      [17, 'study',   'Curve watch', ['Mapping wallets above 2%', 'Modelling a graduation dump']],
      [20, 'office',  'Evening autopsies', ['Evening launches: mostly SKIP', 'Tilt check: no revenge entries']],
      [23, 'office',  'Journal close', ['Closing the day in the journal']]
    ] },
  { id: 'ap', name: 'Art Studio', short: 'AS', color: '#F472B6', home: 'studio', hair: '#2a1a3a', skin: '#e8b98f', acc: 'beret',
    role: 'Learns to create every kind of art: illustrations, photo-style images, icons, patterns. Draws vector icons itself, directs image tools for the rest, and sells via print-on-demand, icon packs and stock sites. Nothing goes live without approval.',
    schedule: [
      [0,  'bedroom', 'Resting', ['Resting'], { sleep: true }],
      [8,  'kitchen', 'Breakfast', ['Breakfast + trending styles']],
      [9,  'studio',  'Daily practice', ['Practising a new style: line art', 'Studying composition and colour', 'Critiquing yesterday\'s pieces']],
      [11, 'studio',  'Icon pack', ['Drawing a 24-icon vector set', 'Keeping stroke width consistent']],
      [13, 'kitchen', 'Team lunch', ['Team lunch']],
      [14, 'studio',  'Photo & art prompts', ['Writing prompts for a photo series', 'Picking the best 5 of 40 renders', 'Checking hands, text and artefacts']],
      [16, 'garden',  'Inspiration walk', ['Collecting colour palettes in the garden', 'Light study: golden hour']],
      [17, 'studio',  'Listings', ['Drafting a print-on-demand listing', 'Trademark check before listing', 'Labelling AI-assisted work']],
      [18, 'living',  'Approval queue', ['3 pieces waiting for Basha'], { meet: 'ca', share: 'Handed 3 finished pieces to Content Agent for promo posts' }],
      [21, 'bedroom', 'Resting', ['Resting'], { sleep: true }]
    ] },
  { id: 'dp', name: 'Digital Products Seller', short: 'DP', color: '#22D3EE', home: 'study', hair: '#1d1b26', skin: '#c68c5f', acc: 'glasses',
    role: 'Builds and sells non-security digital products (Notion/Obsidian templates, AI-agent starter kits, prompt packs) on Gumroad. Drafts only; Basha approves every launch.',
    schedule: [
      [0,  'bedroom', 'Resting', ['Resting'], { sleep: true }],
      [8,  'kitchen', 'Breakfast', ['Breakfast + marketplace check']],
      [9,  'study',   'Demand research', ['Which templates sell on Gumroad?', 'Reading 1-star reviews for gaps']],
      [11, 'workshop','Building a template', ['Building a Notion habit tracker', 'Testing it on a fresh account']],
      [13, 'kitchen', 'Team lunch', ['Team lunch']],
      [14, 'study',   'Product page', ['Writing the product page', 'Pricing: $9 / $19 tiers'], { meet: 'aa', share: 'Asked Automation Agent to automate delivery emails' }],
      [17, 'living',  'Launch checklist', ['Launch checklist: waiting for Basha', 'No security topics (employer rule)']],
      [19, 'study',   'Results log', ['Logging views, sales, refunds']],
      [21, 'bedroom', 'Resting', ['Resting'], { sleep: true }]
    ] },
  { id: 'kk', name: 'Knowledge Keeper', short: 'KK', color: '#FDE68A', home: 'study', hair: '#7a7a85', skin: '#f1c9a5', acc: 'glasses',
    role: 'Builds and maintains the Obsidian vault: the team library. Teaches Basha and turns every agent\'s lessons into notes and playbooks the others reuse.',
    schedule: [
      [0,  'bedroom', 'Resting', ['Resting'], { sleep: true }],
      [7,  'kitchen', 'Breakfast', ['Breakfast + reading Notion reflections']],
      [8,  'study',   'Lesson for Basha', ['Writing a 10-minute lesson', 'Adding 3 quiz questions']],
      [10, 'study',   'Linking the vault', ['Linking new notes to Home', 'Merging duplicate notes']],
      [12, 'office',  'Playbook for PumpRadar Bot', ['Turning the autopsy into a playbook'], { meet: 'pr', share: 'Wrote the token-autopsy playbook into the vault' }],
      [13, 'kitchen', 'Team lunch', ['Team lunch']],
      [14, 'study',   'Harvesting lessons', ['Turning reflections into concept notes', 'Glossary: 5 new English–Arabic terms']],
      [16, 'gym',     'Learning plan', ['Matching lessons to skill gaps'], { meet: 'sl', share: 'Synced the lesson plan with Skills & Leverage' }],
      [18, 'study',   'Vault tidy-up', ['Flagging stale facts', 'Updating agent pages']],
      [22, 'bedroom', 'Resting', ['Resting'], { sleep: true }]
    ] }
];

const REFLECTIONS = {
  hm: ['The house runs smoothest when handoffs happen before lunch.',
       'Most energy waste happens in empty rooms — propose an auto lights-off rule.',
       'Night watch was quiet. Keep sweeps hourly but lighter.',
       'The team stays on schedule when I brief at 07:00 sharp.'],
  ra: ['Airdrop chatter is noisy — only a small share of leads pass the phishing check.',
       'Sources that cite on-chain data age better than hype threads.',
       'My best findings came from comparing, not collecting.',
       'Flag risk first, opportunity second — Portfolio Advisor acts faster that way.'],
  pa: [() => { const p = portfolioStats(); return `Paper P&L is ${fmtPct(p.pnlPct)} with ${Math.round(p.cashPct * 100)}% in cash. Locked rules held — none overridden.`; },
       'Small, rule-based trades beat big conviction bets.',
       'Stop-losses did their job. Losing trades stayed small.',
       'Momentum signals were noisy today — size smaller tomorrow.'],
  ca: ['Hooks with a number in them get the clearest reactions.',
       'One idea per post beats three ideas per post.',
       "Everything waits for Basha's approval — that keeps quality high."],
  aa: ['Automate the boring step that happens daily, not the clever one that happens monthly.',
       'Every automation needs a rollback before it ships.',
       'Logging is the automation that pays for itself first.'],
  sl: ['Short daily practice beats long weekend sessions.',
       'Highest-leverage skill this week: building agents end-to-end.',
       'Teaching a skill is the fastest way to check it was learned.'],
  ap: ['Series in one consistent style sell better than random one-offs.',
       'Every piece needs a trademark and likeness check before it is listed.',
       'Daily practice in one style beats dabbling in ten.'],
  dp: ['One useful template beats ten pretty ones.',
       'Buyers pay for saved time — sell the outcome, not the file.',
       'Keep everything away from security topics — employer rule first.'],
  kk: ['A lesson nobody reuses is just a note. Link it or drop it.',
       'Short notes with one idea get reused; long ones get skipped.',
       'Facts that change need a date, or they quietly become wrong.'],
  pr: ['Most launches failed the holder-concentration rule — skipping is the edge.',
       'Night launches broke the rules most often. The 1 AM cutoff earns its place.',
       'A WATCH is not a buy. Most WATCH tokens still faded.']
};

/* ---------- 4. PAPER MARKET (simulated prices, not market data) ---------- */
const ASSETS = [
  { sym: 'BTC', price: 100000, vol: 0.0011,  color: '#F2A541' },
  { sym: 'ETH', price: 4000,   vol: 0.0014,  color: '#8B93FF' },
  { sym: 'SOL', price: 200,    vol: 0.0019,  color: '#36D1C4' },
  { sym: 'XAU', price: 4000,   vol: 0.00035, color: '#D8C27A' },
  { sym: 'SPY', price: 650,    vol: 0.00045, color: '#6FA8FF' }
];

/* ---------- 5. PROJECTS (from 02-project-registry) ---------- */
const PROJECTS = [
  { n: 1,  name: 'House Agents',      status: 'Live',     note: '10 agents · daily shift 05:35', next: 'Read the morning brief' },
  { n: 2,  name: 'Living Agents Map', status: 'Live',     note: 'NitroIDE · v3.0 live',          next: 'Connect the live bridge' },
  { n: 3,  name: 'YieldHour',         status: 'Testing',  note: '30-day test · HR approved', next: 'Log weekly results', test: ['2026-10-19', '2026-11-18'] },
  { n: 4,  name: 'DropRadar',         status: 'Building', note: 'Airdrop radar · pause proposed', next: 'Decide: pause until 18 Nov' },
  { n: 5,  name: 'PumpRadar',         status: 'Live',     note: 'v4 + paper-only lock', next: 'Resolve the real-money deposit' },
  { n: 6,  name: 'Agentic AI Lab',    status: 'Ongoing',  note: 'Learning path', next: 'Next lesson' },
  { n: 7,  name: 'PumpRadar Bot',     status: 'Live',     note: 'Agent #7 · paper only', next: 'First weekly review Sun 1 Nov' },
  { n: 8,  name: 'Art Studio',        status: 'Building', note: 'Agent #8 · Redbubble + Gumroad', next: 'First icon pack' },
  { n: 9,  name: 'Digital Products',  status: 'Building', note: 'Agent #9 · Gumroad', next: 'First product in 14 days' },
  { n: 10, name: 'Knowledge Keeper',  status: 'Building', note: 'Agent #10 · Obsidian vault', next: 'Starter kit + 5 lessons' }
];
const PRIVATE_PROJECTS = 0;
const STATUS_COLORS = { Live: '#3DDC84', Building: '#4C8DFF', Testing: '#F5B94A', Paused: '#8C98B5', Restarting: '#FF7A6B', Ongoing: '#2EC4B6' };

/* ---------- 6. THE WORLD (single source of truth) ---------- */
const world = {
  version: '3.0',
  clock: { sim: 0, speed: 1, live: false, paused: false },
  rooms: ROOMS,
  agents: AGENTS.map((a, i) => ({
    ...a, idx: i,
    x: 0, y: 0, dir: 'down', room: a.home, path: [], walking: false, travel: false, wander: false,
    slot: null, slotKey: '', thought: '', thoughtIdx: 0, nextMemAt: 0, reflectUntil: 0,
    memories: [], reflections: [], imp: 0, nextWander: 0, dayKey: -1
  })),
  feed: [],
  portfolio: {
    cash: RULES.startCash, positions: {}, trades: [], history: [],
    assets: ASSETS.map(a => ({ ...a, hist: [] })), lastMin: 0, nextTradeAt: 0, lastHistMin: 0
  },
  projects: PROJECTS,
  ui: { selected: null, bubbles: 'all', filter: 'all' }
};
window.world = world; // handy for poking around in the browser console

/* ---------- 7. HELPERS ---------- */
const $ = id => document.getElementById(id);
const byId = id => world.agents.find(a => a.id === id);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtUsd = v => usd.format(v);
const fmtSigned = v => (v >= 0 ? '+' : '−') + usd.format(Math.abs(v));
const fmtPct = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(2) + '%';
const hhmm = ms => { const d = new Date(ms); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
const simHour = ms => { const d = new Date(ms); return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600; };
const rand = (a, b) => a + Math.random() * (b - a);
const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = (arr, avoid) => { const opts = arr.length > 1 ? arr.filter(x => x !== avoid) : arr; return opts[Math.floor(Math.random() * opts.length)]; };
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; // repeatable "random" for scenery

// Amman wall-clock time stored as a UTC timestamp (so getUTCHours() = Amman hour)
function ammanNow() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
    const g = t => +parts.find(p => p.type === t).value;
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  } catch (e) { return Date.now() + 3 * 3600 * 1000; }
}

// Sunrise / sunset for Amman (31.95°N, 35.93°E, UTC+3) — simple solar formula
function sunTimes(ms) {
  const d = new Date(ms);
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const rad = Math.PI / 180, lat = 31.95, lon = 35.93;
  const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10));
  const B = 2 * Math.PI * (doy - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad / 15;
  const noon = 12 + (45 - lon) / 15 - eot / 60;
  return { rise: noon - H, set: noon + H };
}
function darkness(ms) {
  const h = simHour(ms), { rise, set } = sunTimes(ms), t = 0.7;
  const ss = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  if (h < rise - t || h > set + t) return 1;
  if (h < rise + t) return 1 - ss((h - (rise - t)) / (2 * t));
  if (h > set - t) return ss((h - (set - t)) / (2 * t));
  return 0;
}
const fmtH = h => pad(Math.floor(h)) + ':' + pad(Math.round((h % 1) * 60) % 60);

/* ---------- 8. GEOMETRY + PATHS ----------
   Agents leave a room through its door, walk along the hallway, and enter the next room.
   The garden is reached through the hallway's east door. */
function roomAt(x, y) {
  if (x >= 758) return 'garden';
  if (y > 277 && y < 352 && x >= 45) return 'hall';
  for (const id in ROOMS) {
    const r = ROOMS[id];
    if (id !== 'hall' && !r.outdoor && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return id;
  }
  return 'hall';
}
function doorX(id) { const r = ROOMS[id]; return r.x + r.w / 2; }
function exitPts(id, lane) {
  if (id === 'garden') return [{ x: 800, y: lane }, { x: 742, y: lane }];
  const r = ROOMS[id], dx = doorX(id);
  return r.top ? [{ x: dx, y: 255 }, { x: dx, y: lane }] : [{ x: dx, y: 415 }, { x: dx, y: lane }];
}
function spotFor(a, id) {
  const r = ROOMS[id], o = SPOTS[a.idx % SPOTS.length];
  const c = r.spot || { x: r.x + r.w / 2, y: r.y + 50 + (r.h - 50) / 2 + 6 };
  const sx = r.w <= 150 ? 0.8 : 1;
  return { x: c.x + o[0] * sx, y: c.y + o[1] * 0.85 };
}
function buildPath(a, to) {
  const from = roomAt(a.x, a.y), lane = HALL_Y + (a.idx - 4.5) * 4;
  if (from === to) return [spotFor(a, to)];
  let pts = from === 'hall' ? [{ x: a.x, y: lane }] : exitPts(from, lane);
  if (to !== 'hall') pts = pts.concat(exitPts(to, lane).reverse());
  pts.push(spotFor(a, to));
  return pts;
}

/* ---------- 9. MEMORY STREAM → REFLECTION ----------
   Every event becomes a memory with an importance score (1–10).
   When enough importance piles up, the agent writes a reflection. */
function remember(a, text, type = 'act', imp = 3, silent = false) {
  const m = { t: world.clock.sim, agent: a.id, text, type, imp };
  a.memories.unshift(m);
  if (a.memories.length > 40) a.memories.pop();
  if (!silent) pushFeed(m);
  if (type !== 'reflect') {
    a.imp += imp;
    if (a.imp >= REFLECT_THRESHOLD) reflect(a);
  }
  return m;
}
function reflect(a) {
  a.imp = 0;
  const pool = REFLECTIONS[a.id] || ['Reviewing what worked today.'];
  const last = a.reflections[0] && a.reflections[0].src;
  const src = pick(pool, last);
  const text = typeof src === 'function' ? src() : src;
  a.reflections.unshift({ t: world.clock.sim, text, src });
  if (a.reflections.length > 10) a.reflections.pop();
  a.reflectUntil = world.clock.sim + 25 * 60000;
  a.thought = 'Reflecting: ' + text;
  remember(a, text, 'reflect', 0);
}

const feedQueue = [];
function pushFeed(m) {
  world.feed.unshift(m);
  if (world.feed.length > 80) world.feed.pop();
  feedQueue.push(m);
}

/* ---------- 10. SCHEDULE ENGINE (perceive → plan → act) ---------- */
function slotIndex(a, ms) {
  const h = simHour(ms); let idx = 0;
  a.schedule.forEach((s, i) => { if (h >= s[0]) idx = i; });
  return idx;
}
function slotObj(a, i) { const s = a.schedule[i]; return { i, start: s[0], room: s[1], activity: s[2], thoughts: s[3], opts: s[4] || {} }; }

function startSlot(a, idx) {
  const s = slotObj(a, idx);
  a.slot = s;
  if (roomAt(a.x, a.y) !== s.room || a.room !== s.room) {
    const fromName = ROOMS[roomAt(a.x, a.y)].name;
    a.path = buildPath(a, s.room); a.walking = true; a.travel = true; a.wander = false;
    a.thought = `Heading to the ${ROOMS[s.room].name}…`;
    remember(a, `Left the ${fromName} for the ${ROOMS[s.room].name}: ${s.activity}`, 'plan', 2);
  } else arrive(a);
}
function arrive(a) {
  const s = a.slot, sim = world.clock.sim;
  a.room = s.room; a.walking = false; a.travel = false; a.thoughtIdx = 0; a.dir = 'down';
  if (sim > a.reflectUntil) a.thought = (a.live && a.live.thought) || s.thoughts[0];
  a.nextMemAt = sim + MEMORY_EVERY_MIN * 60000;
  a.nextWander = performance.now() + rand(5000, 11000);
  remember(a, `Started: ${s.activity}`, 'act', s.opts.sleep ? 1 : 3);
  if (s.opts.meet) {
    const other = byId(s.opts.meet);
    remember(a, s.opts.share, 'social', 5);
    if (other) remember(other, `${a.name}: ${s.opts.share}`, 'social', 4, true);
  }
  if (s.opts.reflect) reflect(a);
}

function simStep() {
  const sim = world.clock.sim;
  const day = Math.floor(sim / 864e5);
  world.agents.forEach(a => {
    if (a.dayKey !== day) {
      if (a.dayKey !== -1) remember(a, `New day planned: ${a.schedule.length} blocks, starting with "${a.schedule[0][2]}"`, 'plan', 2);
      a.dayKey = day;
    }
    const idx = slotIndex(a, sim), key = day + ':' + idx;
    if (key !== a.slotKey) { a.slotKey = key; startSlot(a, idx); }
    if (!a.travel && a.slot && sim >= a.nextMemAt) {
      const s = a.slot;
      a.thoughtIdx = (a.thoughtIdx + 1) % s.thoughts.length;
      if (sim > a.reflectUntil) a.thought = (a.live && a.live.thought) || s.thoughts[a.thoughtIdx];
      if (!a.live) remember(a, s.thoughts[a.thoughtIdx], s.opts.sleep ? 'observe' : 'act', s.opts.sleep ? 1 : 3);
      a.nextMemAt = Math.max(a.nextMemAt + MEMORY_EVERY_MIN * 60000, sim + 60000);
    }
    if (!a.travel && a.slot && sim > a.reflectUntil && a.thought.startsWith('Reflecting')) a.thought = a.slot.thoughts[a.thoughtIdx];
  });
  marketStep();
}

/* ---------- 11. PAPER PORTFOLIO ENGINE ---------- */
function equity() {
  const pf = world.portfolio;
  return pf.cash + pf.assets.reduce((s, as) => s + (pf.positions[as.sym] ? pf.positions[as.sym].qty * as.price : 0), 0);
}
function portfolioStats() {
  const eq = equity();
  return { eq, pnl: eq - RULES.startCash, pnlPct: eq / RULES.startCash - 1, cashPct: world.portfolio.cash / eq };
}
function momentum(as, curMin) {
  const ref = as.hist.find(h => h.m >= curMin - 120) || as.hist[0];
  return ref ? as.price / ref.p - 1 : 0;
}
function marketStep() {
  const pf = world.portfolio, curMin = Math.floor(world.clock.sim / 60000);
  const steps = curMin - pf.lastMin;
  if (steps <= 0) { if (steps < 0) { pf.lastMin = curMin; pf.assets.forEach(as => as.hist = as.hist.filter(h => h.m <= curMin)); } return; }
  pf.lastMin = curMin;
  const loops = Math.min(steps, 30), scale = Math.sqrt(steps / loops);
  for (let i = 0; i < loops; i++) pf.assets.forEach(as => { as.price *= Math.exp(as.vol * scale * randn() + 0.000003 * scale * scale); });
  pf.assets.forEach(as => {
    const last = as.hist[as.hist.length - 1];
    if (!last || curMin - last.m >= 10) { as.hist.push({ m: curMin, p: as.price }); if (as.hist.length > 36) as.hist.shift(); }
  });
  if (curMin - pf.lastHistMin >= 15) { pf.history.push(equity()); if (pf.history.length > 192) pf.history.shift(); pf.lastHistMin = curMin; }
  riskCheck();
  const pa = byId('pa');
  if (pa && pa.slot && pa.slot.opts.trade && !pa.travel && world.clock.sim >= pf.nextTradeAt) {
    pf.nextTradeAt = world.clock.sim + RULES.tradeEveryMin * 60000;
    decideTrade(pa, curMin);
  }
}
function trade(side, sym, qty, reason, tagType = 'trade') {
  const pf = world.portfolio, as = pf.assets.find(x => x.sym === sym), value = qty * as.price;
  let pos = pf.positions[sym] || { qty: 0, avg: 0 };
  if (side === 'BUY') {
    pos = { qty: pos.qty + qty, avg: (pos.qty * pos.avg + value) / (pos.qty + qty) };
    pf.cash -= value;
  } else {
    pos.qty -= qty; pf.cash += value;
    if (pos.qty < 1e-9) pos = null;
  }
  if (pos) pf.positions[sym] = pos; else delete pf.positions[sym];
  const t = { t: world.clock.sim, side, sym, qty, price: as.price, value, reason };
  pf.trades.unshift(t); if (pf.trades.length > 40) pf.trades.pop();
  const pa = byId('pa');
  remember(pa, `${side === 'BUY' ? 'Paper BUY' : 'Paper SELL'} ${fmtQty(qty)} ${sym} @ ${fmtUsd(as.price)} (${fmtUsd(value)}) — ${reason}`, tagType, 5);
  pa.thought = `${side === 'BUY' ? 'Bought' : 'Sold'} ${sym}: ${reason}`;
}
const fmtQty = q => q >= 1 ? q.toFixed(2) : q.toPrecision(3);
function riskCheck() {
  const pf = world.portfolio;
  pf.assets.forEach(as => {
    const pos = pf.positions[as.sym];
    if (pos && as.price / pos.avg - 1 <= RULES.stopLoss) trade('SELL', as.sym, pos.qty, `stop-loss hit at ${fmtPct(as.price / pos.avg - 1)} (locked rule)`, 'risk');
  });
}
function decideTrade(pa, curMin) {
  const pf = world.portfolio, eq = equity();
  for (const as of pf.assets) {
    const pos = pf.positions[as.sym];
    if (pos && as.price / pos.avg - 1 >= RULES.takeProfit) return trade('SELL', as.sym, pos.qty / 2, `take-profit, trimmed half at ${fmtPct(as.price / pos.avg - 1)}`);
  }
  const ranked = pf.assets.map(as => ({ as, mom: momentum(as, curMin) })).sort((a, b) => b.mom - a.mom);
  const best = ranked[0];
  if (best.mom > 0.002 && Math.random() < 0.75) {
    const held = pf.positions[best.as.sym] ? pf.positions[best.as.sym].qty * best.as.price : 0;
    const amt = Math.min(eq * RULES.maxTrade, eq * RULES.maxPosition - held, pf.cash - eq * RULES.minCash);
    if (amt > 50) return trade('BUY', best.as.sym, amt / best.as.price, `2h momentum ${fmtPct(best.mom)}`);
  }
  const worst = ranked.slice().reverse().find(r => pf.positions[r.as.sym]);
  if (worst && worst.mom < -0.004) return trade('SELL', worst.as.sym, pf.positions[worst.as.sym].qty / 2, `weak momentum ${fmtPct(worst.mom)}`);
  remember(pa, 'No paper trade: no setup passed the locked rules', 'observe', 2);
  pa.thought = 'No setup passed the rules — waiting';
}


/* ---------- 11b. LIVE DATA (real agent activity from Notion, via world.json) ----------
   fetch() downloads a file from the internet. If it works, real thoughts, memories,
   reflections, portfolio and projects replace the simulated ones. If not, the map simulates. */
const live = { on: false, updated: null, portfolio: null, brief: [] };
const isoToWall = iso => { const ms = Date.parse(iso || ''); return isNaN(ms) ? world.clock.sim : ms + 3 * 3600 * 1000; }; // Amman wall clock
async function loadLive() {
  try {
    if (!WORLD_URL) throw new Error('no bridge URL yet');
    const res = await fetch(WORLD_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    live.on = true; live.updated = d.updated || null; live.portfolio = d.portfolio || null; live.brief = d.brief || [];
    const seen = new Set(world.feed.map(m => m.agent + '|' + m.text));
    Object.entries(d.agents || {}).forEach(([id, info]) => {
      const a = byId(id); if (!a || !info) return;
      a.live = info;
      if (info.thought) a.thought = info.thought;
      (info.memories || []).slice().reverse().forEach(m => {
        const mem = { t: isoToWall(m.t), agent: id, text: m.text, type: m.type || 'act', imp: m.imp || 3, live: true };
        if (seen.has(id + '|' + m.text)) return;
        seen.add(id + '|' + m.text);
        a.memories.unshift(mem); pushFeed(mem);
      });
      if (info.reflection && (!a.reflections[0] || a.reflections[0].text !== info.reflection)) a.reflections.unshift({ t: isoToWall(d.updated), text: info.reflection });
    });
    if (Array.isArray(d.projects) && d.projects.length) { world.projects = d.projects; buildProjects(); }
    if (live.brief.length) live.brief.slice().reverse().forEach(text => {
      if (seen.has('hm|Brief: ' + text)) return;
      pushFeed({ t: isoToWall(d.updated), agent: 'hm', text: 'Brief: ' + text, type: 'plan', imp: 2, live: true });
    });
  } catch (e) { live.on = false; }
  renderLiveBadge();
}
function renderLiveBadge() {
  const el = $('liveBadge'); if (!el) return;
  if (live.on) {
    const t = live.updated ? hhmm(isoToWall(live.updated)) : '';
    el.className = 'live-badge on'; el.textContent = `LIVE DATA · updated ${t}`;
  } else { el.className = 'live-badge'; el.textContent = 'SIMULATED · no live data yet'; }
}

/* ---------- 12. SAVE / LOAD (this browser only) ---------- */
function save() {
  try {
    const pf = world.portfolio;
    localStorage.setItem(STORE_KEY, JSON.stringify({
      v: 2, feed: world.feed.slice(0, 60),
      agents: Object.fromEntries(world.agents.map(a => [a.id, { memories: a.memories.slice(0, 25), reflections: a.reflections.slice(0, 8).map(r => ({ t: r.t, text: r.text })), imp: a.imp }])),
      pf: { cash: pf.cash, positions: pf.positions, trades: pf.trades.slice(0, 30), history: pf.history, prices: pf.assets.map(a => a.price) }
    }));
  } catch (e) { /* storage blocked — the map still works */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!s || s.v !== 2) return false;
    world.feed = (s.feed || []).filter(m => byId(m.agent));
    world.agents.forEach(a => { const d = s.agents && s.agents[a.id]; if (d) { a.memories = d.memories || []; a.reflections = d.reflections || []; a.imp = d.imp || 0; } });
    const pf = world.portfolio;
    pf.cash = s.pf.cash; pf.positions = s.pf.positions || {}; pf.trades = s.pf.trades || []; pf.history = s.pf.history || [];
    (s.pf.prices || []).forEach((p, i) => { if (pf.assets[i] && p > 0) pf.assets[i].price = p; });
    return true;
  } catch (e) { return false; }
}

/* ---------- 13. PIXEL PAINTER ----------
   R() paints a rectangle in map units. S converts map units → screen pixels. */
let S = 1, g = null, sceneCanvas = null, sctx = null, ctx = null;
const R = (x, y, w, h, c) => {
  const X = Math.round(x * S), Y = Math.round(y * S), W = Math.round((x + w) * S) - X, H = Math.round((y + h) * S) - Y;
  if (W <= 0 || H <= 0) return;
  g.fillStyle = c; g.fillRect(X, Y, W, H);
};
const circ = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x * S, y * S, r * S, 0, Math.PI * 2); g.fill(); };
const oval = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2); g.fill(); };
const OUT = '#3a2c26', WALL = '#4a3a32';
const WINDOWS = [];

// --- furniture kit ---
function box(x, y, w, h, top, front, fh) { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, top); if (front) R(x, y + h - fh, w, fh, front); R(x, y, w, 1.5, 'rgba(255,255,255,.25)'); }
function desk(x, y, w, h) { box(x, y, w, h, '#b07642', '#8a5a32', h * 0.35); }
function monitor(x, y, c) { R(x - 1, y - 1, 22, 15, OUT); R(x, y, 20, 13, '#2b2f3a'); R(x + 2, y + 2, 16, 8, c); R(x + 8, y + 13, 4, 3, '#2b2f3a'); }
function chartMonitor(x, y, c) { monitor(x, y, '#10291f'); [8, 7, 8, 5, 6, 4, 4, 3].forEach((v, i) => R(x + 2 + i * 2, y + v, 2, 1.5, c)); }
function shelf(x, y, w, h) {
  box(x, y, w, h, '#8a5a32');
  const cols = ['#e8505b', '#4c8dff', '#f6d743', '#3ddc84', '#a78bfa', '#ff9f1c', '#f7f3ea'], rowH = (h - 4) / 3;
  for (let r = 0; r < 3; r++) {
    const sy = y + 2 + r * rowH;
    for (let i = x + 3; i < x + w - 4; i += 4) R(i, sy + 1 + rnd() * 2, 3, rowH - 4, cols[Math.floor(rnd() * cols.length)]);
    R(x + 2, sy + rowH - 2, w - 4, 2, '#5b3a20');
  }
}
function plant(x, y) { R(x - 6, y, 12, 10, OUT); R(x - 5, y + 1, 10, 9, '#c0603a'); R(x - 5, y + 1, 10, 2, '#d9774f'); circ(x, y - 5, 8, '#235e27'); circ(x - 3, y - 6, 5, '#3f9a3f'); circ(x + 4, y - 3, 4, '#3a9038'); }
function sofa(x, y, w, h, c, cd) { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, cd); R(x + 6, y + h * 0.35, w - 12, h * 0.65, c); R(x, y, 6, h, cd); R(x + w - 6, y, 6, h, cd); R(x + 6, y + h * 0.35, w - 12, 1.5, 'rgba(255,255,255,.25)'); }
function rug(x, y, w, h, c, b) { R(x, y, w, h, b); R(x + 3, y + 3, w - 6, h - 6, c); R(x + 8, y + 8, w - 16, h - 16, 'rgba(255,255,255,.12)'); R(x + 10, y + 10, w - 20, h - 20, c); }
function bed(x, y, w, h, c) { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, '#8a5a32'); R(x + 3, y + 3, w - 6, h - 6, '#f7f3ea'); R(x + 6, y + 6, w - 12, 12, '#ffffff'); R(x + 3, y + 24, w - 6, h - 27, c); R(x + 3, y + 24, w - 6, 4, 'rgba(255,255,255,.3)'); }
function table(x, y, rx, ry) { oval(x, y + ry * 0.7, rx, ry * 0.5, 'rgba(0,0,0,.15)'); oval(x, y, rx + 1.5, ry + 1.5, OUT); oval(x, y, rx, ry, '#b07642'); oval(x - rx * 0.3, y - ry * 0.3, rx * 0.4, ry * 0.3, '#c88a52'); }
function chair(x, y, c) { R(x - 1, y - 1, 12, 12, OUT); R(x, y, 10, 10, c || '#8a5a32'); R(x, y, 10, 3, 'rgba(255,255,255,.2)'); }
function counter(x, y, w) { box(x, y, w, 26, '#e9eef3', '#a9b8c8', 8); }
function stove(x, y) { box(x, y, 30, 26, '#dfe6ee', '#9fb0c2', 8); circ(x + 8, y + 8, 4, '#2b2f3a'); circ(x + 22, y + 8, 4, '#2b2f3a'); circ(x + 8, y + 8, 1.5, '#e8505b'); }
function sink(x, y) { R(x, y, 18, 12, '#8fb5d0'); R(x + 2, y + 2, 14, 8, '#b9d8ec'); R(x + 8, y - 3, 2, 4, '#8a96a6'); }
function fridge(x, y) { box(x, y, 30, 46, '#f2f5f8', '#d4dce4', 4); R(x + 24, y + 6, 2, 8, '#8a96a6'); R(x + 24, y + 22, 2, 10, '#8a96a6'); R(x, y + 17, 30, 1.5, '#b8c4d0'); }
function tv(x, y, w, h) { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, '#1d2333'); R(x + 3, y + 3, w - 6, h - 6, '#3a6fd8'); R(x + 3, y + 3, w - 6, (h - 6) / 3, '#5b8ff0'); }
function rack(x, y, w, h) { box(x, y, w, h, '#2b2f3a'); for (let j = y + 5; j < y + h - 6; j += 8) { R(x + 3, j, w - 6, 5, '#3d4250'); R(x + w - 7, j + 1.5, 2, 2, '#3ddc84'); } }
function mat(x, y, w, h, c) { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, c); R(x + 4, y + 4, w - 8, h - 8, 'rgba(255,255,255,.1)'); }
function dumbbells(x, y) { box(x, y, 50, 14, '#4a4f5c'); for (let i = 0; i < 4; i++) { R(x + 4 + i * 12, y + 5, 8, 2, '#9aa3b2'); R(x + 3 + i * 12, y + 3, 2, 6, '#1d2333'); R(x + 11 + i * 12, y + 3, 2, 6, '#1d2333'); } }
function punchBag(x, y) { R(x - 1, y - 30, 2, 18, '#4a4f5c'); circ(x, y, 11, OUT); circ(x, y, 10, '#c0392b'); R(x - 6, y - 5, 3, 7, '#e0574a'); }
function pullup(x, y, w) { R(x, y, 4, 40, '#4a4f5c'); R(x + w - 4, y, 4, 40, '#4a4f5c'); R(x, y, w, 4, '#9aa3b2'); }
function mirror(x, y, w, h) { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, '#cfe8f5'); R(x + 5, y + 3, 4, h - 6, '#ffffff'); R(x + 13, y + 3, 2, h - 6, '#ffffff'); }
function poster(x, y, c) { R(x - 1, y - 1, 22, 28, OUT); R(x, y, 20, 26, '#f7f3ea'); R(x + 3, y + 3, 14, 12, c); R(x + 3, y + 18, 14, 2, '#9aa3b2'); R(x + 3, y + 22, 10, 2, '#9aa3b2'); }
function wardrobe(x, y, w, h) { box(x, y, w, h, '#a86f3e', '#8a5a32', 6); R(x + w / 2 - 0.5, y + 3, 1, h - 8, '#5b3a20'); R(x + w / 2 - 4, y + h / 2 - 2, 2, 5, '#e0b04a'); R(x + w / 2 + 2, y + h / 2 - 2, 2, 5, '#e0b04a'); }
function ringLight(x, y) { R(x - 1, y, 2, 30, '#4a4f5c'); circ(x, y, 11, '#ff7a6b'); circ(x, y, 7, '#fff3ef'); }
function camera(x, y) { R(x - 7, y + 10, 1.5, 20, '#2b2f3a'); R(x + 6, y + 10, 1.5, 20, '#2b2f3a'); R(x - 0.5, y + 10, 1.5, 20, '#2b2f3a'); box(x - 8, y, 16, 11, '#2b2f3a'); circ(x + 3, y + 5, 3, '#5b8ff0'); }
function workbench(x, y, w) { box(x, y, w, 24, '#9c6a3c', '#7a4f2a', 8); R(x + 6, y + 4, 10, 3, '#9aa3b2'); R(x + 22, y + 3, 3, 10, '#e8505b'); R(x + 30, y + 5, 12, 4, '#f6d743'); }
function printer3d(x, y) { box(x, y, 30, 30, '#e9eef3', '#a9b8c8', 6); R(x + 5, y + 5, 20, 14, '#2b2f3a'); R(x + 12, y + 10, 6, 4, '#ff9f1c'); }
function crate(x, y) { box(x, y, 22, 18, '#c08a52', '#9c6a3c', 5); R(x, y + 8, 22, 1.5, '#8a5a32'); }
function bowl(x, y) { oval(x, y, 7, 4, '#f7f3ea'); circ(x - 2.5, y - 2, 2.5, '#e8505b'); circ(x + 2.5, y - 2, 2.5, '#f6d743'); circ(x, y - 4, 2.5, '#3ddc84'); }
function beanbag(x, y, c) { oval(x, y, 15, 12, OUT); oval(x, y, 14, 11, c); oval(x - 4, y - 4, 6, 4, 'rgba(255,255,255,.3)'); }
function win(x, y) { R(x - 1, y - 1, 32, 26, OUT); R(x, y, 30, 24, '#f7f3ea'); R(x + 2, y + 2, 26, 20, '#8fd0f2'); R(x + 2, y + 2, 26, 7, '#b7e3f7'); R(x + 14, y + 2, 2, 20, '#f7f3ea'); R(x + 2, y + 11, 26, 2, '#f7f3ea'); R(x - 2, y + 22, 34, 3, '#e2d6c0'); WINDOWS.push({ x, y }); }

// --- outdoor kit ---
function tree(x, y) { oval(x + 3, y + 21, 17, 5, 'rgba(0,0,0,.18)'); R(x - 3, y + 8, 6, 13, '#6b4423'); circ(x, y, 21, '#1f5523'); circ(x, y - 1, 19, '#2f7d32'); circ(x - 6, y - 6, 10, '#3f9a3f'); circ(x + 7, y + 3, 8, '#38903a'); R(x - 10, y - 12, 3, 3, '#6cc35f'); R(x + 4, y - 9, 2, 2, '#6cc35f'); }
function bush(x, y) { oval(x, y + 6, 15, 4, 'rgba(0,0,0,.15)'); oval(x, y, 15, 11, '#1f5523'); oval(x, y - 1, 13, 9, '#3a9038'); oval(x - 4, y - 3, 5, 3, '#5cbc52'); }
function flowers(x, y, n, cols) { for (let i = 0; i < n; i++) { const fx = x + rnd() * 34, fy = y + rnd() * 22, c = cols[i % cols.length]; R(fx, fy + 2, 1.5, 4, '#3f8a36'); R(fx - 1.5, fy, 4.5, 2, c); R(fx - 0.25, fy - 1.25, 2, 4.5, c); R(fx + 0.25, fy + 0.5, 1, 1, '#fff6b0'); } }
function stonePath(x, y, w, h) { R(x, y, w, h, '#c9b07a'); R(x + 2, y + 2, w - 4, h - 4, '#e6d3a3'); for (let i = 0; i < w * h / 150; i++) R(x + 4 + rnd() * (w - 10), y + 4 + rnd() * (h - 10), 4, 3, '#d4bd88'); }
function lamp(x, y) { oval(x, y + 1, 6, 2, 'rgba(0,0,0,.2)'); R(x - 1.5, y - 26, 3, 26, '#3a3f4b'); R(x - 5, y - 33, 10, 8, '#2c313c'); R(x - 3, y - 31, 6, 4, '#ffe9a8'); }

function drawScene() {
  g = sctx; seed = 11; WINDOWS.length = 0;
  // grass
  R(0, 0, MAP_W, MAP_H, '#74c25a');
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * MAP_W, y = rnd() * MAP_H;
    if (x > 40 && x < 760 && y > 65 && y < 585) continue;
    if (i % 3) { R(x, y, 3, 1.5, '#5fae48'); R(x + 1, y - 1.5, 1.5, 1.5, '#5fae48'); } else R(x, y, 2, 2, '#8ed46c');
  }
  // paths
  stonePath(755, 292, 112, 46); stonePath(830, 292, 46, 408);
  // garden: pond, bench, vegetable patch, flower beds
  oval(905, 168, 64, 40, '#3c7fae'); oval(905, 168, 59, 35, '#5fb6e8'); oval(888, 158, 30, 13, '#7fcaf0');
  [[874, 182], [934, 158], [918, 190]].forEach(([x, y]) => { oval(x, y, 7, 4.5, '#3f9a3f'); R(x - 1, y - 4.5, 2, 4, '#5fb6e8'); });
  circ(934, 156, 1.6, '#f49ac1');
  [[842, 148], [848, 194], [968, 148], [962, 193], [905, 127], [905, 210]].forEach(([x, y]) => { oval(x, y, 6, 4, '#7d808a'); oval(x - 1, y - 1, 4, 2.5, '#b5b8c2'); });
  R(890, 244, 52, 6, '#8a5a32'); R(890, 251, 52, 6, '#a86f3e'); R(893, 257, 4, 9, '#5b3a20'); R(935, 257, 4, 9, '#5b3a20');
  R(888, 422, 98, 112, '#5a361f'); R(890, 424, 94, 108, '#6e4428');
  for (let r = 0; r < 5; r++) { R(890, 444 + r * 21, 94, 2.5, '#5a361f'); for (let c = 0; c < 8; c++) { R(895 + c * 11, 430 + r * 21, 6, 5, '#3f9a3f'); R(897 + c * 11, 427 + r * 21, 2, 3, '#7ed957'); if ((r + c) % 3 === 0) R(896 + c * 11, 432 + r * 21, 2, 2, '#e8505b'); } }
  flowers(782, 362, 9, ['#e8505b', '#f6d743']); flowers(785, 520, 9, ['#f49ac1', '#ffffff']); flowers(930, 300, 9, ['#f6d743', '#a78bfa']);
  flowers(782, 200, 7, ['#ffffff', '#e8505b']);
  // front yard
  flowers(80, 600, 10, ['#e8505b', '#f6d743', '#ffffff']); flowers(250, 605, 10, ['#f49ac1', '#ffffff']); flowers(540, 600, 10, ['#f6d743', '#e8505b']); flowers(690, 612, 9, ['#a78bfa', '#ffffff']);
  bush(170, 630); bush(330, 640); bush(600, 640); bush(760, 625);
  R(906, 652, 4, 22, '#5b3a20'); R(898, 642, 20, 12, OUT); R(899, 643, 18, 10, '#3a6fd8'); R(913, 645, 3, 4, '#e8505b');
  // fence along the bottom with a gate gap for the path
  const fence = (x1, x2) => { R(x1, 684, x2 - x1, 3, '#f4efe2'); R(x1, 693, x2 - x1, 3, '#f4efe2'); for (let x = x1; x < x2; x += 14) { R(x - 0.5, 678, 5, 20, '#b9b1a0'); R(x, 678, 4, 19, '#f4efe2'); } };
  fence(0, 826); fence(882, 1000);
  // trees around the edges
  const trees = [];
  for (let x = 18; x < 1000; x += 56) trees.push([x, 30]);
  for (let y = 120; y < 580; y += 64) trees.push([18, y]);
  for (let y = 250; y < 400; y += 70) trees.push([982, y]);
  [[982, 560], [40, 640], [470, 645], [690, 660], [960, 640]].forEach(t => trees.push(t));
  trees.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => tree(x, y));
  LAMPS.forEach(([x, y]) => lamp(x, y));
  drawHouse();
}

function drawFloor(r) {
  const { x, y, w, h } = r;
  switch (r.floor) {
    case 'wood': R(x, y, w, h, '#d39a5f'); for (let j = 0; j < h; j += 10) { R(x, y + j, w, 1, '#b9814c'); for (let i = (j / 10) % 2 ? 20 : 0; i < w; i += 40) R(x + i, y + j, 1, 10, '#b0773f'); } break;
    case 'hall': R(x, y, w, h, '#b88452'); for (let j = 0; j < h; j += 10) R(x, y + j, w, 1, '#a2713f');
      R(x + 14, y + 22, w - 28, 34, '#a8403f'); R(x + 14, y + 22, w - 28, 2, '#e0b04a'); R(x + 14, y + 54, w - 28, 2, '#e0b04a');
      for (let i = x + 26; i < x + w - 26; i += 18) R(i, y + 37, 6, 4, '#c25a4a'); break;
    case 'tile': R(x, y, w, h, '#dce6ef'); for (let i = 0; i < w; i += 25) R(x + i, y, 1, h, '#b8c7d6'); for (let j = 0; j < h; j += 25) R(x, y + j, w, 1, '#b8c7d6'); break;
    case 'checker': for (let i = 0; i < w; i += 25) for (let j = 0; j < h; j += 25) R(x + i, y + j, Math.min(25, w - i), Math.min(25, h - j), ((i + j) / 25) % 2 ? '#d8d2c2' : '#f2efe6'); break;
    case 'carpet': R(x, y, w, h, r.carpet); for (let i = 4; i < w; i += 8) for (let j = 4; j < h; j += 8) R(x + i, y + j, 1.5, 1.5, 'rgba(255,255,255,.12)'); break;
    case 'concrete': R(x, y, w, h, '#a9b0b9'); for (let k = 0; k < w * h / 120; k++) R(x + rnd() * w, y + rnd() * h, 2, 2, '#979ea8'); break;
    case 'rubber': R(x, y, w, h, '#3d4458'); for (let k = 0; k < w * h / 90; k++) R(x + rnd() * w, y + rnd() * h, 1.5, 1.5, '#56607a'); break;
  }
}
function drawWallFace(r) {
  R(r.x, r.y, r.w, 50, r.wall);
  for (let i = r.x + 6; i < r.x + r.w; i += 12) R(i, r.y + 6, 1, 39, 'rgba(0,0,0,.05)');
  R(r.x, r.y, r.w, 6, WALL); R(r.x, r.y + 45, r.w, 5, '#9a6e48'); R(r.x, r.y + 50, r.w, 2, 'rgba(0,0,0,.12)');
  (r.windows || []).forEach(wx => win(r.x + wx, r.y + 12));
}

function drawHouse() {
  R(51, 76, 710, 510, 'rgba(0,0,0,.22)');           // house shadow
  R(45, 70, 710, 510, OUT);                         // outer walls
  for (const id in ROOMS) if (!ROOMS[id].outdoor) drawFloor(ROOMS[id]);
  for (const id in ROOMS) { const r = ROOMS[id]; if (!r.outdoor && id !== 'hall') drawWallFace(r); }
  // walls between rooms
  [[225, 75, 200], [400, 75, 200], [600, 75, 200], [225, 350, 225], [400, 350, 225], [575, 350, 225]].forEach(([x, y, h]) => { R(x - 3, y, 6, h, WALL); R(x - 3, y, 1.5, h, '#5e4a3f'); });
  // wall between the top rooms and the hallway, with doors
  let cur = 50;
  ['study', 'office', 'living', 'studio'].map(doorX).forEach(dx => { R(cur, 270, dx - 18 - cur, 7, WALL); R(dx - 14, 272, 28, 6, '#9c5b3b'); cur = dx + 18; });
  R(cur, 270, 750 - cur, 7, WALL);
  // doorways into the bottom rooms
  ['workshop', 'gym', 'kitchen', 'bedroom'].forEach(id => {
    const dx = doorX(id), y = ROOMS[id].y;
    R(dx - 17, y + 6, 34, 44, '#c99560'); for (let j = 10; j < 50; j += 10) R(dx - 17, y + j, 34, 1, '#b07f4c');
    R(dx - 20, y, 3, 50, '#6b4a35'); R(dx + 17, y, 3, 50, '#6b4a35'); R(dx - 20, y, 40, 6, WALL);
  });
  // east door to the garden
  R(748, 288, 9, 54, '#b88452'); R(758, 296, 10, 38, '#9c5b3b');
  furnish();
}

function furnish() {
  let r = ROOMS.study, x = r.x, y = r.y;
  rug(x + 38, y + 148, 100, 38, '#5a8f8a', '#3f6f6a');
  shelf(x + 10, y + 22, 48, 46); shelf(x + 117, y + 22, 48, 46);
  desk(x + 52, y + 96, 72, 24); monitor(x + 77, y + 86, '#2ec4b6'); chair(x + 83, y + 126);
  plant(x + 158, y + 180); plant(x + 18, y + 180);

  r = ROOMS.office; x = r.x; y = r.y;
  desk(x + 12, y + 74, 150, 24);
  chartMonitor(x + 25, y + 64, '#3ddc84'); chartMonitor(x + 77, y + 64, '#ff6b6b'); chartMonitor(x + 129, y + 64, '#3ddc84');
  chair(x + 30, y + 104); chair(x + 82, y + 104); chair(x + 134, y + 104);
  table(x + 87, y + 162, 22, 13); plant(x + 160, y + 180); plant(x + 14, y + 180);

  r = ROOMS.living; x = r.x; y = r.y;
  rug(x + 36, y + 90, 124, 84, '#e3b341', '#b8913a');
  tv(x + 72, y + 14, 56, 30); box(x + 66, y + 50, 68, 10, '#8a5a32');
  box(x + 78, y + 112, 44, 20, '#b07642', '#8a5a32', 6); bowl(x + 100, y + 120);
  sofa(x + 55, y + 148, 90, 26, '#c0504d', '#93393a');
  desk(x + 152, y + 80, 42, 24); monitor(x + 154, y + 71, '#e3c26b'); monitor(x + 172, y + 71, '#e3c26b');
  plant(x + 14, y + 180); plant(x + 186, y + 180);

  r = ROOMS.studio; x = r.x; y = r.y;
  R(x + 10, y + 10, 68, 5, '#4a4f5c'); R(x + 12, y + 14, 64, 40, '#ffd9cf'); R(x + 12, y + 50, 64, 24, '#ffe7e0');
  ringLight(x + 26, y + 100); camera(x + 60, y + 104);
  desk(x + 96, y + 72, 46, 22); monitor(x + 108, y + 63, '#ff7a6b');
  beanbag(x + 118, y + 165, '#2ec4b6'); plant(x + 16, y + 180);

  r = ROOMS.workshop; x = r.x; y = r.y;
  poster(x + 22, y + 12, '#4c8dff'); poster(x + 112, y + 12, '#ff9f1c');
  workbench(x + 8, y + 58, 58); chair(x + 30, y + 90, '#4a4f5c');
  rack(x + 140, y + 40, 26, 64); printer3d(x + 16, y + 168); crate(x + 118, y + 186); crate(x + 142, y + 196);

  r = ROOMS.gym; x = r.x; y = r.y;
  pullup(x + 10, y + 16, 50); mirror(x + 112, y + 10, 52, 32);
  mat(x + 18, y + 112, 64, 86, '#7b6bd6'); dumbbells(x + 112, y + 64); punchBag(x + 142, y + 162);
  circ(x + 106, y + 206, 5, '#1d2333'); circ(x + 120, y + 206, 5, '#1d2333');

  r = ROOMS.kitchen; x = r.x; y = r.y;
  counter(x + 5, y + 40, 30); sink(x + 11, y + 46); stove(x + 35, y + 40);
  counter(x + 108, y + 40, 26); fridge(x + 138, y + 22);
  chair(x + 48, y + 140); chair(x + 117, y + 140); chair(x + 82, y + 118); chair(x + 82, y + 166);
  table(x + 87, y + 146, 30, 17); bowl(x + 87, y + 143); plant(x + 16, y + 205);

  r = ROOMS.bedroom; x = r.x; y = r.y;
  rug(x + 36, y + 150, 96, 50, '#a78bfa', '#7a62c8');
  wardrobe(x + 6, y + 26, 46, 44);
  box(x + 100, y + 52, 16, 14, '#a86f3e', '#8a5a32', 5); circ(x + 108, y + 50, 3.5, '#ffe9a8');
  bed(x + 120, y + 46, 46, 76, '#5a67c8'); plant(x + 18, y + 205);
}

/* ---------- 14. PIXEL CHARACTERS ----------
   Each agent is a 12×16 pixel sprite. Letters = colours:
   o outline · h hair · s skin · e eyes · c shirt (agent colour) · d belt · p trousers · b shoes */
const SPR = {
  down: ['...oooooo...', '..ohhhhhho..', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohssssssho.', '.osesssseso.', '.osssssssso.', '..osssssso..'],
  up:   ['...oooooo...', '..ohhhhhho..', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '..ohhhhhho..'],
  side: ['...oooooo...', '..ohhhhhho..', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhsssso.', '.ohhhssesso.', '.ohhsssssso.', '..osssssso..']
};
const BODY_FRONT = ['.o' + 'c'.repeat(8) + 'o.', 'os' + 'c'.repeat(8) + 'so', 'os' + 'c'.repeat(8) + 'so', 'os' + 'c'.repeat(8) + 'so', '.o' + 'd'.repeat(8) + 'o.'];
const BODY_SIDE = ['..o' + 'c'.repeat(6) + 'o..', '..occcscco..', '..occcscco..', '..o' + 'c'.repeat(6) + 'o..', '..o' + 'd'.repeat(6) + 'o..'];
const LEGS = {
  stand: ['..oppooppo..', '..oppooppo..', '..obboobbo..'],
  a:     ['..oppooppo..', '..obbooppo..', '...oo.obbo..'],
  b:     ['..oppooppo..', '..oppoobbo..', '..obbo.oo...'],
  sideStand: ['...oppppo...', '...oppppo...', '...obbbbo...'],
  sideStep:  ['..oppooppo..', '..oppooppo..', '..obbo.obbo.']
};

function drawAgent(a, now) {
  const p = 2, step = a.walking ? Math.floor(now / 150) % 2 : -1;
  const bob = step === 1 ? -1 : 0, ox = a.x - 12, oy = a.y - 32 + bob;
  const dir = a.dir || 'down', flip = dir === 'left', side = dir === 'left' || dir === 'right';
  const head = side ? SPR.side : SPR[dir], body = side ? BODY_SIDE : BODY_FRONT;
  const legs = side ? (step === 1 ? LEGS.sideStep : LEGS.sideStand) : (step === 0 ? LEGS.a : step === 1 ? LEGS.b : LEGS.stand);
  const pal = { o: '#1b1726', h: a.hair, s: a.skin, e: '#1b1726', c: a.color, d: '#3a3550', p: '#2d3557', b: '#1b1726' };
  const rows = head.concat(body, legs);
  oval(a.x, a.y, 9, 3.2, 'rgba(0,0,0,.28)');
  if (world.ui.selected === a.id) {
    const pulse = 1 + 0.15 * Math.sin(now / 200);
    g.strokeStyle = '#e3c26b'; g.lineWidth = Math.max(1.5, 2 * S);
    g.beginPath(); g.ellipse(a.x * S, a.y * S, 14 * pulse * S, 5 * pulse * S, 0, 0, Math.PI * 2); g.stroke();
  }
  const sleeping = a.slot && a.slot.opts.sleep && !a.travel;
  if (sleeping) g.globalAlpha = 0.85;
  for (let r = 0; r < 16; r++) {
    const row = rows[r];
    for (let c = 0; c < 12; c++) {
      const ch = row[c]; if (ch === '.' || !pal[ch]) continue;
      R(ox + (flip ? 11 - c : c) * p, oy + r * p, p, p, pal[ch]);
    }
  }
  // accessory
  const P = (c, r, w, h, col) => R(ox + (flip ? 12 - c - w : c) * p, oy + r * p, w * p, h * p, col);
  switch (a.acc) {
    case 'tie': if (dir === 'down') { P(5, 8, 2, 4, '#c9a24a'); P(5, 8, 2, 1, '#8a6a1f'); } break;
    case 'glasses': if (dir === 'down') { P(2, 5, 3, 1, '#9fe6ff'); P(7, 5, 3, 1, '#9fe6ff'); P(5, 5, 2, 1, '#1b1726'); P(3, 5, 1, 1, '#1b1726'); P(8, 5, 1, 1, '#1b1726'); } else if (side) { P(6, 5, 3, 1, '#9fe6ff'); P(7, 5, 1, 1, '#1b1726'); } break;
    case 'visor': P(1, 3, 10, 1, '#3ddc84'); if (side) P(10, 4, 2, 1, '#2aa866'); else if (dir === 'down') P(2, 4, 8, 1, '#2aa866'); break;
    case 'beret': P(2, 0, 8, 1, '#ff7a6b'); P(1, 1, 10, 2, '#ff7a6b'); P(5, -1, 2, 1, '#d9574a'); break;
    case 'goggles': P(1, 3, 10, 1, '#4a4f5c'); if (dir === 'down') { P(2, 3, 3, 1, '#9fd0ff'); P(7, 3, 3, 1, '#9fd0ff'); } break;
    case 'headband': P(1, 3, 10, 1, '#a78bfa'); if (dir === 'up') P(9, 4, 2, 2, '#a78bfa'); break;
    case 'cap': P(2, 1, 8, 2, '#ff9f1c'); if (dir === 'down') P(2, 3, 8, 1, '#c97a0e'); else if (side) P(9, 3, 3, 1, '#c97a0e'); break;
  }
  g.globalAlpha = 1;
}

/* ---------- 15. FRAME: scenery + night lighting + characters ---------- */
function occupancy() {
  const occ = {};
  world.agents.forEach(a => {
    const r = roomAt(a.x, a.y);
    occ[r] = occ[r] || { n: 0, awake: 0 };
    occ[r].n++;
    if (!(a.slot && a.slot.opts.sleep && !a.travel)) occ[r].awake++;
  });
  return occ;
}
function drawFrame(now) {
  if (!ctx) return;
  g = ctx;
  g.drawImage(sceneCanvas, 0, 0);
  // blinking lights on the workshop server rack
  const rk = ROOMS.workshop; if (Math.floor(now / 600) % 2) for (let j = 0; j < 6; j++) R(rk.x + 159, rk.y + 46.5 + j * 8, 2, 2, j % 2 ? '#ff9f1c' : '#9fffc8');
  const dark = darkness(world.clock.sim);
  if (dark > 0.01) {
    const occ = occupancy();
    const tint = `rgba(12,20,62,${(0.55 * dark).toFixed(3)})`;
    R(0, 0, 1000, 70, tint); R(0, 580, 1000, 120, tint); R(0, 70, 45, 510, tint); R(755, 70, 245, 510, tint);
    R(45, 70, 710, 510, `rgba(10,14,40,${(0.15 * dark).toFixed(3)})`);
    for (const id in ROOMS) {
      const r = ROOMS[id]; if (r.outdoor) continue;
      const o = occ[id], lit = o && o.awake;
      const dim = id === 'hall' ? 0.3 : lit ? 0.04 : o ? 0.35 : 0.5;
      R(r.x, r.y, r.w, r.h, `rgba(8,10,30,${(dim * dark).toFixed(3)})`);
      if (lit) R(r.x, r.y, r.w, r.h, `rgba(255,196,120,${(0.07 * dark).toFixed(3)})`);
    }
    // windows glow from lit rooms
    WINDOWS.forEach(w => { const o = occ[roomAt(w.x + 15, w.y + 60)]; if (o && o.awake) R(w.x + 2, w.y + 2, 26, 20, `rgba(255,214,130,${(0.6 * dark).toFixed(3)})`); });
    // garden lamps
    LAMPS.forEach(([x, y]) => {
      const cx = x * S, cy = (y - 29) * S, rr = 50 * S;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, `rgba(255,226,150,${(0.5 * dark).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,226,150,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
    });
  }
  world.agents.slice().sort((a, b) => a.y - b.y).forEach(a => drawAgent(a, now));
}

/* ---------- 16. BUILD THE DOM ---------- */
let mapW = 1, mapH = 1;

function buildLabels() {
  const owner = {}; world.agents.forEach(a => { if (!owner[a.home]) owner[a.home] = a; });
  $('rooms').innerHTML = Object.keys(ROOMS).filter(id => id !== 'hall').map(id => {
    const r = ROOMS[id], o = owner[id];
    const lx = r.outdoor ? 790 : r.x + 6, ly = r.outdoor ? 228 : r.y + 4;
    return `<div class="room-label${r.outdoor ? ' outdoor' : ''}" style="left:${lx / 10}%;top:${ly / 7}%">${o ? `<i style="--c:${o.color}"></i>` : ''}${esc(r.name)}</div>`;
  }).join('');
}

function buildAgents() {
  const layer = $('agentsLayer');
  world.agents.forEach(a => {
    const el = document.createElement('div');
    el.className = 'agent';
    el.style.setProperty('--c', a.color);
    el.setAttribute('role', 'button'); el.setAttribute('aria-label', a.name);
    el.innerHTML = `<div class="bubble"><span></span></div>`;
    el.addEventListener('click', e => { e.stopPropagation(); openPanel(a.id); });
    layer.appendChild(el);
    a.el = el; a.bubbleEl = el.querySelector('.bubble'); a.bubbleText = el.querySelector('.bubble span');
    a._cls = ''; a._thought = '';
  });
}

function buildRoster() {
  $('roster').innerHTML = world.agents.map(a => `
    <button class="rcard" id="rc-${a.id}" style="--c:${a.color}">
      <div class="r-top"><span class="mini">${a.short}</span><span class="r-name">${esc(a.name)}</span></div>
      <div class="r-room"><span class="state" id="rs-${a.id}">—</span><span id="rr-${a.id}"></span></div>
      <div class="r-thought" id="rt-${a.id}"></div>
    </button>`).join('');
  world.agents.forEach(a => $('rc-' + a.id).addEventListener('click', () => openPanel(a.id)));
}

function buildFilters() {
  const wrap = $('feedFilters');
  wrap.innerHTML = `<button class="chip active" data-f="all">All</button>` +
    world.agents.map(a => `<button class="chip" data-f="${a.id}" style="--c:${a.color}"><i></i>${a.short}</button>`).join('');
  wrap.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    world.ui.filter = b.dataset.f;
    wrap.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    renderFeedAll();
  });
}

function buildProjects() {
  const now = Date.now();
  $('projects').innerHTML = world.projects.map(p => {
    let bar = '';
    if (p.test) {
      const s = Date.parse(p.test[0] + 'T00:00:00+03:00'), e = Date.parse(p.test[1] + 'T00:00:00+03:00'), total = Math.round((e - s) / 864e5);
      const day = Math.max(0, Math.min(total, Math.floor((now - s) / 864e5) + 1));
      bar = `<div class="p-bar"><i style="width:${day / total * 100}%"></i></div><div class="p-note">Day ${day} of ${total}</div>`;
    }
    return `<div class="proj">
      <div class="p-top"><div class="p-name"><span class="p-num">#${p.n}</span>${esc(p.name)}</div>
      <span class="status" style="--sc:${STATUS_COLORS[p.status] || '#8C98B5'}">${esc(p.status)}</span></div>
      <div class="p-note">${esc(p.note)}</div>${bar}
      <div class="p-next"><span>Next</span>${esc(p.next)}</div></div>`;
  }).join('') + (PRIVATE_PROJECTS ? `<div class="proj private">+${PRIVATE_PROJECTS} private projects<br>kept off the public pen</div>` : '');
  const live = world.projects.filter(p => p.status === 'Live').length;
  $('projMeta').textContent = `${world.projects.length + PRIVATE_PROJECTS} projects · ${live} live · from the project registry`;
}

/* ---------- 17. RENDER (DOM parts) ---------- */
function renderAgents() {
  const sim = world.clock.sim;
  // agents in the same room thinking the same thing share ONE bubble (e.g. team lunch)
  const groups = {};
  world.agents.forEach(a => { if (!a.travel) { const k = a.room + '|' + a.thought; (groups[k] = groups[k] || []).push(a); } });
  world.agents.forEach(a => {
    a.el.style.transform = `translate3d(${(a.x / MAP_W * mapW).toFixed(1)}px, ${(a.y / MAP_H * mapH).toFixed(1)}px, 0)`;
    a.el.style.zIndex = 10 + Math.round(a.y);
    const sleeping = a.slot && a.slot.opts.sleep && !a.travel;
    const reflecting = sim < a.reflectUntil;
    const grp = a.travel ? null : groups[a.room + '|' + a.thought];
    const dup = grp && grp.length > 1 && grp[0] !== a;
    const cls = ['agent', sleeping ? 'sleep' : '', dup ? 'dup' : '', world.ui.selected === a.id ? 'selected' : '',
                 a.x < 150 ? 'edge-l' : a.x > 850 ? 'edge-r' : ''].join(' ').trim();
    if (cls !== a._cls) { a.el.className = cls; a._cls = cls; }
    const t = (sleeping && !reflecting ? 'zz · ' : '') + a.thought + (grp && grp.length > 1 && !dup ? ` · ${grp.length} agents` : '');
    if (t !== a._thought) {
      a._thought = t; a.bubbleText.textContent = t;
      a.bubbleEl.classList.toggle('reflect', reflecting);
      a.bubbleEl.classList.remove('pop'); void a.bubbleEl.offsetWidth; a.bubbleEl.classList.add('pop');
    }
  });
}

function agentState(a) {
  if (a.walking && a.travel) return ['walking', 'Walking'];
  if (world.clock.sim < a.reflectUntil) return ['reflecting', 'Reflecting'];
  if (a.slot && a.slot.opts.sleep) return ['resting', 'Resting'];
  return ['working', 'Working'];
}

function renderRoster() {
  world.agents.forEach(a => {
    const [cls, label] = agentState(a);
    const st = $('rs-' + a.id); st.className = 'state ' + cls; st.textContent = label;
    $('rr-' + a.id).textContent = a.travel ? '→ ' + ROOMS[a.slot.room].name : ROOMS[a.room].name;
    $('rt-' + a.id).textContent = a.thought;
    $('rc-' + a.id).classList.toggle('selected', world.ui.selected === a.id);
  });
}

function renderClock() {
  const sim = world.clock.sim, d = new Date(sim);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  $('clockTime').textContent = hhmm(sim);
  const { rise, set } = sunTimes(sim);
  const c = world.clock;
  const mode = c.paused ? 'Paused' : c.live ? 'Live' : `${c.speed}× · ${c.speed} min/s`;
  $('clockSub').textContent = `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} · Amman UTC+3 · ☀ ${fmtH(rise)}–${fmtH(set)} · ${mode}`;
  const dark = darkness(sim), h = simHour(sim);
  const dusk = dark > 0 && dark < 1 ? Math.max(0, 1 - Math.abs(dark - 0.5) * 2) : 0;
  const sky = $('sky'); sky.style.setProperty('--night', dark.toFixed(2)); sky.style.setProperty('--dusk', dusk.toFixed(2));
  const orb = $('skyOrb'), isDay = h >= rise && h <= set;
  const p = isDay ? (h - rise) / (set - rise) : ((h > set ? h - set : h + 24 - set) / (24 - (set - rise)));
  orb.style.left = (8 + p * 84) + '%';
  orb.style.top = (50 + Math.pow(p - 0.5, 2) * 80 - 6) + '%';
  orb.classList.toggle('moon', !isDay);
  document.body.classList.toggle('paused', c.paused);
}

function feedItem(m) {
  const a = byId(m.agent); if (!a) return '';
  return `<li class="fi"><span class="fi-dot" style="--c:${a.color}"></span><div class="fi-body">
    <div class="fi-top"><b>${esc(a.name)}</b><span class="tag ${m.type}">${m.type}</span><time class="mono">${hhmm(m.t)}</time></div>
    <div class="fi-text">${esc(m.text)}</div></div></li>`;
}
function renderFeedAll() {
  const f = world.ui.filter;
  $('feed').innerHTML = world.feed.filter(m => f === 'all' || m.agent === f).slice(0, 60).map(feedItem).join('');
  feedQueue.length = 0;
}
function flushFeed() {
  if (!feedQueue.length) return;
  const f = world.ui.filter, list = $('feed');
  const items = feedQueue.splice(0).filter(m => f === 'all' || m.agent === f);
  if (!items.length) return;
  list.insertAdjacentHTML('afterbegin', items.reverse().map(feedItem).join(''));
  while (list.children.length > 60) list.lastElementChild.remove();
}

function renderPortfolio() {
  if (live.on && live.portfolio) return renderLivePortfolio();
  const pf = world.portfolio, st = portfolioStats();
  $('pfValue').textContent = fmtUsd(st.eq);
  const pnl = $('pfPnl');
  pnl.textContent = `${fmtSigned(st.pnl)} (${fmtPct(st.pnlPct)}) all-time`;
  pnl.className = 'pf-pnl mono ' + (st.pnl > 0.005 ? 'up' : st.pnl < -0.005 ? 'down' : 'flat');

  const hist = pf.history.concat([st.eq]);
  const lo = Math.min(RULES.startCash, ...hist), hi = Math.max(RULES.startCash, ...hist), span = Math.max(hi - lo, 1);
  const pts = hist.map((v, i) => [hist.length === 1 ? 300 : i / (hist.length - 1) * 300, 56 - (v - lo) / span * 50]);
  const line = pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const base = 56 - (RULES.startCash - lo) / span * 50, col = st.pnl >= 0 ? '#3DDC84' : '#FF6B6B';
  $('pfSpark').innerHTML = `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="300" y1="${base}" y2="${base}" stroke="rgba(255,255,255,.18)" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
    <polygon points="0,60 ${line} 300,60" fill="url(#sg)"/>
    <polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;

  const parts = [{ sym: 'Cash', v: pf.cash, color: 'rgba(255,255,255,.22)' }]
    .concat(pf.assets.filter(as => pf.positions[as.sym]).map(as => ({ sym: as.sym, v: pf.positions[as.sym].qty * as.price, color: as.color })));
  $('pfAlloc').innerHTML = parts.map(q => `<span style="width:${q.v / st.eq * 100}%;background:${q.color}"></span>`).join('');
  $('pfLegend').innerHTML = parts.map(q => `<span><b style="background:${q.color}"></b>${q.sym} ${Math.round(q.v / st.eq * 100)}%</span>`).join('');

  const rows = pf.assets.filter(as => pf.positions[as.sym]).map(as => {
    const pos = pf.positions[as.sym], gain = as.price / pos.avg - 1;
    return `<div class="pos mono"><span class="sym">${as.sym}</span><span class="q">${fmtQty(pos.qty)}</span><span>${fmtUsd(pos.qty * as.price)}</span><span class="${gain >= 0 ? 'up' : 'down'}">${fmtPct(gain)}</span></div>`;
  }).join('');
  const pa = byId('pa');
  let waiting = 'All cash — waiting for a setup that passes the locked rules.';
  if (!(pa.slot && pa.slot.opts.trade)) {
    const h = simHour(world.clock.sim), next = pa.schedule.find(s => s[4] && s[4].trade && s[0] > h) || pa.schedule.find(s => s[4] && s[4].trade);
    waiting = `All cash. Next trading window: ${pad(next[0])}:00 Amman.`;
  }
  $('pfPositions').innerHTML = rows || `<div class="pf-empty">${waiting}</div>`;
  const t = pf.trades[0];
  $('pfLast').innerHTML = t
    ? `Last trade <b>${t.side} ${t.sym}</b> · ${fmtUsd(t.value)} @ ${fmtUsd(t.price)} · <span class="mono">${hhmm(t.t)}</span><br>${esc(t.reason)}`
    : 'No paper trades yet.';
  $('pfRules').textContent = `Rules locked: max ${RULES.maxPosition * 100}%/position · cash ≥ ${RULES.minCash * 100}% · stop ${RULES.stopLoss * 100}% · take-profit +${RULES.takeProfit * 100}%`;
}

function renderLivePortfolio() {
  const p = live.portfolio, v = +p.value || 0, pnl = +p.pnl || (v - RULES.startCash), pct = pnl / RULES.startCash;
  $('pfValue').textContent = fmtUsd(v);
  const el = $('pfPnl'); el.textContent = `${fmtSigned(pnl)} (${fmtPct(pct)}) · real paper portfolio from Notion`;
  el.className = 'pf-pnl mono ' + (pnl > 0.005 ? 'up' : pnl < -0.005 ? 'down' : 'flat');
  $('pfSpark').innerHTML = '';
  const pos = p.positions || [], cash = +p.cash || 0;
  const cols = ['#F2A541', '#8B93FF', '#36D1C4', '#D8C27A', '#6FA8FF', '#F472B6'];
  const parts = [{ sym: 'Cash', v: cash, color: 'rgba(255,255,255,.22)' }].concat(pos.map((q, i) => ({ sym: q.sym, v: +q.value || 0, color: cols[i % cols.length] })));
  const tot = parts.reduce((s, q) => s + q.v, 0) || 1;
  $('pfAlloc').innerHTML = parts.map(q => `<span style="width:${q.v / tot * 100}%;background:${q.color}"></span>`).join('');
  $('pfLegend').innerHTML = parts.map(q => `<span><b style="background:${q.color}"></b>${esc(q.sym)} ${Math.round(q.v / tot * 100)}%</span>`).join('');
  $('pfPositions').innerHTML = pos.map(q => `<div class="pos mono"><span class="sym">${esc(q.sym)}</span><span class="q"></span><span>${fmtUsd(+q.value || 0)}</span><span class="${(+q.pnl_pct || 0) >= 0 ? 'up' : 'down'}">${fmtPct((+q.pnl_pct || 0) / 100)}</span></div>`).join('') || '<div class="pf-empty">No open positions.</div>';
  $('pfLast').innerHTML = p.last_trade ? `Last trade: <b>${esc(p.last_trade)}</b>` : 'No trades logged yet.';
  $('pfRules').textContent = 'Paper only · rules live in Notion (Portfolio Advisor)';
}

/* ---------- 18. AGENT PANEL ---------- */
function openPanel(id) {
  world.ui.selected = id;
  $('panel').classList.add('open'); $('panel').setAttribute('aria-hidden', 'false'); $('scrim').classList.add('open');
  renderPanel(); $('panelBody').scrollTop = 0;
}
function closePanel() {
  world.ui.selected = null;
  $('panel').classList.remove('open'); $('panel').setAttribute('aria-hidden', 'true'); $('scrim').classList.remove('open');
}
function renderPanel() {
  const a = byId(world.ui.selected); if (!a) return;
  const [cls, label] = agentState(a), cur = a.slot ? a.slot.i : -1;
  const plan = a.schedule.map((s, i) => {
    const end = a.schedule[i + 1] ? a.schedule[i + 1][0] : 24;
    return `<li class="${i === cur ? 'now' : i < cur ? 'past' : ''}"><span class="mono">${pad(s[0])}:00</span><span>${esc(s[2])} <small>· ${esc(ROOMS[s[1]].name)} · until ${pad(end % 24)}:00</small></span></li>`;
  }).join('');
  const mems = a.memories.slice(0, 5).map(m => `<li><div class="m-top"><span class="mono">${hhmm(m.t)}</span><span class="tag ${m.type}">${m.type}</span><span>importance ${m.imp}</span></div>${esc(m.text)}</li>`).join('') || '<li>No memories yet.</li>';
  const r = a.reflections[0];
  $('panelBody').innerHTML = `
    <div class="p-head" style="--c:${a.color};--glow:${a.color}88">
      <div class="p-avatar">${a.short}</div>
      <div><div class="p-name">${esc(a.name)}</div>
      <div class="p-meta"><span class="state ${cls}">${label}</span><span>${esc(ROOMS[a.room].name)}</span><span>Home: ${esc(ROOMS[a.home].name)}</span></div></div>
    </div>
    <p class="p-role">${esc(a.role)}</p>
    <div class="p-now" style="--c:${a.color}"><label>Now ${a.live ? '· LIVE' : '· simulated'}</label>${esc(a.thought)}</div>
    <h4>Today's plan</h4><ol class="plan" style="--c:${a.color}">${plan}</ol>
    <h4>Last 5 memories</h4><ul class="mems">${mems}</ul>
    <h4>Latest reflection</h4>
    ${r ? `<blockquote class="reflection">${esc(r.text)}<time class="mono">${hhmm(r.t)} · next one after ${REFLECT_THRESHOLD - a.imp} more importance points</time></blockquote>` : '<p class="muted">No reflection yet.</p>'}
    <div class="p-guard">Guardrail: this agent proposes — Basha approves anything with real-world effect.${a.id === 'pa' || a.id === 'pr' ? ' Paper money only.' : ''}</div>`;
}

/* ---------- 19. CONTROLS ---------- */
function setSpeed(v) {
  const c = world.clock;
  if (v === 'live') { c.live = true; c.speed = 1; c.sim = ammanNow(); } else { c.live = false; c.speed = +v; }
  c.paused = false; updatePauseIcon();
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', b.dataset.speed === String(v)));
}
function updatePauseIcon() {
  $('pauseIcon').setAttribute('d', world.clock.paused ? 'M8 5v14l11-7z' : 'M7 5h3v14H7zM14 5h3v14h-3z');
  $('btnPause').setAttribute('aria-label', world.clock.paused ? 'Play' : 'Pause');
}
function setBubbles(mode) {
  world.ui.bubbles = mode;
  $('map').classList.toggle('focus', mode === 'focus');
  document.querySelectorAll('[data-bubbles]').forEach(b => b.classList.toggle('active', b.dataset.bubbles === mode));
}
function bindControls() {
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(b.dataset.speed)));
  $('btnPause').addEventListener('click', () => { world.clock.paused = !world.clock.paused; updatePauseIcon(); });
  $('btnNow').addEventListener('click', () => { world.clock.sim = ammanNow(); });
  document.querySelectorAll('[data-bubbles]').forEach(b => b.addEventListener('click', () => setBubbles(b.dataset.bubbles)));
  $('panelClose').addEventListener('click', closePanel);
  $('scrim').addEventListener('click', closePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); $('btnPause').click(); }
  });
  let armed = false;
  $('btnReset').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!armed) { armed = true; b.textContent = 'Tap again to reset'; b.classList.add('danger'); setTimeout(() => { armed = false; b.textContent = 'Reset world'; b.classList.remove('danger'); }, 3000); return; }
    try { localStorage.removeItem(STORE_KEY); } catch (err) {}
    location.reload();
  });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

/* ---------- 20. MAIN LOOP ---------- */
function moveAgents(dt) {
  const c = world.clock, now = performance.now();
  const factor = c.paused ? 0 : c.live || c.speed === 1 ? 1 : c.speed === 5 ? 1.6 : 2.6;
  world.agents.forEach(a => {
    if (!a.path.length) {
      // idle wander: tiny steps around the agent's spot so the house feels alive
      if (!c.paused && !a.travel && a.slot && now > a.nextWander && !a.slot.opts.sleep) {
        const s = spotFor(a, a.room);
        a.path = [{ x: s.x + rand(-18, 18), y: s.y + rand(-12, 12) }]; a.wander = true;
        a.nextWander = now + rand(6000, 13000);
      }
      a.walking = false; return;
    }
    const t = a.path[0], dx = t.x - a.x, dy = t.y - a.y, dist = Math.hypot(dx, dy);
    const step = WALK_SPEED * factor * dt * (a.wander ? 0.35 : 1);
    if (dist > 0.5) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (dist <= step) {
      a.x = t.x; a.y = t.y; a.path.shift();
      if (!a.path.length) { a.wander = false; a.dir = 'down'; if (a.travel) arrive(a); }
    } else if (step > 0) { a.x += dx / dist * step; a.y += dy / dist * step; }
    a.walking = a.path.length > 0 && step > 0;
  });
}

let last = performance.now(), slowTimer = 0, saveTimer = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const c = world.clock;
  if (c.live && !c.paused) c.sim = ammanNow();
  else if (!c.paused) c.sim += dt * c.speed * 60000; // 1× = 1 simulated minute per real second
  simStep();
  moveAgents(dt);
  drawFrame(now);
  renderAgents();
  flushFeed();
  slowTimer += dt; saveTimer += dt;
  if (slowTimer > 0.25) {
    slowTimer = 0;
    renderClock(); renderRoster(); renderPortfolio();
    if (world.ui.selected) renderPanel();
  }
  if (saveTimer > 15) { saveTimer = 0; save(); }
  requestAnimationFrame(frame);
}

function resize() {
  const map = $('map'), canvas = $('scene');
  mapW = map.clientWidth; mapH = map.clientHeight;
  if (!mapW || !mapH) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(mapW * dpr); canvas.height = Math.round(mapH * dpr);
  sceneCanvas = sceneCanvas || document.createElement('canvas');
  sceneCanvas.width = canvas.width; sceneCanvas.height = canvas.height;
  ctx = canvas.getContext('2d'); sctx = sceneCanvas.getContext('2d');
  S = canvas.width / MAP_W;
  drawScene();
  map.style.setProperty('--av', (26 * mapW / MAP_W).toFixed(1) + 'px');
}

/* ---------- 21. START ---------- */
function init() {
  const c = world.clock; c.sim = ammanNow();
  const restored = load();
  const pf = world.portfolio, curMin = Math.floor(c.sim / 60000);
  pf.lastMin = curMin; pf.lastHistMin = curMin;
  pf.assets.forEach(as => as.hist = [{ m: curMin, p: as.price }]);
  if (!pf.history.length) pf.history.push(RULES.startCash);

  // place every agent straight into its current slot (no walking on load)
  const day = Math.floor(c.sim / 864e5);
  world.agents.forEach(a => {
    const idx = slotIndex(a, c.sim);
    a.slot = slotObj(a, idx); a.slotKey = day + ':' + idx; a.dayKey = day;
    a.room = a.slot.room; const s = spotFor(a, a.room); a.x = s.x; a.y = s.y;
    a.thought = a.slot.thoughts[0];
    a.nextMemAt = c.sim + rand(2, MEMORY_EVERY_MIN) * 60000;
    a.nextWander = performance.now() + rand(1500, 8000);
    if (!a.memories.length) {
      remember(a, `Moved into the house · home room: ${ROOMS[a.home].name}`, 'observe', 2, true);
      remember(a, `Plan for today: ${a.schedule.length} blocks. Now: ${a.slot.activity}`, 'plan', 2, true);
    }
    if (!a.reflections.length) { const r0 = REFLECTIONS[a.id][1]; a.reflections.unshift({ t: c.sim, text: typeof r0 === 'string' ? r0 : 'Starting fresh.' }); }
  });
  if (!restored) world.agents.forEach(a => pushFeed({ t: c.sim, agent: a.id, text: `Online in the ${ROOMS[a.room].name}: ${a.slot.activity}`, type: 'observe', imp: 2 }));

  buildLabels(); buildAgents(); buildRoster(); buildFilters(); buildProjects(); bindControls();
  setBubbles(world.ui.bubbles);
  renderFeedAll();

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe($('map')); else window.addEventListener('resize', resize);

  renderClock(); renderRoster(); renderPortfolio();
  loadLive(); setInterval(loadLive, LIVE_REFRESH_MIN * 60000);
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
