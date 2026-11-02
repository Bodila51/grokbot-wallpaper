// Interior guess for a floor whose name is an arbitrary label (a sidebar section).
// First matching row wins. Keep this table in sync with docs/THEMES.md.
//
// Match is case-insensitive. A keyword of 3 or more letters matches as a substring.
// A shorter keyword, and "art", matches only as a whole word, so "it" does not fire
// inside "community" and "art" does not fire inside "start" or "party".
//
// Order is the rule. Content words come before "studio", so "Content Studio" is a
// studio and "Studios" alone is an arcade. "home" comes before "office", so
// "Home Office" is a workshop. "office" is the plain interior, which beats the exterior.
//
// "Unassigned", and an overflow floor "Unassigned · 2", skip this table.

/** @type {{ keywords: string[], theme: string, note: string }[]} */
export const FLOOR_THEME_RULES = [
  { keywords: ['content', 'marketing', 'social', 'instagram', 'food', 'taste', 'media', 'publish'], theme: 'studio', note: 'Studio' },
  { keywords: ['privacy', 'security', 'scrub', 'call'], theme: 'vault', note: 'Vault' },
  { keywords: ['design', 'art', 'brand', 'creative'], theme: 'coffee', note: 'Coffee bar' },
  { keywords: ['ranch', 'farm', 'cowboy', 'texas', 'bunkhouse'], theme: 'ranch', note: 'Bunkhouse' },
  { keywords: ['home', 'house', 'workshop', 'it', 'tech', 'pc'], theme: 'casita', note: 'Workshop' },
  { keywords: ['personal'], theme: 'ranch', note: 'Bunkhouse' },
  { keywords: ['dev', 'code', 'engineer', 'studio', 'studios', 'build', 'app'], theme: 'arcade', note: 'Arcade' },
  { keywords: ['work', 'job', 'career', 'office'], theme: 'office', note: 'Plain office' },
];

const WHOLE_WORD = new Set(['art']);
const UNASSIGNED_NAME = /^unassigned(?:\s*·\s*\d+)?$/i;

function keywordHit(name, keyword) {
  const k = keyword.toLowerCase();
  if (k.length < 3 || WHOLE_WORD.has(k)) {
    return new RegExp(`(?:^|[^a-z0-9])${k}(?:[^a-z0-9]|$)`, 'i').test(name);
  }
  return name.toLowerCase().includes(k);
}

/**
 * @param {string} name floor label
 * @returns {string|null} an interior id, "office" for the plain interior, or null when nothing matched
 */
export function guessFloorTheme(name) {
  const raw = String(name ?? '').trim();
  if (!raw || UNASSIGNED_NAME.test(raw)) return null;
  for (const rule of FLOOR_THEME_RULES) {
    if (rule.keywords.some((k) => keywordHit(raw, k))) return rule.theme;
  }
  return null;
}
