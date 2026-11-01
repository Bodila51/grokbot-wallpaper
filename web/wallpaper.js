/*
 * Wallpaper mode UI (?mode=wallpaper, for Lively Wallpaper): the office alone plus ONE small glass status line,
 * e.g. «6 работают · 1 ждёт тебя». Same two entry points as web/ui/ui.js, so app.js treats it as the UI module.
 *
 *   initUI()                       builds the status line (no panels, no floors list, no zoom, no feed)
 *   renderUI(state, view)          idempotent; only touches the DOM when a value changed
 *
 * Attention = waiting_user + stuck (both need a human), highlighted; errors get their own red segment.
 * Style lives in web/styles.css under "wallpaper mode". All data goes in through textContent.
 */

// Russian plural forms [one, few, many].
const FORMS = {
  working: ['работает', 'работают', 'работают'],
  attention: ['ждёт тебя', 'ждут тебя', 'ждут тебя'],
  error: ['ошибка', 'ошибки', 'ошибок'],
};

function plural(n, [one, few, many]) {
  n = Math.abs(Math.trunc(n));
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

let el = null;
const segs = {};            // key -> { root, num, label }
let rest = null;            // «все отдыхают» / «ботов пока нет» when nothing is working or waiting

function seg(key, cls) {
  const num = Object.assign(document.createElement('b'), { className: 'wp-num' });
  const label = document.createElement('span');
  const dot = Object.assign(document.createElement('i'), { className: 'wp-dot' });
  dot.setAttribute('aria-hidden', 'true');
  const root = Object.assign(document.createElement('span'), { className: `wp-seg ${cls}` });
  root.hidden = true;
  root.append(dot, num, label);
  segs[key] = { root, num, label };
  return root;
}

export function initUI() {
  if (new URLSearchParams(location.search).get('tags') === '1') document.documentElement.classList.add('wp-tags');
  el = document.createElement('div');
  el.className = 'wp-status';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'off');         // a wallpaper must not chatter at screen readers every second
  rest = Object.assign(document.createElement('span'), { className: 'wp-seg wp-rest' });
  rest.hidden = true;
  el.append(seg('working', 'wp-working'), seg('attention', 'wp-attention'), seg('error', 'wp-error'), rest);
  el.hidden = true;                             // shown with the first state, so it never flashes an empty pill
  document.body.append(el);
}

function set(node, text) { if (node.textContent !== text) node.textContent = text; }
function show(node, on) { if (node.hidden !== !on) node.hidden = !on; }

export function renderUI(state) {
  if (!el || !state) return;
  let working = 0, attention = 0, error = 0, total = 0;
  for (const bot of Object.values(state.bots || {})) {
    total++;
    switch (bot.effective_status || bot.status) {
      case 'working': working++; break;
      case 'waiting_user': case 'stuck': attention++; break;
      case 'error': error++; break;
      default: break;
    }
  }
  const counts = { working, attention, error };
  for (const key of Object.keys(counts)) {
    const n = counts[key], s = segs[key];
    show(s.root, n > 0);
    if (n > 0) { set(s.num, String(n)); set(s.label, ' ' + plural(n, FORMS[key])); }
  }
  const quiet = working + attention + error === 0;
  show(rest, quiet);
  if (quiet) set(rest, total ? 'все отдыхают' : 'ботов пока нет');
  show(el, true);
}
