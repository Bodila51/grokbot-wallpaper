// Grok Bot Wallpaper: live eyes on the big sphere + the user's bots as live cards.
// The eyes follow the cursor (Lively forwards mouse moves to the wallpaper); with no cursor around they wander,
// blink, glance at whichever bot needs the user, and get sleepy when every bot is resting. Data: /api/state (the
// journal server); without it, the bundled demo state animates on its own. At most 30 frames per second.

const STATUS = {
  working: { text: 'работает', c: 'var(--working)' },
  waiting_user: { text: 'ждёт тебя', c: 'var(--waiting)' },
  error: { text: 'ошибка', c: 'var(--error)' },
  stuck: { text: 'завис', c: 'var(--stuck)' },
  done: { text: 'готово', c: 'var(--done)' },
  idle: { text: 'отдыхает', c: 'var(--idle)' },
};
const ORDER = ['waiting_user', 'error', 'stuck', 'working', 'done', 'idle'];
const SHAPES = ['sphere', 'rounded_square', 'pill', 'triangle', 'pentagon', 'hexagon', 'star4', 'star6', 'clover', 'rounded_cube', 'cone', 'trio'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the eyes: the original painted eyes as layers (assets/face/eyes.json), moved like Grok Bot's own animation ----------
// In the original the eyes are painted on a 3D ball: to look somewhere the ball turns, so the eyes slide over its
// surface and flatten toward its edge. Here the same ball is cut by the screen's bottom edge; each eye is turned with
// it and drawn with the exact projection of the turned surface under it; past the ball's edge it is hidden (.bot is
// clipped to the ball), so the eyes slide out of sight over the edge as in the original. Interest makes the eyes
// bigger, a big change of gaze comes with a blink. No squinting: the original never narrows its eyes.
const SPHERE = { w: 1369, h: 613 }, BALL = { x: 684.5, y: 684.58, r: 683.58 };   // the ball in sphere.png pixels
const VIEW = 0.8;                                         // the screen's distance in front of the ball, in radii
const TURN = { side: 0.55, up: 0.34, down: 0.3 };        // how far the ball turns, radians
// the original's blink, frame by frame at 30 fps (ms, how open): the pill shrinks along its length to a short dash,
// is gone for three frames, then grows back with a hair of overshoot
const BLINK = [[0, 1], [33, 0.7], [66, 0.14], [85, 0], [185, 0], [215, 0.45], [250, 0.92], [290, 1.04], [330, 1]];
const botEl = document.querySelector('.bot');
const eyes = [];
const gaze = { yaw: spring(0, 0.3), pitch: spring(0, 0.3), size: spring(1, 0.22) };
let rest = null;                                        // where the face looks in the approved picture
const pct = (v) => `${(v * 100).toFixed(3)}%`;
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
fetch('../assets/face/eyes.json').then((r) => r.json()).then((info) => {
  for (const name of ['l', 'r']) {
    const e = info[name], els = [...document.querySelectorAll(`.eye[data-eye="${name}"]`)];
    for (const el of els) Object.assign(el.style, {
      left: pct(e.x / SPHERE.w), top: pct(e.y / SPHERE.h), width: pct(e.w / SPHERE.w), height: pct(e.h / SPHERE.h),
      transformOrigin: `${pct((e.cx - e.x) / e.w)} ${pct((e.cy - e.y) / e.h)}`,
    });
    const x = (e.cx - BALL.x) / BALL.r, y = (e.cy - BALL.y) / BALL.r;
    const p = [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))];
    const t1 = norm([p[2], 0, -p[0]]), t2 = cross(p, t1);           // the surface under the eye
    const det = t1[0] * t2[1] - t2[0] * t1[1];
    const th = ((e.axis || 0) * Math.PI) / 180, len = e.len || 230, wid = e.wid || 120;
    const u = [Math.sin(th), -Math.cos(th)], v = [Math.cos(th), Math.sin(th)];
    // the eye's outline with its soft light rim, as offsets from its centre in the painting's pixels
    const rim = Array.from({ length: 16 }, (_, i) => {
      const f = (Math.PI * 2 * i) / 16, r = wid / 2 + 14, a = Math.sign(Math.cos(f)) * (len - wid) / 2 + r * Math.cos(f), b = r * Math.sin(f);
      return [u[0] * a + v[0] * b, u[1] * a + v[1] * b];
    });
    eyes.push({
      els, p, t1, t2, inv: [t2[1] / det, -t2[0] / det, -t1[1] / det, t1[0] / det], rim,
      // the dark pill in the layer's own pixels: centre, length along its lean, width across it
      pill: { x: e.cx - e.x, y: e.cy - e.y, w: e.w, len, wid, u, v },
    });
  }
  const f = norm([0, 1, 2].map((i) => eyes[0].p[i] + eyes[1].p[i]));
  rest = { yaw: Math.atan2(f[0], f[2]), pitch: Math.atan2(f[1], Math.hypot(f[0], f[2])) };
});

function spring(x0, response = 0.28) {
  return { x: x0, v: 0, t: x0, w: (2 * Math.PI) / response };
}
function stepSpring(s, dt) {                             // critically damped, solved exactly: stable at any dt
  const c1 = s.x - s.t, c2 = s.v + s.w * c1, e = Math.exp(-s.w * dt);
  s.x = s.t + (c1 + c2 * dt) * e;
  s.v = (c2 - s.w * (c1 + c2 * dt)) * e;
}
function turn(v, yaw, pitch) {                           // the ball turned: down by pitch, then right by yaw
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const y = v[1] * cp + v[2] * sp, z = -v[1] * sp + v[2] * cp;
  return [v[0] * cy + z * sy, y, -v[0] * sy + z * cy];
}
function pose(e, yaw, pitch) {                           // where the eye sits on the turned ball, and its painting there
  const p = turn(e.p, yaw, pitch), a = turn(e.t1, yaw, pitch), b = turn(e.t2, yaw, pitch), [i0, i1, i2, i3] = e.inv;
  // the eye as painted -> the eye on the turned surface (its tangent plane, projected)
  return { p, m: [a[0] * i0 + b[0] * i2, a[1] * i0 + b[1] * i2, a[0] * i1 + b[0] * i3, a[1] * i1 + b[1] * i3] };
}

// The eyes never touch the ball's outline: a turn that would bring any part of an eye (at its biggest, rim included)
// closer to the edge than GAP is shortened along the same direction, so the gaze still points the same way.
const GAP = 0.08, BIGGEST = 1.2;
function clear(yaw, pitch) {
  for (const e of eyes) {
    const { p, m } = pose(e, yaw, pitch), k = BIGGEST / BALL.r;
    for (const [ox, oy] of e.rim) {
      if (Math.hypot(p[0] + (m[0] * ox + m[2] * oy) * k, p[1] + (m[1] * ox + m[3] * oy) * k) > 1 - GAP) return false;
    }
  }
  return true;
}
function keepClear(yaw, pitch) {
  if (clear(yaw, pitch)) return [yaw, pitch];
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) { const t = (lo + hi) / 2; if (clear(yaw * t, pitch * t)) lo = t; else hi = t; }
  return [yaw * lo, pitch * lo];
}

let target = null;               // a screen point to look at, or null = straight ahead (the approved pose)
let lastMove = -1e9, lastPointer = null, mood = 'calm', attention = false, glance = null;
let blinkAt = performance.now() + 500, blinkStart = -1e9, surprisedUntil = 0, happyUntil = 0;   // wakes with a blink, like the original

addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (lastPointer) {
    const sp = Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y) / Math.max(1, now - lastPointer.t) * 1000;
    if (sp > 4200 && !REDUCED) surprisedUntil = now + 650;     // a fast swipe: the eyes pop open for a moment
  }
  lastPointer = { x: e.clientX, y: e.clientY, t: now };
  lastMove = now;
  target = { x: e.clientX, y: e.clientY };
}, { passive: true });
addEventListener('pointerleave', () => { lastMove = -1e9; });

// ?look=0.2,0.15 pins a pretend cursor (fractions of the screen) and holds the pose still, for screenshots;
// &blink=66 also holds the blink at that moment (ms)
const params = new URLSearchParams(location.search), pinned = params.get('look');
const heldBlink = pinned && params.has('blink') ? Number(params.get('blink')) : null;
if (pinned) {
  const [fx, fy] = pinned.split(',').map(Number);
  blinkAt = Infinity;
  setInterval(() => { lastMove = performance.now(); target = { x: fx * innerWidth, y: fy * innerHeight }; }, 200);
}

function aim(now) {
  if (glance && now < glance.until) return glance;
  if (now - lastMove < 6000 && target) return target;
  // nobody around: the gaze wanders slowly between a few calm points
  if (!aim.next || now > aim.next) {
    aim.next = now + 2500 + Math.random() * 3500;
    aim.point = Math.random() < 0.3 ? null : { x: innerWidth * (0.1 + Math.random() * 0.8), y: innerHeight * (0.05 + Math.random() * 0.55) };
  }
  return aim.point;
}

function look(now) {
  const pt = aim(now);
  let yaw = 0, pitch = 0;
  if (pt && rest) {                                       // turn the face toward the point
    const r = botEl.getBoundingClientRect(), k = r.width / SPHERE.w;
    const X = (pt.x - r.left - BALL.x * k) / (BALL.r * k), Y = (pt.y - r.top - BALL.y * k) / (BALL.r * k);
    yaw = clamp(Math.atan2(X, VIEW) - rest.yaw, -TURN.side, TURN.side);
    pitch = clamp(Math.atan2(Y, Math.hypot(X, VIEW)) - rest.pitch, -TURN.up, TURN.down);
  }
  const sleepy = mood === 'sleepy' && now - lastMove > 6000;
  if (sleepy) { yaw *= 0.3; pitch = TURN.down * 0.6; }    // night, nobody around: the face sinks, the blinks slow down
  [yaw, pitch] = keepClear(yaw, pitch);
  const jump = Math.hypot(yaw - gaze.yaw.t, pitch - gaze.pitch.t) > 0.4;
  gaze.yaw.t = yaw; gaze.pitch.t = pitch;
  const keen = now < surprisedUntil || now < happyUntil || attention || (glance && now < glance.until);
  gaze.size.t = keen ? 1.2 : 1;
  // blinks every few seconds, sometimes twice; a big change of gaze comes with one
  if ((now > blinkAt || jump) && now - blinkStart > 600 && !REDUCED && !pinned) {
    blinkStart = now;
    if (blinkAt !== Infinity) blinkAt = now + (Math.random() < 0.2 ? 420 : (sleepy ? 4000 : 2400) + Math.random() * 4200);
  }
}

function openness(now) {                                 // the blink curve at this moment
  const t = heldBlink ?? now - blinkStart;
  if (t >= BLINK[BLINK.length - 1][0]) return 1;
  const i = BLINK.findIndex(([ms]) => ms > t), [t0, v0] = BLINK[i - 1], [t1, v1] = BLINK[i];
  return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
}

// The blink as in the original: the pill gets shorter and stays a pill (round ends), shorter than it is wide it is a
// short dash across, then nothing. Our eyes are painted, so the pill is cut out by a capsule-shaped window of that
// length, centred on the eye and leaning with it; a little narrower than the eye while closed, so its ends are round.
function capsule(q, o, k) {
  if (o >= 0.999) return 'none';
  const W = (q.wid * 0.86 + (q.wid * 0.14 + 30) * Math.min(1, o) ** 3) * k, L = Math.max(0, o) * (q.len + 30) * k;
  if (L < 0.5) return 'polygon(0 0, 0 0, 0 0)';
  const [d, e] = L >= W ? [q.u, q.v] : [q.v, q.u], r = Math.min(W, L) / 2, h = Math.abs(L - W) / 2;
  const cx = q.x * k, cy = q.y * k, pts = [];
  for (const side of [1, -1]) {
    for (let i = 0; i <= 12; i++) {
      const f = -Math.PI / 2 + (Math.PI * i) / 12, a = side * (h + r * Math.cos(f)), b = side * r * Math.sin(f);
      pts.push(`${(cx + d[0] * a + e[0] * b).toFixed(1)}px ${(cy + d[1] * a + e[1] * b).toFixed(1)}px`);
    }
  }
  return `polygon(${pts.join(', ')})`;
}

function draw(now) {
  if (!rest) return;
  const R = BALL.r * (botEl.clientWidth / SPHERE.w), s = gaze.size.x, o = openness(now);
  for (const e of eyes) {
    const { p, m } = pose(e, gaze.yaw.x, gaze.pitch.x);
    const tf = `translate(${((p[0] - e.p[0]) * R).toFixed(2)}px, ${((p[1] - e.p[1]) * R).toFixed(2)}px) matrix(${m.map((v) => v.toFixed(4)).join(', ')}, 0, 0) scale(${s.toFixed(4)})`;
    const clip = capsule(e.pill, o, e.els[0].offsetWidth / e.pill.w);
    for (const el of e.els) { el.style.transform = tf; el.style.clipPath = clip; }
  }
}

let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  acc += now - last; last = now;
  if (acc < 1000 / 30) return;                           // 30 fps is plenty for a wallpaper
  const dt = Math.min(0.05, acc / 1000); acc = 0;
  look(now);
  for (const s of Object.values(gaze)) {
    if (REDUCED || pinned) { s.x = s.t; s.v = 0; } else stepSpring(s, dt);
  }
  draw(now);
}
requestAnimationFrame(frame);

// ---------- avatars: flat shapes with white eyes, from the bot's look (or a hash of its id) ----------
function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function poly(n, r, rot = -90) {
  return Array.from({ length: n }, (_, i) => { const a = ((rot + (360 / n) * i) * Math.PI) / 180; return `${50 + r * Math.cos(a)},${52 + r * Math.sin(a)}`; }).join(' ');
}
function star(n, r1, r2) {
  return Array.from({ length: n * 2 }, (_, i) => { const a = ((-90 + (180 / n) * i) * Math.PI) / 180, r = i % 2 ? r2 : r1; return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`; }).join(' ');
}
function body(shape, c) {
  const round = (pts) => `<polygon points="${pts}" fill="${c}" stroke="${c}" stroke-width="16" stroke-linejoin="round"/>`;
  switch (shape) {
    case 'rounded_square': return `<rect x="9" y="9" width="82" height="82" rx="24" fill="${c}"/>`;
    case 'rounded_cube': return `<rect x="13" y="13" width="74" height="74" rx="22" fill="${c}" transform="rotate(-14 50 50)"/>`;
    case 'pill': return `<rect x="4" y="22" width="92" height="58" rx="29" fill="${c}"/>`;
    case 'triangle': return round('50,16 88,82 12,82');
    case 'cone': return round('50,12 84,84 16,84');
    case 'pentagon': return round(poly(5, 36));
    case 'hexagon': return round(poly(6, 36, 0));
    case 'star4': return round(star(4, 40, 17));
    case 'star6': return round(star(6, 38, 22));
    case 'clover': return [[50, 28], [72, 50], [50, 72], [28, 50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="23" fill="${c}"/>`).join('') + `<circle cx="50" cy="50" r="22" fill="${c}"/>`;
    case 'trio': return `<circle cx="32" cy="62" r="24" fill="${c}"/><circle cx="68" cy="62" r="22" fill="${c}" opacity=".85"/><circle cx="52" cy="30" r="20" fill="${c}" opacity=".7"/>`;
    default: return `<circle cx="50" cy="50" r="46" fill="${c}"/>`;
  }
}
const THUMBS = new Set(['grok-bot', 'jevopus', 'x-writer', 'banner-visuals', 'analytics-analyst', 'competitor-watch', 'qt-scout',
  'ideas-sparring', 'bookmarks-brain', 'codila-x-researcher', 'trendy-x', 'substack', 'x-ads-manager', 'warren-buffett', 'finance-team']);
function face3d(bot, look) {
  const id = bot.avatar || bot.id;
  return THUMBS.has(id) ? `<img src="../assets/blobs/thumbs/${id}.png" alt="" draggable="false">` : avatar(bot, look);
}
function avatar(bot, look) {
  const shape = look?.shape || SHAPES[hash(bot.id) % SHAPES.length];
  const c = look?.color || bot.color || '#8E8E93';
  const tilt = ((hash(bot.id + 't') % 30) - 15);
  const eye = 'fill="#fff"';
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * bl < 0.18;          // dark avatars get a faint rim on the dark glass
  return `<svg viewBox="0 0 100 100" aria-hidden="true"${dark ? ' class="is-dark"' : ''}>${body(shape, c)}<g transform="rotate(${tilt} 50 50)"><rect x="35" y="36" width="10" height="22" rx="5" ${eye}/><rect x="55" y="36" width="10" height="22" rx="5" ${eye}/></g></svg>`;
}

// ---------- the live cards: the team, a card for each bot that needs the user, everyone as 3D avatars ----------
const $ = (id) => document.getElementById(id);
const stack = $('w-stack'), team = $('team'), grid = $('bot-grid'), needs = $('bot-needs'), tip = $('tip');
const NEEDS = ['waiting_user', 'error', 'stuck'], NEEDS_FIRST = ['error', 'waiting_user', 'stuck'];
const TONE = { waiting_user: 'is-waiting', stuck: 'is-waiting', error: 'is-error' };
const ASKS = { waiting_user: 'ждёт твоего ответа', stuck: 'завис, загляни', error: 'ошибка' };
let looks = {}, state = null, byId = {}, crew = '';

function statusOf(b) { return STATUS[b.effective_status || b.status] ? (b.effective_status || b.status) : 'idle'; }
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

function render(st) {
  const bots = Object.values(st.bots || {});
  const counts = { working: 0, waiting_user: 0, error: 0, stuck: 0, done: 0, idle: 0 };
  for (const b of bots) counts[statusOf(b)]++;
  const waiting = counts.waiting_user + counts.stuck;
  countTo($('n-working'), counts.working);
  countTo($('n-waiting'), waiting);
  countTo($('n-error'), counts.error);
  countTo($('bot-total'), bots.length);
  $('l-working').textContent = plural(counts.working, 'работает', 'работают', 'работают');
  $('l-waiting').textContent = plural(waiting, 'ждёт', 'ждут', 'ждут');
  $('l-error').textContent = plural(counts.error, 'ошибка', 'ошибки', 'ошибок');
  $('row-waiting').classList.toggle('is-zero', !waiting);
  $('row-error').classList.toggle('is-zero', !counts.error);
  team.classList.toggle('is-working', counts.working > 0);           // green while anyone works, graphite at rest
  team.classList.toggle('is-idle', !counts.working);
  const pct = Math.max(0, Math.min(100, Math.round(st.usage?.total_used_pct ?? 0)));
  $('usage').textContent = `${pct}%`;
  team.style.setProperty('--p', (pct / 100).toFixed(3));

  byId = Object.fromEntries(bots.map((b) => [b.id, b]));
  // who needs the user: a card each, two at most, most urgent first; a card that stays keeps its element
  const top = bots.filter((b) => NEEDS.includes(statusOf(b)))                 // an error first: it blocks work
    .sort((a, b) => NEEDS_FIRST.indexOf(statusOf(a)) - NEEDS_FIRST.indexOf(statusOf(b)) || byName(a, b)).slice(0, 2);
  const keys = top.map((b) => `${b.id}:${statusOf(b)}`);
  for (const el of needs.querySelectorAll('.need:not(.is-leaving)')) {
    if (keys.includes(el.dataset.key)) continue;
    if (REDUCED) { el.remove(); continue; }
    el.classList.add('is-leaving');                       // folds away; the cards below rise into its place
    setTimeout(() => el.remove(), 420);
  }
  top.forEach((b, i) => {
    const s = statusOf(b), key = keys[i];
    let el = [...needs.children].find((n) => n.dataset.key === key && !n.classList.contains('is-leaving'));
    if (!el) {
      el = document.createElement('article');
      el.className = `card need ${TONE[s]}`;
      Object.assign(el.dataset, { key, id: b.id, s });
      el.innerHTML = `${face3d(b, b.look || looks[b.id])}<div class="need__words"><div class="need__title"></div><div class="need__sub"></div></div><span class="bokeh" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`;
    }
    el.querySelector('.need__title').textContent = b.name;
    el.querySelector('.need__sub').textContent = b.step ? `${ASKS[s]} · ${b.step}` : ASKS[s];
    const live = needs.querySelectorAll('.need:not(.is-leaving)');
    if (live[i] !== el) needs.insertBefore(el, live[i] || null);
  });

  // everyone, in a stable order (avatars never shuffle on a wallpaper); only the status dot changes
  const sig = bots.map((b) => b.id).sort().join('|');
  if (sig !== crew) {
    crew = sig;
    grid.innerHTML = bots.slice().sort(byName).map((b) => `<button class="av" type="button" data-id="${esc(b.id)}">${face3d(b, b.look || looks[b.id])}<i class="orb"></i></button>`).join('');
  }
  for (const av of grid.children) {
    const b = byId[av.dataset.id], s = statusOf(b);
    if (av.dataset.s === s) continue;
    av.dataset.s = s;
    av.style.setProperty('--c', STATUS[s].c);
    av.setAttribute('aria-label', `${b.name}: ${STATUS[s].text}`);
  }
  placeAll();

  const busy = counts.working + counts.waiting_user + counts.error + counts.stuck;
  const hour = new Date().getHours();
  mood = busy === 0 && (hour >= 22 || hour < 7) ? 'sleepy' : 'calm';
  if (counts.done > (render.done ?? counts.done) && !REDUCED) happyUntil = performance.now() + 1200;   // a task just finished
  render.done = counts.done;
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function countTo(el, to) {                               // numbers roll to their new value instead of jumping
  const from = Number(el.dataset.v ?? 0);
  if (from === to) return;
  el.dataset.v = to;
  const t0 = performance.now(), dur = REDUCED ? 0 : 700;
  const tick = (now) => {
    const k = dur ? Math.min(1, Math.max(0, (now - t0) / dur)) : 1, e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// hover an avatar: its name, status and what it is doing now; while the cursor is on the cards, Grok Bot's eyes widen
stack.addEventListener('pointerover', (e) => {
  const av = e.target.closest('.av');
  if (!av || drag) return;
  const b = byId[av.dataset.id];
  if (!b) return;
  tip.innerHTML = `<b>${esc(b.name)}</b><span>${STATUS[statusOf(b)].text}</span>${b.step ? `<p>${esc(b.step)}</p>` : ''}`;
  tip.hidden = false;
  const r = av.getBoundingClientRect(), t = tip.getBoundingClientRect();
  const x = Math.min(innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
  const y = r.top - t.height - 8 > 8 ? r.top - t.height - 8 : r.bottom + 8;
  Object.assign(tip.style, { left: `${x}px`, top: `${y}px` });
});
stack.addEventListener('pointerout', (e) => { if (!e.relatedTarget?.closest?.('.av')) tip.hidden = true; });
stack.addEventListener('pointerenter', () => { attention = true; });
stack.addEventListener('pointerleave', () => { attention = false; });

// every ~20 s, if someone needs the user, Grok Bot looks at that bot for a moment
setInterval(() => {
  const el = needs.querySelector('.need:not(.is-leaving)');
  if (!el || drag || performance.now() - lastMove < 4000) return;
  const r = el.querySelector('img, svg').getBoundingClientRect();
  glance = { x: r.left + r.width / 2, y: r.top + r.height / 2, until: performance.now() + 1800 };
}, 20000);

// ---------- moving the cards: drag 1:1 from where you grabbed, edges attract, the spot is remembered ----------
const MARGIN = 20, SNAP = 28;
const widgets = [
  { el: stack, key: 'gbw.pos.stack', home: (w) => ({ x: innerWidth - w.width - u(MARGIN), y: u(MARGIN) }) },
];
let drag = null;
function u(px) { return px * Math.min(1.45, Math.max(1, innerWidth * 0.000525)); }
function readPos(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function writePos(key, v) { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* private mode: not remembered */ } }
function put(w, p) {
  const x = Math.min(Math.max(0, p.x), innerWidth - w.el.offsetWidth), y = Math.min(Math.max(0, p.y), innerHeight - w.el.offsetHeight);
  Object.assign(w.el.style, { left: `${x}px`, top: `${y}px`, right: 'auto' });
  return { x, y };
}
function placeAll() {
  for (const w of widgets) {
    if (drag && drag.w === w) continue;
    const saved = readPos(w.key);
    put(w, saved ? { x: saved.fx * innerWidth, y: saved.fy * innerHeight } : w.home(w.el.getBoundingClientRect()));
  }
}
function settle(w, p) {
  w.el.classList.add('is-settling');
  const c = put(w, p);
  setTimeout(() => w.el.classList.remove('is-settling'), 460);
  return c;
}
for (const w of widgets) {
  w.el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = w.el.getBoundingClientRect();
    drag = { w, id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    w.el.setPointerCapture(e.pointerId);
    w.el.classList.add('is-dragging');
    tip.hidden = true;
  });
  w.el.addEventListener('pointermove', (e) => {
    if (!drag || drag.w !== w || e.pointerId !== drag.id) return;
    put(w, { x: e.clientX - drag.dx, y: e.clientY - drag.dy });
  });
  const end = () => {
    if (!drag || drag.w !== w) return;
    drag = null;
    w.el.classList.remove('is-dragging');
    // near an edge it settles at the margin, like a widget on a desktop
    let x = w.el.offsetLeft, y = w.el.offsetTop;
    const m = u(MARGIN), sn = u(SNAP), W = w.el.offsetWidth, H = w.el.offsetHeight;
    if (x < m + sn) x = m; else if (innerWidth - x - W < m + sn) x = innerWidth - W - m;
    if (y < m + sn) y = m; else if (innerHeight - y - H < m + sn) y = innerHeight - H - m;
    const c = settle(w, { x, y });
    writePos(w.key, { fx: c.x / innerWidth, fy: c.y / innerHeight });
  };
  w.el.addEventListener('pointerup', end);
  w.el.addEventListener('pointercancel', end);
  w.el.addEventListener('dblclick', () => { writePos(w.key, null); settle(w, w.home(w.el.getBoundingClientRect())); });
}
addEventListener('resize', placeAll);
document.fonts?.ready.then(placeAll);

// the column leans a few degrees toward the cursor, like a card held in the hand
const lean = widgets.map(() => ({ tx: spring(0, 0.45), ty: spring(0, 0.45) }));
let leanLast = performance.now();
(function tiltLoop(now) {
  requestAnimationFrame(tiltLoop);
  if (document.hidden || !lastPointer) { leanLast = now; return; }
  const dt = Math.min(0.05, Math.max(0, (now - leanLast) / 1000)); leanLast = now;
  widgets.forEach((w, i) => {
    const r = w.el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = (lastPointer.x - cx) / (r.width / 2 + 160), dy = (lastPointer.y - cy) / (r.height / 2 + 160);
    const near = Math.max(0, 1 - Math.hypot(dx, dy) / 2.2);
    lean[i].ty.t = REDUCED ? 0 : Math.max(-1, Math.min(1, dx)) * 4 * near;
    lean[i].tx.t = REDUCED ? 0 : Math.max(-1, Math.min(1, -dy)) * 4 * near;
    stepSpring(lean[i].tx, dt); stepSpring(lean[i].ty, dt);
    w.el.style.setProperty('--tx', `${lean[i].tx.x.toFixed(2)}deg`);
    w.el.style.setProperty('--ty', `${lean[i].ty.x.toFixed(2)}deg`);
  });
})(performance.now());

// ---------- data: the live server, else the bundled demo ----------
async function poll() {
  try {
    const res = await fetch('../api/state', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(res.status);
    state = await res.json();
    render(state);
    setTimeout(poll, 2000);
  } catch {
    if (!state) startDemo();
  }
}
async function startDemo() {
  state = await (await fetch('../data/demo-state.json')).json();
  render(state);
  const steps = ['working', 'working', 'working', 'done', 'idle', 'waiting_user', 'error'];
  setInterval(() => {
    const bots = Object.values(state.bots);
    const b = bots[Math.floor(Math.random() * bots.length)];
    b.effective_status = b.status = steps[Math.floor(Math.random() * steps.length)];
    b.last_event = new Date().toISOString();
    render(state);
  }, 3500);
}
fetch('../data/demo-looks.json').then((r) => (r.ok ? r.json() : {})).then((j) => { looks = j.looks || j || {}; if (state) { crew = ''; needs.innerHTML = ''; render(state); } }).catch(() => {});
poll();
