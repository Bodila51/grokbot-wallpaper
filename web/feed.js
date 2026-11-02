// Bots-only mode: the office reads the user's bots straight from their channel. No server, no tunnel.
// The link is …/#<topic> (optionally &ntfy=<https server>). A plain link reads the same topic on two mailboxes and merges
// them: our relay (RELAY, relay/ in this repo, where bots set up with the current prompt post) and ntfy.sh (where bots
// set up with the first prompt still post). &ntfy=<server> reads that one server only. The topic lives in the hash, so
// it never reaches any server but those. The same reducer the local server uses (lib/state.js) turns the lines into the
// office's state. Both keep 12 hours, so the newest lines are cached per topic in localStorage and replayed first: after
// a quiet night the office is not empty, every bot is still there, resting.
//
// Lines on the channel (one JSON object per message, at most 4 KB, anything else is dropped):
//   {"bot":"…","status":"working|idle|waiting_user|error|done","step":"…"}     a status change
//   {"roster":["Bot A","Bot B"]}                                                every bot appears, idle until it posts
//   {"looks":{"Bot A":{"shape":"sphere","color":"#RRGGBB","accessory":"none"}}} how each bot's blob looks
//   {"type":"usage","total_used_pct":37,"resets_at":"…","bots":{"Bot A":4.1}}  the weekly limit meter
//   {"groups":{"Bot A":"Content"}}                                            teams, one floor each
//   {"chat":{"Bot A":"grokbot://app/v1/agent?id=…"}}                         each bot's chat, for «Open chat»
//   {"routines":{"bot":"Bot A","items":[{"name":"…","schedule":"…","next_run":"ISO"}]}}   a bot's routines
// On top of the server's state the office gets state.finished (done lines of the last 24 h, newest first) and
// state.routines (every bot's routines, soonest first), for the «Finished» and «Routines» panels.
import { StateStore, botIdFor } from './lib/state.js';

const RELAY = 'https://relay.0xcodila.com', NTFY = 'https://ntfy.sh';
const MAX_LINE = 4096, KEEP = 600, TICK_MS = 30e3, DAY_MS = 24 * 3600e3, PING_MS = 60e3;
const HANDMADE = new Set(['grok-bot', 'jevopus', 'x-writer', 'banner-visuals', 'analytics-analyst', 'competitor-watch', 'qt-scout',
  'ideas-sparring', 'bookmarks-brain', 'codila-x-researcher', 'trendy-x', 'substack', 'x-ads-manager', 'warren-buffett', 'finance-team']);   // assets/blobs/<id>.glb

/** `#<topic>` -> { topic, servers: [relay, ntfy.sh] }; `#<topic>&ntfy=<server>` -> that server only; else null. */
export function feedFromHash(hash) {
  const m = /^#([A-Za-z0-9_-]{6,64})(?:&ntfy=([^&]+))?$/.exec(hash || '');
  if (!m) return null;
  let servers = [RELAY, NTFY];
  if (m[2]) {
    try {
      const u = new URL(decodeURIComponent(m[2]));
      if (u.protocol === 'https:' || u.hostname === 'localhost') servers = [(u.origin + u.pathname).replace(/\/+$/, '')];
    } catch { /* not a URL: both defaults */ }
  }
  return { topic: m[1], servers };
}

/** Rebuild from cache + each mailbox's last 12 h, then follow them live. Calls onState(state) on every change. */
export async function connectFeed({ topic, servers }, onState) {
  const sources = servers.map((server) => ({ server, tag: server === RELAY ? 'relay' : 'ntfy', base: `${server}/${encodeURIComponent(topic)}`, lastId: null }));
  const cacheKey = sources.length > 1 ? `bothq.feed.${topic}` : `bothq.feed.${servers[0]}.${topic}`;
  const oldKey = `bothq.feed.${NTFY}.${topic}`;         // the cache from before the relay: all of it came from ntfy.sh
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Sofia';
  const store = new StateStore({ tz, hasAvatar: (id) => HANDMADE.has(id) });   // others get a generated blob, no 404 probe
  const cfg = {};                                        // per bot name: { look, chat_url } -> the store's bots config
  const routines = new Map();                            // bot id -> { name, items }
  let lines = [], saveTimer = 0;
  const seen = new Set();

  lines = cached(cacheKey).map((l) => ({ ...l, src: l.src || sources[0].tag }));
  if (sources.length > 1) lines.push(...cached(oldKey).map((l) => ({ ...l, src: l.src || 'ntfy' })));
  await Promise.all(sources.map(async (s) => {
    try {
      const text = await (await fetch(`${s.base}/json?poll=1&since=12h`, { cache: 'no-store' })).text();
      for (const row of text.split('\n')) if (row) keep(s, JSON.parse(row));
    } catch { /* offline or down: the other mailbox and the cache still show the office */ }
  }));
  lines = lines.filter(fresh).sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1));
  for (const l of lines) ingest(l, true);
  for (const s of sources) s.lastId = lines.findLast((l) => l.src === s.tag)?.id ?? null;
  save();
  if (sources.length > 1) try { localStorage.removeItem(oldKey); } catch { /* private mode */ }
  publish();
  const bots = Object.values(cfg);
  beacon(topic, { bots: store.bots.size, floors: new Set(bots.map((c) => c.floor).filter(Boolean)).size, tags: new Set(lines.map((l) => l.src)),
    has: { usage: lines.some((l) => typeof l.message === 'string' && l.message.includes('"usage"')), routines: routines.size > 0,
      chat: bots.some((c) => c.chat_url), teams: bots.some((c) => c.floor) } });

  for (const s of sources) follow(s);
  setInterval(() => { const v = store.version, s = store.snapshot(); if (store.version !== v) onState(extras(s)); }, TICK_MS);

  function cached(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  }
  function fresh(l) {                                    // once per mailbox id, and once per (time, text) across mailboxes
    const a = `${l.src} ${l.id}`, b = `${l.time} ${l.message}`;
    if (seen.has(a) || seen.has(b)) return false;
    seen.add(a).add(b);
    return true;
  }
  function keep(s, m) {                                  // a message of a history request, into `lines`
    if (m?.event === 'message' && typeof m.id === 'string') lines.push({ id: m.id, time: Number(m.time) || 0, message: m.message, src: s.tag });
  }
  function take(s, m) {                                  // a live message: new -> ingest; true if the office changed
    if (m?.event !== 'message' || typeof m.id !== 'string') return false;
    s.lastId = m.id;
    const l = { id: m.id, time: Number(m.time) || Date.now() / 1000, message: m.message, src: s.tag };
    if (!fresh(l)) return false;
    lines.push(l);
    if (lines.length > KEEP * 1.5) lines = lines.slice(-KEEP);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 2000);
    return ingest(l, false);
  }
  function follow(s) {                                   // ntfy: an event stream; the relay: a WebSocket its server sleeps through
    const on = (data) => { try { if (take(s, JSON.parse(data))) publish(); } catch { /* keepalive or junk */ } };
    if (s.tag !== 'relay') {
      const live = new EventSource(`${s.base}/sse`);
      live.onopen = () => catchUp(s);                    // also after a reconnect: fetch what was missed
      live.onmessage = (e) => on(e.data);
      return;
    }
    let wait = 1e3, heard = Date.now();
    (function open() {
      const ws = new WebSocket(`${s.base.replace(/^http/, 'ws')}/ws`);
      const ping = setInterval(() => {                   // "pong" comes back without waking the relay
        if (Date.now() - heard > 2.5 * PING_MS) ws.close();   // silent: a dead link after sleep, start over
        else if (ws.readyState === 1) ws.send('ping');
      }, PING_MS);
      ws.onopen = () => { wait = 1e3; heard = Date.now(); catchUp(s); };
      ws.onmessage = (e) => { heard = Date.now(); if (e.data !== 'pong') on(e.data); };
      ws.onclose = () => { clearInterval(ping); setTimeout(open, wait); wait = Math.min(wait * 2, 60e3); };
    })();
  }
  async function catchUp(s) {
    try {
      const text = await (await fetch(`${s.base}/json?poll=1&since=${s.lastId ?? '12h'}`, { cache: 'no-store' })).text();
      let changed = false;
      for (const row of text.split('\n')) if (row && take(s, JSON.parse(row))) changed = true;
      if (changed) publish();
    } catch { /* the stream retries by itself */ }
  }
  function ingest({ message, time }, replay) {
    if (typeof message !== 'string' || message.length > MAX_LINE) return false;
    let rec;
    try { rec = JSON.parse(message); } catch { return false; }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
    const t = typeof rec.t === 'string' ? rec.t : new Date(time * 1000).toISOString();
    if (Array.isArray(rec.roster)) {
      for (const name of rec.roster.slice(0, 400)) {
        if (typeof name === 'string' && name.trim() && !store.bots.has(botIdFor(name))) store.apply({ t, bot: name, status: 'idle', step: '' }, { replay });
      }
      return true;
    }
    if (isMap(rec.looks)) {
      for (const [name, look] of Object.entries(rec.looks).slice(0, 400)) (cfg[name] ||= {}).look = look;
      store.setBotsConfig(cfg);
      return true;
    }
    if (isMap(rec.groups)) {                             // {"groups":{"Bot A":"Content"}}: the main bot's teams = floors
      for (const [name, team] of Object.entries(rec.groups).slice(0, 400)) {
        if (typeof team === 'string' && team.trim()) (cfg[name] ||= {}).floor = team.trim().slice(0, 40);
      }
      store.setBotsConfig(cfg);
      return true;
    }
    if (isMap(rec.chat)) {                               // only app deep links and web pages (the store refuses scripts)
      for (const [name, url] of Object.entries(rec.chat).slice(0, 400)) {
        if (typeof url === 'string' && /^(grokbot|https):\/\//i.test(url.trim())) (cfg[name] ||= {}).chat_url = url.trim();
      }
      store.setBotsConfig(cfg);
      return true;
    }
    if (isMap(rec.routines)) {
      const name = typeof rec.routines.bot === 'string' ? rec.routines.bot.trim().slice(0, 80) : '';
      if (!name || !Array.isArray(rec.routines.items)) return false;
      const items = rec.routines.items.slice(0, 50).filter(isMap).map((r) => ({
        routine: String(r.name ?? '').slice(0, 80), schedule: String(r.schedule ?? '').slice(0, 80),
        next_run: Number.isFinite(Date.parse(r.next_run)) ? new Date(r.next_run).toISOString() : null,
      })).filter((r) => r.routine);
      routines.set(botIdFor(name), { name, items });      // a bot's latest list replaces its previous one
      return true;
    }
    store.apply({ ...rec, t }, { replay });
    return true;
  }
  function extras(s) {                                   // the panels' data on top of the server-shaped state
    const since = Date.now() - DAY_MS, finished = [];
    for (let i = lines.length - 1; i >= 0 && finished.length < 100; i--) {
      const l = lines[i];
      if (l.time * 1000 < since) break;
      if (typeof l.message !== 'string' || l.message.length > MAX_LINE || !l.message.includes('"done"')) continue;
      let rec;
      try { rec = JSON.parse(l.message); } catch { continue; }
      if (rec?.status !== 'done' || typeof rec.bot !== 'string') continue;
      finished.push({ t: typeof rec.t === 'string' ? rec.t : new Date(l.time * 1000).toISOString(), bot: botIdFor(rec.bot), name: rec.bot.slice(0, 80), step: String(rec.step ?? '').slice(0, 80) });
    }
    s.finished = finished;
    s.routines = [...routines].flatMap(([bot, { name, items }]) => items.map((r) => ({ bot, name, ...r })))
      .sort((a, b) => (a.next_run ? Date.parse(a.next_run) : Infinity) - (b.next_run ? Date.parse(b.next_run) : Infinity));
    return s;
  }
  function publish() { store.commit(); onState(extras(store.snapshot())); }
  function save() { try { localStorage.setItem(cacheKey, JSON.stringify(lines.slice(-KEEP))); } catch { /* private mode: not cached */ } }
}

/** Two anonymous pings for the private usage count: one when the office opens (a hash of the topic, never the topic; how
 *  many bots and teams; which mailbox; phone or not; which parts of the prompt are set up), one when the visit ends. */
async function beacon(topic, { bots, floors, tags, has }) {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(topic)));
    const h = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const src = tags.has('relay') ? (tags.has('ntfy') ? 'both' : 'relay') : tags.has('ntfy') ? 'ntfy' : 'none';
    const phone = navigator.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
    const send = (data) => {                             // a string goes as text/plain: no CORS preflight
      const body = JSON.stringify(data);
      if (!navigator.sendBeacon?.(`${RELAY}/_beacon`, body)) fetch(`${RELAY}/_beacon`, { method: 'POST', body, keepalive: true }).catch(() => {});
    };
    send({ h, bots, floors, src, phone, has });
    let ended = false;
    const end = () => { if (!ended) { ended = true; send({ h, secs: Math.min(Math.round(performance.now() / 1000), 7 * 86400) }); } };
    globalThis.addEventListener?.('pagehide', end);
    globalThis.document?.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') end(); });
  } catch { /* stats are optional */ }
}

function isMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
