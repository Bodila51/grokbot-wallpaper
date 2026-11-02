// Bots-only mode: the office reads the user's bots from a channel in the URL hash. No journal server.
//
//   Private feed (recommended): …/#feed=<urlencoded base>&key=<read key>
//     Polls GET <base>/feed with Authorization: Bearer <read key>. See docs/cloudflare-feed.md and feed-worker/.
//
//   Shared topic (legacy): …/#<topic>. A plain link reads the same topic on two mailboxes and merges them: our relay
//   (RELAY, relay/ in this repo) and ntfy.sh (FEED_BASE in lib/feedbase.js). #<topic>@<host>, ?feed=<host> or the older
//   #<topic>&ntfy=<server> name one mailbox. Public ntfy topics are not private — prefer a private feed for keys + CORS.
//
// The same reducer the local server uses (lib/state.js) turns the lines into the office's state. The mailboxes keep
// 12 hours, so the newest lines are cached per topic in localStorage and replayed first. A `working` bot that stays
// silent for 20 minutes counts as idle (it forgot its closing line).
//
// Lines on the channel (one JSON object per message, at most 4 KB, anything else is dropped):
//   {"bot":"…","status":"working|idle|waiting_user|error|done","step":"…"}     a status change
//   {"roster":["Bot A","Bot B"]}                                                every bot appears, idle until it posts
//   {"looks":{"Bot A":{"shape":"sphere","color":"#RRGGBB","accessory":"none"}}} how each bot's blob looks
//   {"type":"usage","total_used_pct":37,"resets_at":"…","bots":{"Bot A":4.1}}  the weekly limit meter
//   {"groups":{"Bot A":"Content"}}                                            teams, one floor each
//   {"chat":{"Bot A":"grokbot://app/v1/agent?id=…"}}                         each bot's chat, for «Open chat»
//   {"floor_themes":{"Ranch":"office"}}                                       optional interior override
//   {"routines":{"bot":"Bot A","items":[{"name":"…","schedule":"…","next_run":"ISO"}]}}   a bot's routines
//   {"check":{"bots":["Bot A","Bot B"]}}                                     the setup bot starts a status check
// On top of the server's state the office gets state.finished, state.routines, state.check, and state.floor_themes.
import { StateStore, botIdFor } from './lib/state.js';
import { FEED_BASE, feedFromLink } from './lib/feedbase.js';

const RELAY = 'https://relay.0xcodila.com', NTFY = 'https://ntfy.sh';
const MAX_LINE = 4096, KEEP = 600, TICK_MS = 30e3, DAY_MS = 24 * 3600e3, PING_MS = 60e3;
const POLL_OK = 5000, POLL_ERR = 30000;
const QUIET_MS = 20 * 60e3, CHECK_MS = 6 * 3600e3;    // a silent worker turns idle; a status check stays up this long
// Everyone's bots, ours included, are built from their look (the app's 14 avatars and 11 colours, read from a
// screenshot), so a bot in the office is the bot in the app. The hand-made GLBs in assets/blobs/ stay for the local server.
const HANDMADE = new Set();

/** Parse `#feed=<urlencoded base>&key=<read key>` → { kind:'private', base, key }, else null. */
function privateFromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  let params;
  try { params = new URLSearchParams(raw); } catch { return null; }
  const feed = params.get('feed');
  const key = params.get('key');
  if (!feed || !key) return null;
  let base;
  try {
    const u = new URL(feed);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    base = (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return null; }
  if (key.length > 512) return null;
  return { kind: 'private', base, key };
}

/** Private feed first, else a shared topic. A plain topic reads both mailboxes; a named host reads that one. */
export function feedFromHash(hash, search = '') {
  const priv = privateFromHash(hash);
  if (priv) return priv;
  const f = feedFromLink({ hash: hash || '', search });
  if (!f) return null;
  return { kind: 'topic', topic: f.topic, servers: f.base === FEED_BASE ? [RELAY, NTFY] : [f.base.replace(/\/$/, '')] };
}

/**
 * Poll a private feed. onBatch(messages) gets each successful response, oldest first.
 * onStatus('offline') on a failed poll, onStatus(null) after a good one. Returns a stop function.
 */
export function startPrivateFeed({ base, key }, { onBatch, onStatus } = {}) {
  let lastId = null;
  let first = true;
  let timer = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const since = !first && lastId != null ? lastId : null;
    first = false;
    const url = since != null ? `${base}/feed?since=${encodeURIComponent(since)}` : `${base}/feed`;
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const tail = messages.length ? messages[messages.length - 1] : null;
      if (tail && tail.id != null) lastId = String(tail.id);
      onBatch?.(messages);
      onStatus?.(null);
      timer = setTimeout(tick, POLL_OK);
    } catch {
      onStatus?.('offline');
      timer = setTimeout(tick, POLL_ERR);
    }
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

/** Connect from a feedFromHash() result. onStatus is used for private feeds only. */
export function connectFeed(link, onState, onStatus) {
  if (link?.kind === 'private') return connectPrivate(link, onState, onStatus);
  return connectTopic(link, onState);
}

function connectPrivate({ base, key }, onState, onStatus) {
  const cacheKey = `bothq.feed.${base}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Sofia';
  const store = new StateStore({ tz, quietIdleMs: QUIET_MS, hasAvatar: (id) => HANDMADE.has(id) });
  const cfg = {};
  const routines = new Map();
  const floorThemes = {};
  let check = null;
  let lines = [];
  const seen = new Set();
  let saveTimer = 0;

  try { lines = JSON.parse(localStorage.getItem(cacheKey)) || []; } catch { lines = []; }
  lines = lines.filter((l) => l && typeof l.id === 'string' && !seen.has(l.id) && seen.add(l.id))
    .sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1));
  for (const l of lines) ingest(l, true);
  if (lines.length) publish();

  startPrivateFeed({ base, key }, {
    onBatch(messages) {
      let changed = false;
      for (const m of messages) if (take(m)) changed = true;
      if (changed) publish();
    },
    onStatus,
  });
  setInterval(() => { const v = store.version, s = store.snapshot(); if (store.version !== v) onState(extras(s)); }, TICK_MS);

  function take(m) {
    if (m?.event !== 'message' || m.id == null) return false;
    const id = String(m.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    const l = { id, time: Number(m.time) || Date.now() / 1000, message: m.message };
    lines.push(l);
    if (lines.length > KEEP * 1.5) lines = lines.slice(-KEEP);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 2000);
    return ingest(l, false);
  }
  function ingest(line, replay) { return ingestShared(store, cfg, routines, floorThemes, { get: () => check, set: (c) => { check = c; } }, line, replay); }
  function extras(s) { return extrasShared(s, lines, routines, floorThemes, check); }
  function publish() { store.commit(); onState(extras(store.snapshot())); }
  function save() { try { localStorage.setItem(cacheKey, JSON.stringify(lines.slice(-KEEP))); } catch { /* private mode: not cached */ } }
}

/** Rebuild from cache + each mailbox's last 12 h, then follow them live. Calls onState(state) on every change. */
async function connectTopic({ topic, servers }, onState) {
  const sources = servers.map((server) => ({ server, tag: server.startsWith(RELAY) ? 'relay' : 'ntfy', base: `${server}/${encodeURIComponent(topic)}`, lastId: null }));
  const usual = servers.length > 1;                      // the plain link: both mailboxes, one cache
  const cacheKey = usual ? `bothq.feed.${topic}` : `bothq.feed.${servers[0]}.${topic}`;
  const oldKey = `bothq.feed.${NTFY}.${topic}`;         // the cache of the first single-mailbox office (ntfy.sh only)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Sofia';
  const store = new StateStore({ tz, quietIdleMs: QUIET_MS, hasAvatar: (id) => HANDMADE.has(id) });   // no GLB probe: every bot is generated from its look
  const cfg = {};                                        // per bot name: { look, chat_url } -> the store's bots config
  const routines = new Map();                            // bot id -> { name, items }
  const floorThemes = {};
  let check = null;                                      // the latest status check: { ms, names }
  let lines = [], saveTimer = 0;
  const seen = new Set();

  lines = cached(cacheKey).map((l) => ({ ...l, src: l.src || sources[0].tag }));
  if (usual) lines.push(...cached(oldKey).map((l) => ({ ...l, src: l.src || 'ntfy' })));
  await Promise.all(sources.map(async (s) => {
    try {
      const text = await (await fetch(`${s.base}/json?poll=1&since=12h`, { cache: 'no-store' })).text();
      for (const row of text.split('\n')) if (row) keep(s, JSON.parse(row));
    } catch { /* offline or down: the other mailbox and the cache still show the office */ }
  }));
  lines = lines.filter(fresh).sort((a, b) => a.time - b.time);   // stable: lines of one second keep the mailbox's order
  for (const l of lines) ingest(l, true);
  for (const s of sources) s.lastId = lines.findLast((l) => l.src === s.tag)?.id ?? null;
  save();
  if (usual) try { localStorage.removeItem(oldKey); } catch { /* private mode */ }
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
  function ingest(line, replay) { return ingestShared(store, cfg, routines, floorThemes, { get: () => check, set: (c) => { check = c; } }, line, replay); }
  function extras(s) { return extrasShared(s, lines, routines, floorThemes, check); }
  function publish() { store.commit(); onState(extras(store.snapshot())); }
  function save() { try { localStorage.setItem(cacheKey, JSON.stringify(lines.slice(-KEEP))); } catch { /* private mode: not cached */ } }
}

function ingestShared(store, cfg, routines, floorThemes, checkBox, { message, time }, replay) {
  if (typeof message !== 'string' || message.length > MAX_LINE) return false;
  let rec;
  try { rec = JSON.parse(message); } catch { return false; }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
  const t = typeof rec.t === 'string' ? rec.t : new Date(time * 1000).toISOString();
  if (Array.isArray(rec.roster)) {
    for (const name of rec.roster.slice(0, 400)) {
      if (typeof name === 'string' && name.trim() && !store.bots.has(botIdFor(name))) store.apply({ t, bot: name, status: 'idle', step: '', listed: true }, { replay });
    }
    return true;
  }
  if (isMap(rec.looks)) {
    for (const [name, look] of Object.entries(rec.looks).slice(0, 400)) (cfg[name] ||= {}).look = look;
    store.setBotsConfig(cfg);
    return true;
  }
  if (isMap(rec.groups)) {
    for (const [name, team] of Object.entries(rec.groups).slice(0, 400)) {
      if (typeof team === 'string' && team.trim()) (cfg[name] ||= {}).floor = team.trim().slice(0, 40);
    }
    store.setBotsConfig(cfg);
    return true;
  }
  if (isMap(rec.chat)) {
    for (const [name, url] of Object.entries(rec.chat).slice(0, 400)) {
      if (typeof url === 'string' && /^(grokbot|https):\/\//i.test(url.trim())) (cfg[name] ||= {}).chat_url = url.trim();
    }
    store.setBotsConfig(cfg);
    return true;
  }
  if (isMap(rec.floor_themes)) {
    for (const [name, id] of Object.entries(rec.floor_themes).slice(0, 40)) {
      if (typeof name !== 'string' || !name.trim()) continue;
      const keyName = name.trim().slice(0, 40);
      if (typeof id !== 'string' || !id.trim() || /^(auto)$/i.test(id.trim())) delete floorThemes[keyName];
      else floorThemes[keyName] = id.trim().toLowerCase().slice(0, 24);
    }
    return true;
  }
  if (isMap(rec.routines)) {
    const name = typeof rec.routines.bot === 'string' ? rec.routines.bot.trim().slice(0, 80) : '';
    if (!name || !Array.isArray(rec.routines.items)) return false;
    const items = rec.routines.items.slice(0, 50).filter(isMap).map((r) => ({
      routine: String(r.name ?? '').slice(0, 80), schedule: String(r.schedule ?? '').slice(0, 80),
      next_run: Number.isFinite(Date.parse(r.next_run)) ? new Date(r.next_run).toISOString() : null,
    })).filter((r) => r.routine);
    routines.set(botIdFor(name), { name, items });
    return true;
  }
  if (isMap(rec.check)) {
    const names = (Array.isArray(rec.check.bots) ? rec.check.bots : []).filter((n) => typeof n === 'string' && n.trim())
      .slice(0, 400).map((n) => n.trim().slice(0, 80));
    if (!names.length) return false;
    const ms = Number.isFinite(Date.parse(t)) ? Date.parse(t) : time * 1000;
    const prev = checkBox.get();
    if (!prev || ms >= prev.ms) checkBox.set({ ms, names });
    return true;
  }
  store.apply({ ...rec, t }, { replay });
  return true;
}

function extrasShared(s, lines, routines, floorThemes, check) {
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
  s.floor_themes = { ...floorThemes };
  s.finished = finished;
  s.routines = [...routines].flatMap(([bot, { name, items }]) => items.map((r) => ({ bot, name, ...r })))
    .sort((a, b) => (a.next_run ? Date.parse(a.next_run) : Infinity) - (b.next_run ? Date.parse(b.next_run) : Infinity));
  s.check = check && Date.now() - check.ms < CHECK_MS ? {
    t: new Date(check.ms).toISOString(),
    bots: check.names.map((name) => {
      const id = botIdFor(name), seenAt = Date.parse(s.bots[id]?.last_seen ?? '');
      return { id, name, at: seenAt >= check.ms ? new Date(seenAt).toISOString() : null };
    }),
  } : null;
  return s;
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
