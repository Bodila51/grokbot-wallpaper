// Time of day (CONTRACT v2.2): phases, smooth light/background interpolation, night crossfade of the
// baked lightmaps (shared uniform `uNight`), emissive ramps and warm lamp lights.
// Publishes <html data-daylight="day|golden|dusk|night|dawn"> and --night (0..1), at most once a second.
import * as THREE from 'three';
import { smoothstep, lerp, clamp } from './spring.js';

const rgb = (hex) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); return [c.r, c.g, c.b]; };

const P = (o) => o;
const DAY = P({
  night: 0, lamps: 0, windows: 0,
  sunI: 2.1, sunEl: 58, sunAz: 217, sunC: rgb('#FFE3BF'),
  hemiI: 1.25, hemiSky: rgb('#FFF3E3'), hemiGnd: rgb('#D8C7B0'),
  fillI: 0.45, fillC: rgb('#E6EEFF'), envI: 0.55, exposure: 1.05,
  space0: rgb('#010206'), space1: rgb('#0A1428'), earth0: rgb('#0B2140'), earth1: rgb('#28588C'), earth2: rgb('#7FB4E2'),
  limb: rgb('#CDEBFF'), limbA: 0.95, glow: rgb('#9FC9FF'), glowA: 0.10, stars: 0.5, shadow: 0.34,
});
const GOLDEN = P({
  night: 0, lamps: 0.25, windows: 0.12,
  sunI: 1.9, sunEl: 20, sunAz: 212, sunC: rgb('#FFAE62'),
  hemiI: 1.0, hemiSky: rgb('#FFDDBC'), hemiGnd: rgb('#C79F7B'),
  fillI: 0.3, fillC: rgb('#FFD2A8'), envI: 0.45, exposure: 1.05,
  space0: rgb('#020309'), space1: rgb('#14162E'), earth0: rgb('#10142E'), earth1: rgb('#3A3A68'), earth2: rgb('#C98A6A'),
  limb: rgb('#FFC48A'), limbA: 0.95, glow: rgb('#FFB27A'), glowA: 0.10, stars: 0.6, shadow: 0.36,
});
const DAWN = P({
  night: 0.55, lamps: 0.6, windows: 0.35,
  sunI: 0.9, sunEl: 10, sunAz: 205, sunC: rgb('#FFC4A0'),
  hemiI: 0.8, hemiSky: rgb('#E8D3D8'), hemiGnd: rgb('#9A8F9C'),
  fillI: 0.25, fillC: rgb('#BFC8F0'), envI: 0.3, exposure: 1.05,
  space0: rgb('#020309'), space1: rgb('#12152C'), earth0: rgb('#0E1330'), earth1: rgb('#30385F'), earth2: rgb('#B07F92'),
  limb: rgb('#FFB9B0'), limbA: 0.9, glow: rgb('#FFAAA0'), glowA: 0.08, stars: 0.7, shadow: 0.32,
});
const DUSK = P({
  night: 0.6, lamps: 0.9, windows: 0.8,
  sunI: 0.9, sunEl: 8, sunAz: 212, sunC: rgb('#FF9A70'),
  hemiI: 0.8, hemiSky: rgb('#6A5F86'), hemiGnd: rgb('#2A2438'),
  fillI: 0.2, fillC: rgb('#6A70B0'), envI: 0.28, exposure: 1.03,
  space0: rgb('#010207'), space1: rgb('#0A0F22'), earth0: rgb('#070B1C'), earth1: rgb('#161E40'), earth2: rgb('#4A4F8A'),
  limb: rgb('#8E9CFF'), limbA: 0.7, glow: rgb('#7F8CF0'), glowA: 0.07, stars: 0.9, shadow: 0.34,
});
const NIGHT = P({
  night: 1, lamps: 1, windows: 1,
  sunI: 0.32, sunEl: 40, sunAz: 217, sunC: rgb('#8CA6FF'),
  hemiI: 0.55, hemiSky: rgb('#31406E'), hemiGnd: rgb('#121629'),
  fillI: 0.18, fillC: rgb('#5568A8'), envI: 0.16, exposure: 1.0,
  space0: rgb('#000105'), space1: rgb('#050A18'), earth0: rgb('#03060F'), earth1: rgb('#0A1226'), earth2: rgb('#1C2D58'),
  limb: rgb('#4F7BFF'), limbA: 0.55, glow: rgb('#4F7BFF'), glowA: 0.06, stars: 1, shadow: 0.4,
});

const KEYS = [
  [0, NIGHT], [330, NIGHT], [390, DAWN], [450, DAY], [1050, DAY],
  [1080, GOLDEN], [1170, GOLDEN], [1230, DUSK], [1290, NIGHT], [1440, NIGHT],
];

function mixParams(a, b, t) {
  const out = {};
  for (const k in a) {
    out[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], t)) : lerp(a[k], b[k], t);
  }
  return out;
}

export function paramsAt(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [m0, p0] = KEYS[i], [m1, p1] = KEYS[i + 1];
    if (m >= m0 && m <= m1) return mixParams(p0, p1, smoothstep(0, 1, (m - m0) / (m1 - m0)));
  }
  return mixParams(NIGHT, NIGHT, 0);
}

export function phaseAt(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= 330 && m < 450) return 'dawn';
  if (m >= 450 && m < 1050) return 'day';
  if (m >= 1050 && m < 1170) return 'golden';
  if (m >= 1170 && m < 1290) return 'dusk';
  return 'night';
}

function parseClock(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return clamp(Number(m[1]), 0, 24) * 60 + clamp(Number(m[2]), 0, 59);
}

const LAMP_COUNT = 6;
const LAMP_INTENSITY = 16;

export function createDaylight({ scene, renderer, container }) {
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(6, 5, 8);
  scene.add(sun, hemi, fill);

  const lamps = [];
  for (let i = 0; i < LAMP_COUNT; i++) {
    const l = new THREE.PointLight(0xffc98a, 0, 8.5, 2);
    l.castShadow = false;
    l.position.set(0, -99, 0);
    scene.add(l);
    lamps.push(l);
  }

  const tracked = new Map();                      // material -> kind ('lamp' | 'windows')
  const uNight = { value: 0 };
  const state = { night: 0, lampsK: 0, windowsK: 0, phase: 'day', minutes: 720, params: null };
  let override = null;                            // minutes, or null = live clock
  let cur = null;
  let lampSource = null;                          // () => { positions: Vector3[], k: number }
  let lastHtml = -1e9, lastBg = -1e9, lastBgStr = '';
  let clockMs = 0;

  const tmp = new THREE.Color();
  const dir = new THREE.Vector3();

  const urlTime = new URLSearchParams(location.search).get('time');
  if (urlTime && urlTime !== 'auto') override = parseClock(urlTime);

  function nowMinutes() {
    if (override !== null) return override;
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  function setTime(value) {
    override = value && value !== 'auto' ? parseClock(value) : null;
    lastHtml = -1e9;
  }

  function apply(p, dt) {
    sun.color.setRGB(...p.sunC, THREE.SRGBColorSpace);
    sun.intensity = p.sunI;
    const el = THREE.MathUtils.degToRad(p.sunEl), az = THREE.MathUtils.degToRad(p.sunAz);
    dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(14);
    sun.position.copy(dir);
    hemi.color.setRGB(...p.hemiSky, THREE.SRGBColorSpace);
    hemi.groundColor.setRGB(...p.hemiGnd, THREE.SRGBColorSpace);
    hemi.intensity = p.hemiI;
    fill.color.setRGB(...p.fillC, THREE.SRGBColorSpace);
    fill.intensity = p.fillI;
    scene.environmentIntensity = p.envI;
    renderer.toneMappingExposure = p.exposure;
    uNight.value = p.night;
    state.night = p.night;
    state.lampsK = p.lamps;
    state.windowsK = p.windows;
    for (const [mat, kind] of tracked) {
      if (kind === 'lamp') mat.emissiveIntensity = p.lamps * 2.4;
      else if (kind === 'windows') mat.emissiveIntensity = p.windows * 1.7;
    }
  }

  function updateLamps() {
    const src = lampSource ? lampSource() : null;
    const k = src ? src.k * state.lampsK : 0;
    for (let i = 0; i < LAMP_COUNT; i++) {
      const l = lamps[i];
      const pos = src && src.positions[i];
      // lights stay in the scene (intensity 0 by day) so the lit materials never recompile
      if (pos) { l.position.copy(pos); l.intensity = LAMP_INTENSITY * k; } else l.intensity = 0;
    }
  }

  const css = (a, alpha = 1) => `rgb(${Math.round(a[0] * 255)} ${Math.round(a[1] * 255)} ${Math.round(a[2] * 255)} / ${alpha.toFixed(3)})`;

  // Near space: black sky over Earth's curved limb. One ellipse (centre below the frame) paints the planet, the thin
  // bright limb and the atmosphere's glow above it; the same ellipse masks the stars (scene.css .hq-stars).
  function backgroundString(p) {
    return `radial-gradient(50% 42% at 50% 46%, ${css(p.glow, p.glowA)}, ${css(p.glow, 0)} 75%), `
      + `radial-gradient(110% 95% at 50% 155%, ${css(p.earth0)} 0%, ${css(p.earth1)} 78%, ${css(p.earth2)} 97%, `
      + `${css(p.limb, p.limbA)} 99.3%, ${css(p.limb, p.limbA * 0.35)} 101%, ${css(p.limb, 0)} 109%), `
      + `linear-gradient(to bottom, ${css(p.space0)} 0%, ${css(p.space1)} 60%)`;
  }

  function update(dt, nowMs) {
    clockMs = nowMs;
    const minutes = nowMinutes();
    const target = paramsAt(minutes);
    if (!cur) cur = target;
    else {
      const k = 1 - Math.exp(-dt / 0.45);        // never jump: follow the clock with a soft lag
      cur = mixParams(cur, target, k);
    }
    state.minutes = minutes;
    state.phase = phaseAt(minutes);
    state.params = cur;
    apply(cur, dt);
    updateLamps();

    if (nowMs - lastBg > 250) {
      lastBg = nowMs;
      const s = backgroundString(cur);
      if (s !== lastBgStr) {
        lastBgStr = s;
        container.style.background = s;
        container.style.setProperty('--hq-stars', cur.stars.toFixed(3));
      }
    }
    if (nowMs - lastHtml > 1000) {
      lastHtml = nowMs;
      const root = document.documentElement;
      if (root.dataset.daylight !== state.phase) root.dataset.daylight = state.phase;
      root.style.setProperty('--night', cur.night.toFixed(3));
    }
  }

  const api = {
    uNight, state, update, setTime,
    track(mat, kind) { tracked.set(mat, kind); },
    untrack(mat) { tracked.delete(mat); },
    setLampSource(fn) { lampSource = fn; },
    get shadowOpacity() { return cur ? cur.shadow : 0.3; },
    get night() { return state.night; },
  };
  window.bothq = Object.assign(window.bothq || {}, { setTime, daylight: state });
  return api;
}
