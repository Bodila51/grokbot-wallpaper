/*
 * Bot HQ UI: glass overlays on top of the full-bleed 3D scene (CONTRACT v2.3, look = mockups/diorama/mock.html).
 *   top-left   brand + live clock         top-center  status summary         top-right  DEMO + week usage
 *   left       floors "elevator"          right       bot card / floor team card
 *   bottom-left live feed (last 4)        bottom-right (left of the card)  zoom - / +
 *
 *   initUI({ onSelectBot, onSelectFloor, onZoom, onOpenChat })
 *   renderUI(state, { currentFloor, selectedBot })   // idempotent, cheap, safe to call every second
 *
 * Every DOM node is created once and then patched in place (text / attributes / classes only when the
 * value changed), so hover, focus and scroll positions survive the 1 Hz re-render.
 * All data goes into the DOM through textContent / setAttribute, never innerHTML.
 * Theme (day / night) is pure CSS: see web/styles.css (--night, data-daylight).
 */

// Resolved against this file, so it works from /web/index.html, from a server rooted at web/, and from the harness.
const THUMB_BASE = new URL('../../assets/blobs/thumbs/', import.meta.url).href;
const FEED_ROWS = 4;
const STEPS_SHOWN = 3;
const FEED_OUT_MS = 420;

const LABEL = {
  working: 'работает',
  idle: 'отдыхает',
  waiting_user: 'ждёт тебя',
  error: 'ошибка',
  stuck: 'завис?',
  done: 'готово',
};
const CHIP = {
  working: 'Работает',
  idle: 'Отдыхает',
  waiting_user: 'Ждёт тебя',
  error: 'Ошибка',
  stuck: 'Завис?',
  done: 'Готово',
};

// Russian plural forms [one, few, many] per status, for counters.
const FORMS = {
  working: ['работает', 'работают', 'работают'],
  waiting_user: ['ждёт тебя', 'ждут тебя', 'ждут тебя'],
  error: ['ошибка', 'ошибки', 'ошибок'],
  stuck: ['завис?', 'завис?', 'завис?'],
  idle: ['отдыхает', 'отдыхают', 'отдыхают'],
  done: ['готово', 'готово', 'готово'],
};

// Summary pill. "attention" folds stuck into waiting_user: both need a human.
const SUMMARY = [
  { key: 'working', s: 'working', n: (c) => c.working },
  { key: 'attention', s: 'waiting_user', alert: true, n: (c) => c.waiting_user + c.stuck },
  { key: 'error', s: 'error', n: (c) => c.error },
  { key: 'idle', s: 'idle', n: (c) => c.idle },
  { key: 'done', s: 'done', n: (c) => c.done, hideZero: true },
];

const USAGE_TITLE = { week: 'Неделя', day: 'День', month: 'Месяц' };
const USAGE_SPENT = { week: 'Расход за неделю', day: 'Расход за день', month: 'Расход за месяц' };

const ICON = {
  close: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  minus: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

/* ------------------------------------------------------------------ module state */

let U = null; // set by initUI

function freshState(handlers) {
  return {
    h: handlers || {},
    top: null, fl: null, panel: null, feed: null, zoom: null, owned: [],
    last: { state: null, opts: { currentFloor: null, selectedBot: null } },
    skew: 0, nowStr: null,
    floors: new Map(), activeFloorId: null,
    cells: new Map(),
    feedRows: new Map(), feedOut: new Set(), feedMode: null, feedFirst: true,
    failedThumbs: new Set(),
    mode: null, cardBot: null, teamFloor: null, teamReady: false, ready: false,
    keyHandler: null, ro: null,
  };
}

/* ------------------------------------------------------------------ tiny helpers */

function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of kids) if (c != null && c !== false) n.append(c);
  return n;
}

function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

function setText(n, v) {
  v = v == null ? '' : String(v);
  if (n.textContent !== v) n.textContent = v;
}
function setAttr(n, k, v) {
  if (v == null || v === false) {
    if (n.hasAttribute(k)) n.removeAttribute(k);
  } else {
    v = v === true ? '' : String(v);
    if (n.getAttribute(k) !== v) n.setAttribute(k, v);
  }
}
function setHidden(n, hidden) {
  if (n.hidden !== !!hidden) n.hidden = !!hidden;
}
function setVar(n, name, v) {
  const cache = n._vars || (n._vars = {});
  if (cache[name] === v) return;
  cache[name] = v;
  n.style.setProperty(name, v);
}
function setCls(n, cls, on) {
  if (n.classList.contains(cls) !== !!on) n.classList.toggle(cls, !!on);
}
function setWidth(n, w) {
  if (n._w !== w) { n._w = w; n.style.width = w; }
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function pad2(n) { return n < 10 ? '0' + n : String(n); }

// Russian plural: one (1, 21), few (2-4, 22-24), many (0, 5-20, 25-30).
function plural(n, one, few, many) {
  n = Math.abs(Math.trunc(n));
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function statusWord(s, n) {
  const f = FORMS[s] || [s, s, s];
  return plural(n, f[0], f[1], f[2]);
}

function parseTs(s) {
  const t = typeof s === 'number' ? s : Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
function hhmm(ms) {
  if (ms == null) return '';
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// Server "now" estimated from the client clock: skew is refreshed whenever state.now changes.
function syncClock(state) {
  if (state && state.now && state.now !== U.nowStr) {
    const t = parseTs(state.now);
    if (t != null) { U.skew = Date.now() - t; U.nowStr = state.now; }
  }
}
function nowMs() { return Date.now() - U.skew; }

function fmtDur(ms) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return 'меньше минуты';
  if (min < 60) return min + ' мин';
  const hr = Math.floor(min / 60), m = min % 60;
  if (hr < 24) return m ? hr + ' ч ' + m + ' мин' : hr + ' ч';
  const d = Math.floor(hr / 24), hh = hr % 24;
  return hh ? d + ' д ' + hh + ' ч' : d + ' д';
}
function fmtLeft(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'меньше минуты';
  const d = Math.floor(min / 1440), hr = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return d + ' д ' + hr + ' ч';
  if (hr > 0) return hr + ' ч ' + m + ' мин';
  return m + ' мин';
}
const NUM1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
function fmtHours(min) {
  const hr = Math.max(0, Number(min) || 0) / 60;
  return hr < 10 ? NUM1.format(hr) : String(Math.round(hr));
}

function effStatus(bot) { return (bot && (bot.effective_status || bot.status)) || 'idle'; }
function statusLabel(s) { return LABEL[s] || s || ''; }
function isHex(c) { return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c || ''); }

function initials(name) {
  const words = String(name || '').match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length) return '?';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
}

// Pick white or ink text for a background colour (WCAG contrast).
function lum(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const f = (i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
}
function textOn(hex) {
  const L = lum(hex);
  const white = 1.05 / (L + 0.05);
  const ink = (L + 0.05) / (lum('#1D1D1F') + 0.05);
  return white >= ink ? '#fff' : '#1D1D1F';
}

// Insert / move children so that parent.children[start..] equals `els`; untouched nodes are not moved.
function reconcile(parent, els, start) {
  for (let i = 0; i < els.length; i++) {
    const cur = parent.children[start + i];
    if (cur !== els[i]) parent.insertBefore(els[i], cur || null);
  }
}

function restartAnim(n, cls) {
  n.classList.remove(cls);
  void n.offsetWidth; // reflow so the animation restarts
  n.classList.add(cls);
}

function counts(state) {
  const out = { working: 0, idle: 0, waiting_user: 0, error: 0, stuck: 0, done: 0 };
  const bots = state.bots;
  if (bots && typeof bots === 'object' && Object.keys(bots).length) {
    for (const id of Object.keys(bots)) {
      const s = effStatus(bots[id]);
      out[s] = (out[s] || 0) + 1;
    }
  } else if (state.summary && typeof state.summary === 'object') {
    for (const s of Object.keys(out)) out[s] = Number(state.summary[s]) || 0;
  }
  return out;
}

/* ------------------------------------------------------------------ avatars */

function makeAvatar() {
  const img = h('img', { class: 'bhq-av-img', alt: '', draggable: 'false', decoding: 'async' });
  const fb = h('span', { class: 'bhq-av-fb', 'aria-hidden': 'true' });
  const root = h('span', { class: 'bhq-av' }, img, fb);
  img.addEventListener('error', () => {
    if (img._name) U.failedThumbs.add(img._name);
    root.classList.add('is-fb');
  });
  img.addEventListener('load', () => root.classList.remove('is-fb'));
  return { root, img, fb };
}

function setAvatar(av, bot) {
  const name = bot.avatar || bot.id || '';
  const color = isHex(bot.color) ? bot.color : '#A1A1A6';
  setVar(av.root, '--c', color);
  setVar(av.root, '--fg', textOn(color));
  setText(av.fb, initials(bot.name));
  if (av.img._name !== name) {
    av.img._name = name;
    if (!name || U.failedThumbs.has(name)) {
      av.img.removeAttribute('src');
      av.root.classList.add('is-fb');
    } else {
      av.root.classList.remove('is-fb');
      av.img.src = THUMB_BASE + encodeURIComponent(name) + '.png';
    }
  }
}

/* ------------------------------------------------------------------ init */

function own(el) { U.owned.push(el); return el; }

export function initUI(handlers) {
  if (U) {
    if (U.keyHandler) document.removeEventListener('keydown', U.keyHandler);
    if (U.ro) U.ro.disconnect();
    for (const el of U.owned) if (el.parentNode) el.remove();
  }
  U = freshState(handlers);

  const topbar = document.getElementById('topbar');
  const floors = document.getElementById('floors');
  const panel = document.getElementById('panel');
  let feed = document.getElementById('feed');
  if (!feed) { feed = own(h('section', { id: 'feed', 'aria-label': 'Лента событий' })); document.body.append(feed); }

  if (topbar) buildTopbar(topbar); else console.warn('[ui] #topbar not found');
  if (floors) buildFloors(floors); else console.warn('[ui] #floors not found');
  if (panel) buildPanel(panel); else console.warn('[ui] #panel not found');
  buildFeed(feed);
  buildZoom();

  U.keyHandler = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (U.last.opts.selectedBot && U.h.onSelectBot) U.h.onSelectBot(null);
  };
  document.addEventListener('keydown', U.keyHandler);
}

/* ------------------------------------------------------------------ build: top bar */

function buildTopbar(root) {
  root.textContent = '';

  const clock = h('span', { class: 'bhq-num bhq-clock', text: '--:--' });
  const brand = h('div', { class: 'bhq-brand bhq-glass' },
    h('span', { class: 'bhq-mark', 'aria-hidden': 'true' }, h('i')),
    h('b', { class: 'bhq-word', text: 'Grok Bot Wallpaper' }),
    h('span', { class: 'bhq-sep', 'aria-hidden': 'true' }),
    h('span', { class: 'bhq-live' }, h('i', { class: 'bhq-dot bhq-live-dot', 'aria-hidden': 'true' }), 'Live · ', clock));

  const chips = {};
  const summary = h('div', { class: 'bhq-summary bhq-glass', role: 'group', 'aria-label': 'Статусы ботов' });
  for (const p of SUMMARY) {
    const num = h('b', { class: 'bhq-num' });
    const label = h('span');
    const el = h('span', { class: 'bhq-schip' + (p.alert ? ' is-alert-kind' : ''), 'data-s': p.s },
      h('i', { class: 'bhq-dot', 'aria-hidden': 'true' }), num, label);
    chips[p.key] = { el, num, label, cfg: p };
    summary.append(el);
  }

  const usageLabel = h('span', { class: 'bhq-usage-label', text: 'Неделя' });
  const fill = h('i');
  const meter = h('span', {
    class: 'bhq-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Расход лимита',
  }, fill);
  const pct = h('b', { class: 'bhq-num bhq-usage-pct', text: '—' });
  const reset = h('span', { class: 'bhq-reset' });
  const usage = h('div', { class: 'bhq-usage bhq-glass' }, usageLabel, meter, pct, h('span', { class: 'bhq-sep', 'aria-hidden': 'true' }), reset);
  const demo = h('span', { class: 'bhq-demo bhq-glass', text: 'DEMO', hidden: true, title: 'Демо-данные, не настоящие боты' });
  const right = h('div', { class: 'bhq-right' }, demo, usage);

  root.append(brand, summary, right);
  U.top = { root, clock, chips, summary, usage, usageLabel, meter, fill, pct, reset, demo };
}

/* ------------------------------------------------------------------ build: floors */

function buildFloors(root) {
  root.textContent = '';
  root.classList.add('bhq-glass');
  const car = h('div', { class: 'bhq-car', 'aria-hidden': 'true' });
  const shaft = h('div', { class: 'bhq-shaft' }, car);
  root.append(h('h6', { class: 'bhq-h6', text: 'Этажи' }), shaft);
  U.fl = { root, shaft, car, carTop: null, carH: null, carShown: false, ready: false };
  if (typeof ResizeObserver === 'function') {
    U.ro = new ResizeObserver(() => placeCar());
    U.ro.observe(shaft);
  }
}

function makeFloor(id) {
  const num = h('span', { class: 'bhq-num bhq-fnum' });
  const name = h('b', { class: 'bhq-fname' });
  const dots = h('span', { class: 'bhq-fdots', 'aria-hidden': 'true' });
  const count = h('span', { class: 'bhq-num bhq-fcount' });
  const btn = h('button', { class: 'bhq-floor', type: 'button', 'data-id': id },
    num, h('span', { class: 'bhq-ftext' }, name, dots), count);
  btn.addEventListener('click', () => { if (U.h.onSelectFloor) U.h.onSelectFloor(id); });
  return { btn, num, name, dots, count, dotEls: [] };
}

/* ------------------------------------------------------------------ build: panel (bot card / team card) */

function buildPanel(root) {
  root.textContent = '';

  /* floor team card */
  const teamTitle = h('h2', { class: 'bhq-h2' });
  const teamSub = h('p', { class: 'bhq-sub' });
  const list = h('div', { class: 'bhq-members', role: 'list' });
  const teamEmpty = h('p', { class: 'bhq-note', text: 'Пока пусто. Бот появится здесь, когда запишет первый шаг.', hidden: true });
  const team = h('section', { class: 'bhq-team bhq-glass', 'aria-label': 'Команда этажа' },
    h('header', { class: 'bhq-team-head' }, teamTitle, teamSub), list, teamEmpty);

  /* bot card */
  const close = h('button', { class: 'bhq-close', type: 'button', 'aria-label': 'Закрыть карточку бота', title: 'Закрыть (Esc)' }, svg(ICON.close));
  close.addEventListener('click', () => { if (U.h.onSelectBot) U.h.onSelectBot(null); });

  const av = makeAvatar();
  const name = h('h2', { class: 'bhq-h2', tabindex: '-1' });
  const where = h('p', { class: 'bhq-sub' });
  const stDot = h('i', { class: 'bhq-dot', 'aria-hidden': 'true' });
  const stTxt = h('span');
  const status = h('span', { class: 'bhq-status' }, stDot, stTxt);

  const now = h('p', { class: 'bhq-now' });
  const taskLabel = h('div', { class: 'bhq-label', text: 'Задача' });
  const task = h('p', { class: 'bhq-task' });
  const taskBlock = h('div', { class: 'bhq-block', hidden: true }, taskLabel, task);

  const stat = (unit) => {
    const v = h('b', { class: 'bhq-num' }); const l = h('small', { text: unit || '' });
    return { root: h('div', { class: 'bhq-stat' }, v, l), v, l };
  };
  const sSteps = stat(), sTasks = stat(), sHours = stat('ч работы');
  const stats = h('div', { class: 'bhq-stats' }, sSteps.root, sTasks.root, sHours.root);

  const usageLabel = h('div', { class: 'bhq-label' });
  const fillBar = h('i');
  const fuel = h('span', { class: 'bhq-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Доля общего расхода' }, fillBar);
  const share = h('span', { class: 'bhq-num bhq-share' });

  const hist = h('ol', { class: 'bhq-steps', role: 'list' });

  const body = h('div', { class: 'bhq-card-body' },
    h('div', { class: 'bhq-head' },
      h('div', { class: 'bhq-tile bhq-tile--lg' }, av.root),
      h('div', { class: 'bhq-head-text' }, name, where)),
    status,
    h('div', { class: 'bhq-label', text: 'Сейчас' }), now,
    taskBlock,
    stats,
    usageLabel, h('div', { class: 'bhq-use' }, fuel, share),
    h('div', { class: 'bhq-label', text: 'Последние шаги' }), hist);

  const cta = h('button', { class: 'bhq-cta', type: 'button', text: 'Открыть чат', disabled: true, title: 'Ссылка на чат пока не задана' });
  cta.addEventListener('click', () => {
    const b = U.last.state && U.last.state.bots && U.last.state.bots[U.cardBot];
    if (!b || !b.chat_url) return;
    if (U.h.onOpenChat) U.h.onOpenChat(b.id, b.chat_url);
    else window.location.href = b.chat_url;
  });

  const card = h('section', { class: 'bhq-card bhq-glass', hidden: true, 'aria-label': 'Карточка бота' },
    close, body, h('div', { class: 'bhq-card-foot' }, cta));

  root.append(card, team);

  U.panel = {
    root, team, teamTitle, teamSub, list, teamEmpty,
    card: {
      root: card, body, av, name, where, status, stDot, stTxt, now, taskBlock, task,
      sSteps, sTasks, sHours, usageLabel, fuel, fillBar, share, hist, histSig: null, cta,
    },
  };
}

/* ------------------------------------------------------------------ build: feed + zoom */

function buildFeed(root) {
  root.textContent = '';
  root.classList.add('bhq-glass');
  const list = h('ol', { class: 'bhq-frows', role: 'list', 'aria-live': 'off' });
  const empty = h('p', { class: 'bhq-note', text: 'Событий пока нет.', hidden: true });
  root.append(h('h6', { class: 'bhq-h6', text: 'Лента' }), list, empty);
  U.feed = { root, list, empty };
}

function buildZoom() {
  const mk = (cls, icon, label, dir) => {
    const b = h('button', { class: 'bhq-zbtn ' + cls, type: 'button', 'aria-label': label, title: label }, svg(icon));
    b.addEventListener('click', () => { if (U.h.onZoom) U.h.onZoom(dir); });
    return b;
  };
  const root = own(h('div', { class: 'bhq-zoom bhq-glass', role: 'group', 'aria-label': 'Масштаб сцены' },
    mk('z-out', ICON.minus, 'Отдалить', 'out'),
    h('span', { class: 'bhq-sep', 'aria-hidden': 'true' }),
    mk('z-in', ICON.plus, 'Приблизить', 'in')));
  document.body.append(root);
  U.zoom = { root };
}

/* ------------------------------------------------------------------ render */

export function renderUI(state, opts) {
  if (!U || !state) return;
  opts = opts || {};
  const o = { currentFloor: opts.currentFloor || null, selectedBot: opts.selectedBot || null };
  U.last = { state, opts: o };
  syncClock(state);
  if (!U.ready) { // let the first theme paint without a fade, then enable the 1 s day/night transition
    U.ready = true;
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('bhq-ready')));
  }

  safe('topbar', () => U.top && renderTopbar(state));
  safe('floors', () => U.fl && renderFloors(state, o));
  safe('panel', () => U.panel && renderPanel(state, o));
  safe('feed', () => U.feed && renderFeed(state));
  safe('zoom', () => {
    if (U.zoom && !U.zoom.root.isConnected) document.body.append(U.zoom.root);
  });
}

const reported = new Set();
function safe(where, fn) {
  try { fn(); } catch (err) {
    if (!reported.has(where)) { reported.add(where); console.error('[ui] render failed in ' + where, err); }
  }
}

/* ---- top bar */

function renderTopbar(state) {
  const t = U.top;
  setText(t.clock, hhmm(Date.now()));

  const c = counts(state);
  for (const p of SUMMARY) {
    const r = t.chips[p.key];
    const n = p.n(c);
    const label = statusWord(p.s, n);
    setText(r.num, n);
    setText(r.label, label);
    setCls(r.el, 'is-zero', n === 0);
    setCls(r.el, 'is-alert', !!p.alert && n > 0);
    if (p.hideZero) setHidden(r.el, n === 0);
    let title = n + ' ' + label;
    if (p.key === 'attention' && c.stuck > 0) {
      title = c.waiting_user + ' ' + statusWord('waiting_user', c.waiting_user) + ', ' + c.stuck + ' завис?';
    }
    setAttr(r.el, 'title', title);
  }

  const u = state.usage || {};
  const pct = Number.isFinite(u.total_used_pct) ? clamp(u.total_used_pct, 0, 100) : null;
  setText(t.usageLabel, USAGE_TITLE[u.period] || 'Лимит');
  setWidth(t.fill, pct == null ? '0%' : pct + '%');
  setText(t.pct, pct == null ? '—' : Math.round(pct) + '%');
  setAttr(t.meter, 'aria-valuenow', pct == null ? null : Math.round(pct));
  setAttr(t.meter, 'data-level', pct != null && pct >= 95 ? 'error' : pct != null && pct >= 85 ? 'warn' : null);

  let resetText = '';
  const resetAt = parseTs(u.resets_at);
  if (resetAt != null) {
    const left = resetAt - nowMs();
    resetText = left > 0 ? 'сброс через ' + fmtLeft(left) : 'сброс сейчас';
  } else if (pct == null) {
    resetText = 'нет данных';
  }
  setText(t.reset, resetText);
  setHidden(t.reset, !resetText);
  const sep = t.reset.previousElementSibling;
  if (sep) setHidden(sep, !resetText);
  const upd = parseTs(u.updated_at);
  setAttr(t.usage, 'title', upd != null ? 'Данные обновлены в ' + hhmm(upd) : null);

  setHidden(t.demo, !state.demo);
}

/* ---- floors */

function countsText(c) {
  const parts = [];
  for (const s of ['working', 'waiting_user', 'error', 'stuck', 'done', 'idle']) {
    const n = Number(c && c[s]) || 0;
    if (n > 0) parts.push(n + ' ' + statusWord(s, n));
  }
  return parts.join(', ');
}

function floorBotIds(state, fl) {
  const bots = state.bots || {};
  if (Array.isArray(fl.bots)) return fl.bots;
  return Object.keys(bots).filter((id) => bots[id].floor === fl.id);
}

function renderFloors(state, o) {
  const f = U.fl;
  const bots = state.bots || {};
  // Building order: highest floor first (top of the panel), floor 1 at the bottom.
  const list = (state.floors || []).slice().sort((a, b) => (Number(b.order) || 0) - (Number(a.order) || 0));
  const seen = new Set();
  const activeId = list.some((x) => x.id === o.currentFloor) ? o.currentFloor : null;
  U.activeFloorId = activeId;

  list.forEach((fl, i) => {
    let r = U.floors.get(fl.id);
    if (!r) { r = makeFloor(fl.id); U.floors.set(fl.id, r); }
    seen.add(fl.id);

    const number = fl.order != null && Number.isFinite(Number(fl.order)) ? Number(fl.order) : list.length - i;
    const ids = floorBotIds(state, fl);
    setText(r.num, number);
    setText(r.name, fl.name || fl.id);
    setText(r.count, ids.length);

    // one tiny dot per bot, in desk order
    while (r.dotEls.length < ids.length) { const d = h('i', { class: 'bhq-dot' }); r.dotEls.push(d); r.dots.append(d); }
    while (r.dotEls.length > ids.length) r.dotEls.pop().remove();
    ids.forEach((id, k) => setAttr(r.dotEls[k], 'data-s', effStatus(bots[id])));

    const summary = countsText(fl.counts);
    setAttr(r.btn, 'aria-label', 'Этаж ' + number + ', ' + (fl.name || fl.id) + ': ' + ids.length + ' ' + plural(ids.length, 'бот', 'бота', 'ботов') + (summary ? ' (' + summary + ')' : ''));
    setAttr(r.btn, 'title', summary || null);
    setAttr(r.btn, 'aria-current', fl.id === activeId ? 'true' : null);
  });

  for (const [id, r] of U.floors) {
    if (!seen.has(id)) { r.btn.remove(); U.floors.delete(id); }
  }

  reconcile(f.shaft, list.map((x) => U.floors.get(x.id).btn), 1); // child 0 is the car
  placeCar();
}

// The black pill is one element that slides between floors (the "elevator car").
function placeCar() {
  const f = U && U.fl;
  if (!f) return;
  const r = U.activeFloorId ? U.floors.get(U.activeFloorId) : null;
  if (!r || !r.btn.isConnected || !r.btn.offsetHeight) {
    if (f.carShown) { f.car.style.opacity = '0'; f.carShown = false; }
    return;
  }
  const top = r.btn.offsetTop, hgt = r.btn.offsetHeight;
  if (f.carTop !== top || f.carH !== hgt) {
    f.carTop = top; f.carH = hgt;
    f.car.style.transform = 'translateY(' + top + 'px)';
    f.car.style.height = hgt + 'px';
  }
  if (!f.carShown) { f.car.style.opacity = '1'; f.carShown = true; }
  if (!f.ready) {
    f.ready = true; // enable the sliding transition only after the first placement
    requestAnimationFrame(() => requestAnimationFrame(() => f.shaft.classList.add('is-ready')));
  }
}

/* ---- panel */

function renderPanel(state, o) {
  const p = U.panel;
  const bots = state.bots || {};
  const floor = (state.floors || []).find((x) => x.id === o.currentFloor) || null;
  const bot = o.selectedBot ? bots[o.selectedBot] : null;
  const mode = bot ? 'card' : 'team';

  const prevMode = U.mode;
  const prevBotId = U.cardBot;
  const focusInTeam = p.team.contains(document.activeElement);
  const focusInCard = p.card.root.contains(document.activeElement);

  if (mode !== prevMode) {
    setHidden(p.team, mode === 'card');
    setHidden(p.card.root, mode === 'team');
    if (prevMode) restartAnim(mode === 'card' ? p.card.root : p.team, 'is-enter');
    U.mode = mode;
  }

  if (mode === 'card') {
    if (U.cardBot !== bot.id) {
      U.cardBot = bot.id;
      p.card.histSig = null;
      p.card.body.scrollTop = 0;
      if (prevMode === 'card') restartAnim(p.card.root, 'is-enter');
    }
    renderCard(state, bot);
    if (prevMode !== 'card' && focusInTeam) p.card.name.focus({ preventScroll: true });
  } else {
    U.cardBot = null;
    renderTeam(state, floor, o);
    if (prevMode === 'card' && focusInCard) {
      const cell = U.cells.get(prevBotId);
      if (cell) cell.btn.focus({ preventScroll: true });
    }
  }
}

/* ---- floor team card */

function makeCell(id) {
  const av = makeAvatar();
  const dot = h('i', { class: 'bhq-dot', 'aria-hidden': 'true' });
  const name = h('b', { class: 'bhq-mname' });
  const step = h('span', { class: 'bhq-mstep' });
  const btn = h('button', { class: 'bhq-member', type: 'button', 'data-id': id, role: 'listitem' },
    h('span', { class: 'bhq-tile' }, av.root), h('span', { class: 'bhq-mtext' }, name, step), dot);
  btn.addEventListener('click', () => { if (U.h.onSelectBot) U.h.onSelectBot(id); });
  return { btn, av, dot, name, step };
}

function renderTeam(state, floor, o) {
  const p = U.panel;
  const bots = state.bots || {};
  let ids = floor ? floorBotIds(state, floor) : [];
  ids = ids.filter((id) => bots[id]);

  if (U.teamFloor !== (floor ? floor.id : null)) {
    U.teamFloor = floor ? floor.id : null;
    p.list.scrollTop = 0;
    if (U.teamReady) restartAnim(p.list, 'is-enter');
  }
  U.teamReady = true;

  setText(p.teamTitle, floor ? floor.name || floor.id : 'Этаж не выбран');
  if (floor) {
    const n = ids.length;
    const working = ids.filter((id) => effStatus(bots[id]) === 'working').length;
    let sub = n + ' ' + plural(n, 'бот', 'бота', 'ботов');
    if (working) sub += ' · ' + working + ' ' + statusWord('working', working);
    setText(p.teamSub, sub);
  } else {
    setText(p.teamSub, 'Выбери этаж слева');
  }
  setHidden(p.teamEmpty, ids.length > 0 || !floor);

  const seen = new Set(ids);
  for (const [id, c] of U.cells) {
    if (!seen.has(id)) { c.btn.remove(); U.cells.delete(id); }
  }
  const els = ids.map((id) => {
    let c = U.cells.get(id);
    if (!c) { c = makeCell(id); U.cells.set(id, c); }
    const bot = bots[id];
    const s = effStatus(bot);
    setAvatar(c.av, bot);
    setText(c.name, bot.name || id);
    setText(c.step, bot.step || statusLabel(s));
    setAttr(c.dot, 'data-s', s);
    setAttr(c.btn, 'aria-label', (bot.name || id) + ', ' + statusLabel(s));
    setAttr(c.btn, 'title', (bot.name || id) + ': ' + statusLabel(s) + (bot.step ? '. ' + bot.step : ''));
    return c.btn;
  });
  reconcile(p.list, els, 0);
}

/* ---- bot card */

function histRow(ev) {
  return h('li', { class: 'bhq-step-row' },
    h('time', { class: 'bhq-num', text: hhmm(parseTs(ev.t)) }),
    h('span', { text: ev.step || statusLabel(ev.status), title: ev.step || '' }));
}

function renderCard(state, bot) {
  const c = U.panel.card;
  const s = effStatus(bot);
  const now = nowMs();

  setAvatar(c.av, bot);
  setText(c.name, bot.name || bot.id);

  const fl = (state.floors || []).find((x) => x.id === bot.floor);
  const where = (fl && (fl.name || fl.id)) || bot.group || '';
  const desk = Number.isFinite(Number(bot.desk)) && bot.desk != null ? ' · стол ' + Number(bot.desk) : '';
  setText(c.where, where + desk);

  setAttr(c.status, 'data-s', s);
  const since = parseTs(bot.since);
  const age = since == null ? '' : ' · ' + (now - since < 60000 ? 'только что' : fmtDur(now - since));
  setText(c.stTxt, (CHIP[s] || statusLabel(s)) + age);

  setText(c.now, bot.step || 'Нет данных о текущем шаге');

  // Task: hide when empty, id-like ("tsk-1643") or a plain copy of the current step.
  const task = typeof bot.task === 'string' ? bot.task.trim() : '';
  const showTask = !!task && !/^tsk-\d+$/i.test(task) && task !== (bot.step || '').trim();
  setHidden(c.taskBlock, !showTask);
  setText(c.task, showTask ? task : '');

  // today
  const td = bot.today || {};
  const ev = Number(td.events) || 0, tk = Number(td.tasks_done) || 0;
  setText(c.sSteps.v, ev);
  setText(c.sSteps.l, plural(ev, 'шаг', 'шага', 'шагов'));
  setText(c.sTasks.v, tk);
  setText(c.sTasks.l, plural(tk, 'задача', 'задачи', 'задач'));
  setText(c.sHours.v, fmtHours(td.working_min));

  // usage share
  const period = state.usage && state.usage.period;
  setText(c.usageLabel, USAGE_SPENT[period] || 'Расход');
  const share = Number.isFinite(bot.usage_share) ? clamp(bot.usage_share, 0, 1) : null;
  setWidth(c.fillBar, share == null ? '0%' : (share > 0 ? Math.max(share * 100, 2) : 0) + '%');
  setAttr(c.fuel, 'aria-valuenow', share == null ? null : Math.round(share * 100));
  setText(c.share, share == null ? 'нет данных' : Math.round(share * 100) + '% от всех');

  // last steps (rebuilt only when they change); the newest entry is usually the current step, already shown above
  let hist = (bot.history || []).slice(0, STEPS_SHOWN + 1);
  if (hist.length > 1 && hist[0].step === bot.step) hist = hist.slice(1);
  hist = hist.slice(0, STEPS_SHOWN);
  const sig = bot.id + '\n' + hist.map((x) => x.t + '|' + x.status + '|' + x.step).join('\n');
  if (sig !== c.histSig) {
    c.histSig = sig;
    c.hist.textContent = '';
    if (!hist.length) c.hist.append(h('li', { class: 'bhq-step-empty', text: 'Шагов пока нет.' }));
    for (const x of hist) c.hist.append(histRow(x));
  }

  // chat button
  const has = !!bot.chat_url;
  if (c.cta.disabled === has) c.cta.disabled = !has;
  setAttr(c.cta, 'title', has ? null : 'Ссылка на чат пока не задана');
}

/* ---- live feed (last 4 events of the whole building, newest on top) */

function makeRow(ev, state) {
  const bot = state.bots && state.bots[ev.bot];
  const name = ev.name || (bot && bot.name) || ev.bot || '';
  return h('li', { class: 'bhq-frow', 'data-s': ev.status || 'idle' },
    h('time', { class: 'bhq-num', text: hhmm(parseTs(ev.t)), datetime: ev.t || '' }),
    h('span', { class: 'bhq-ftxt' }, h('b', { text: name }), ' ' + (ev.step || statusLabel(ev.status))));
}

function retireRow(row) {
  U.feedOut.add(row);
  row.classList.add('is-out');
  const done = () => { row.remove(); U.feedOut.delete(row); };
  if (reducedMotion.matches) done(); else setTimeout(done, FEED_OUT_MS);
}

function renderFeed(state) {
  const fd = U.feed;
  const items = (Array.isArray(state.feed) ? state.feed : []).slice(0, FEED_ROWS);

  // Stable keys; identical events are told apart by counting from the oldest end.
  const seenBase = new Map();
  const keys = new Array(items.length);
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i];
    const base = e.t + '|' + e.bot + '|' + e.status + '|' + e.step;
    const n = seenBase.get(base) || 0;
    seenBase.set(base, n + 1);
    keys[i] = n ? base + '#' + n : base;
  }

  const keep = new Set(keys);
  for (const [k, row] of U.feedRows) {
    if (!keep.has(k)) { U.feedRows.delete(k); retireRow(row); }
  }

  let added = 0;
  for (const k of keys) if (!U.feedRows.has(k)) added++;
  // The first paint and a wholesale replacement do not animate; a trickle of new events slides in.
  const animate = !U.feedFirst && added > 0 && added < FEED_ROWS && !reducedMotion.matches;

  const els = items.map((ev, i) => {
    let row = U.feedRows.get(keys[i]);
    if (!row) {
      row = makeRow(ev, state);
      if (animate) {
        row.classList.add('is-new');
        const settle = () => row.classList.remove('is-new');
        row.addEventListener('animationend', settle, { once: true });
        setTimeout(settle, 700); // animationend never fires in a background tab
      }
      U.feedRows.set(keys[i], row);
    }
    return row;
  });
  reconcile(fd.list, els.concat([...U.feedOut]), 0);

  setHidden(fd.empty, items.length > 0);
  U.feedFirst = false;
}
