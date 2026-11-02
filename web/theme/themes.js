// Theme registry. The built-in office is not a theme: it is what runs when nothing is selected, and none of
// the hooks below run, so its pixels stay put. A theme is a module (see ranch.js) plus one CATALOG row.
//
// The feed link stays in the URL hash. A theme never goes there.
//   ?theme=<id>                  this visit. ?theme=office or ?theme=default forces the office.
//   localStorage bothq.theme     used when the query is absent. The picker writes it.
// An unknown id is ignored. ?time= still wins over a theme's fixed light (daylight.js).

import { INTERIOR_CHOICES, resolveFloorInterior, writeFloorThemeChoice, readFloorThemeChoices } from './interiors.js';

const STORAGE_KEY = 'bothq.theme';

export const CATALOG = [
  { id: 'ranch', label: 'Texas Hill Country' },
];

const LOADERS = {
  ranch: () => import('./ranch.js').then((m) => m.ranchTheme),
};

let current = null;

export function activeTheme() { return current; }

function known(id) {
  const v = String(id || '').trim().toLowerCase();
  return LOADERS[v] ? v : null;
}

/** The theme that should dress this visit, or null for the untouched office. */
export function selectedThemeId() {
  const q = new URLSearchParams(location.search);
  if (q.has('theme')) {
    const raw = (q.get('theme') || '').trim().toLowerCase();
    if (!raw || raw === 'office' || raw === 'default') return null;
    const id = known(raw);
    if (id) return id;
  }
  try { return known(localStorage.getItem(STORAGE_KEY)); }
  catch { return null; }
}

function ensureStylesheet(id, href) {
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.append(link);
  }
  if (link.getAttribute('href') !== href) link.href = href;
}

/** Apply the selected theme's CSS, font and sky before the scene is created. Null stays the office. */
export async function bootTheme() {
  const id = selectedThemeId();
  current = null;
  const root = document.documentElement;
  if (id && LOADERS[id]) {
    try {
      current = await LOADERS[id]();
      root.dataset.theme = current.id;
      if (current.css) ensureStylesheet('bothq-theme-css', current.css);
      if (current.fontHref) ensureStylesheet('bothq-theme-font', current.fontHref);
      if (current.sky) {
        const { setStudioBackdrop } = await import('../scene/studio.js');
        setStudioBackdrop(current.sky);
      }
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && current.themeColor) meta.setAttribute('content', current.themeColor);
    } catch (err) {
      console.warn('[theme] failed to load, staying on the office:', err);
      current = null;
      root.removeAttribute('data-theme');
    }
  } else {
    root.removeAttribute('data-theme');
  }
  ensureStylesheet('bothq-theme-picker', new URL('./picker.css', import.meta.url).href);
  ensureStylesheet('bothq-interiors', new URL('./interiors.css', import.meta.url).href);
  window.bothq = Object.assign(window.bothq || {}, { theme: current?.id || 'office' });
  return current;
}

const EXTERIOR = [{ id: '', label: 'Office' }, ...CATALOG];
let onFloorsChanged = () => {};
let menu = null;

export function onFloorThemesChanged(fn) { onFloorsChanged = fn; }

function exteriorLabel(id) {
  return EXTERIOR.find((o) => o.id === (id || ''))?.label || 'Office';
}

/** Building theme plus one interior picker per floor. Exterior changes reload; floor changes do not. */
export function mountThemePicker(slot) {
  if (!slot || slot.querySelector('.bhq-theme') || menu) return;
  const cur = selectedThemeId() || '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bhq-theme bhq-surface bhq-theme-btn';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'Theme. The feed address stays in the link after #.';
  button.textContent = exteriorLabel(cur);
  const chev = document.createElement('i');
  chev.className = 'bhq-theme-chev';
  chev.setAttribute('aria-hidden', 'true');
  button.append(chev);

  const pop = document.createElement('div');
  pop.className = 'bhq-theme-pop bhq-surface';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Themes');

  const building = document.createElement('label');
  building.append(document.createTextNode('Building'));
  const exterior = document.createElement('select');
  exterior.setAttribute('aria-label', 'Building theme');
  for (const opt of EXTERIOR) {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.label;
    if (opt.id === cur) o.selected = true;
    exterior.append(o);
  }
  exterior.addEventListener('change', () => {
    const next = exterior.value;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* private mode: the query still carries the choice */ }
    const url = new URL(location.href);
    if (next) url.searchParams.set('theme', next);
    else url.searchParams.delete('theme');
    location.assign(url.href);
  });
  building.append(exterior);

  const note = document.createElement('p');
  note.className = 'bhq-theme-note';
  note.textContent = 'Auto follows the team, then the building. A saved floor wins over the feed.';
  const floors = document.createElement('div');
  floors.className = 'bhq-theme-floors';
  pop.append(building, note, floors);
  document.body.append(pop);
  slot.append(button);

  const place = () => {
    const r = button.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
  };
  const close = () => { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  const toggle = () => {
    pop.hidden = !pop.hidden;
    button.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true');
    if (!pop.hidden) place();
  };
  button.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('pointerdown', (e) => {
    if (pop.hidden) return;
    if (pop.contains(e.target) || button.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) close(); });
  window.addEventListener('resize', () => { if (!pop.hidden) place(); });
  menu = { button, pop, floors, exterior };
}

/** Rebuild the per-floor rows when the floor list changes. Values are the local choice, not the resolved theme. */
export function syncFloorThemeMenu(floors = []) {
  if (!menu) return;
  const names = floors.map((f) => f.name);
  const sig = names.join('|');
  if (menu.sig !== sig) {
    menu.sig = sig;
    menu.floors.textContent = '';
    const saved = readFloorThemeChoices();
    for (const floor of floors) {
      const label = document.createElement('label');
      label.className = 'bhq-tfloor';
      const name = document.createElement('span');
      name.textContent = floor.name;
      const hint = document.createElement('span');
      hint.className = 'bhq-tfloor-now';
      const select = document.createElement('select');
      select.setAttribute('aria-label', `${floor.name} interior`);
      select.dataset.floor = floor.name;
      for (const opt of [{ id: '', label: 'Auto' }, { id: 'office', label: 'Office' }, ...INTERIOR_CHOICES]) {
        const o = document.createElement('option');
        o.value = opt.id;
        o.textContent = opt.label;
        select.append(o);
      }
      const local = Object.keys(saved).find((k) => k.toLowerCase() === floor.name.toLowerCase());
      select.value = local ? (saved[local] || '') : '';
      select.addEventListener('change', () => {
        writeFloorThemeChoice(floor.name, select.value);
        onFloorsChanged();
      });
      label.append(name, hint, select);
      menu.floors.append(label);
    }
  }
}

/** Color the floor button and the open team card from the interior that actually won. */
export function paintFloorAccents(state, currentFloorId) {
  if (!state?.floors) return;
  const feed = state.floor_themes || null;
  const exteriorId = activeTheme()?.id || null;
  const byId = new Map(state.floors.map((f) => [f.id, f]));
  for (const btn of document.querySelectorAll('.bhq-floor')) {
    paintEl(btn, resolveFloorInterior(byId.get(btn.dataset.id) || {}, { feed, exteriorId }));
  }
  const head = document.querySelector('.bhq-thead');
  if (head) paintEl(head, resolveFloorInterior(byId.get(currentFloorId) || {}, { feed, exteriorId }));
  if (menu) {
    for (const label of menu.floors.querySelectorAll('.bhq-tfloor')) {
      const select = label.querySelector('select');
      const hint = label.querySelector('.bhq-tfloor-now');
      const floor = state.floors.find((f) => f.name === select?.dataset.floor);
      const theme = floor ? resolveFloorInterior(floor, { feed, exteriorId }) : null;
      if (hint) hint.textContent = select?.value ? '' : (theme ? theme.label : 'Office');
    }
  }
}

function paintEl(el, theme) {
  if (!theme) {
    delete el.dataset.interior;
    el.style.removeProperty('--floor-accent');
    el.style.removeProperty('--floor-ink');
    return;
  }
  el.dataset.interior = theme.id;
  el.style.setProperty('--floor-accent', theme.accent);
  el.style.setProperty('--floor-ink', theme.ink);
}
