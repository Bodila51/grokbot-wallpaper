// Interior themes, one per open floor. The building outside stays on the single exterior theme.
//
// Resolution for a floor name, first hit wins:
//   1. localStorage bothq.floorThemes[name]   (the Theme menu; "office" forces the plain interior)
//   2. state.floor_themes from the feed       {"floor_themes":{"Ranch":"office"}}
//   3. guessFloorTheme(name)                  keyword table in floor-theme-rules.js
//   4. the exterior theme, if it is also an interior (ranch)
//   5. the plain office interior
// An unknown id is treated as unset, so a typo does not block the next step.
// A keyword guess of "office" is the plain interior and does not fall through to the exterior.
// "Unassigned" skips the guess and uses the exterior.

import { arcadeInterior } from './interiors/arcade.js';
import { casitaInterior } from './interiors/casita.js';
import { coffeeInterior } from './interiors/coffee.js';
import { ranchInterior } from './interiors/ranch.js';
import { studioInterior } from './interiors/studio.js';
import { vaultInterior } from './interiors/vault.js';
import { guessFloorTheme } from './floor-theme-rules.js';

export { FLOOR_THEME_RULES, guessFloorTheme } from './floor-theme-rules.js';

export const FLOOR_THEME_KEY = 'bothq.floorThemes';

const ALL = [coffeeInterior, arcadeInterior, studioInterior, vaultInterior, casitaInterior, ranchInterior];
const BY_ID = Object.fromEntries(ALL.map((t) => [t.id, t]));

export const INTERIOR_CHOICES = ALL.map((t) => ({ id: t.id, label: t.label }));

export function interiorById(id) {
  return BY_ID[String(id || '').trim().toLowerCase()] || null;
}

export function readFloorThemeChoices() {
  try {
    const raw = JSON.parse(localStorage.getItem(FLOOR_THEME_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writeFloorThemeChoice(name, value) {
  const all = readFloorThemeChoices();
  for (const k of Object.keys(all)) if (k.toLowerCase() === String(name).toLowerCase()) delete all[k];
  if (value) all[name] = value;
  try { localStorage.setItem(FLOOR_THEME_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

function lookup(map, name) {
  if (!map || !name) return undefined;
  if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
  const hit = Object.keys(map).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return hit == null ? undefined : map[hit];
}

/** 'office' forces the plain interior. A known id is returned. Anything else is unset. */
function normalizeChoice(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || v === 'auto') return null;
  if (v === 'office' || v === 'default') return 'office';
  return BY_ID[v] ? v : null;
}

/**
 * @param {{ name?: string, id?: string }} floor
 * @param {{ feed?: object|null, exteriorId?: string|null }} [ctx]
 * @returns {object|null} the interior theme, or null for the plain office
 */
export function resolveFloorInterior(floor, { feed = null, exteriorId = null } = {}) {
  const name = floor?.name || '';
  const local = lookup(readFloorThemeChoices(), name);
  const fromFeed = lookup(feed, name);
  const explicit = local != null && String(local).trim() !== '' ? local : (fromFeed != null && String(fromFeed).trim() !== '' ? fromFeed : null);
  if (explicit != null) {
    const id = normalizeChoice(explicit);
    if (id === 'office') return null;
    if (id && BY_ID[id]) return BY_ID[id];
  }
  const guessed = guessFloorTheme(name);
  if (guessed === 'office') return null;
  if (guessed && BY_ID[guessed]) return BY_ID[guessed];
  if (exteriorId && BY_ID[exteriorId]) return BY_ID[exteriorId];
  return null;
}
