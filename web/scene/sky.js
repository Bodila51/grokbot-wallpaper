// Near-space backdrop (SpaceX look): the office is the top of a tower so tall that it stands above the atmosphere.
// The sky itself (black space, Earth's curved limb, the atmosphere's glow) is the container's background, set by
// daylight.js per time of day. Here: the stars (masked to the space above the limb, see scene.css) and a faint grain.
// The tower runs past the bottom of the frame (building.js), so it has no visible end. Generic for every user.

function rng(seed) {                     // mulberry32: the same sky on every load
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starsDataUrl() {
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 1000;
  const g = c.getContext('2d');
  const r = rng(7);
  for (let i = 0; i < 420; i++) {
    const x = r() * c.width, y = r() * c.height * 0.72, big = r() > 0.95;
    g.globalAlpha = 0.25 + r() * 0.7;
    g.fillStyle = r() > 0.85 ? '#FFEBCB' : r() > 0.7 ? '#D6E4FF' : '#FFFFFF';
    g.beginPath();
    g.arc(x, y, big ? 1.3 : 0.4 + r() * 0.55, 0, Math.PI * 2);
    g.fill();
  }
  return c.toDataURL('image/png');
}

function grainDataUrl() {
  const S = 160;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const r = rng(3);
  for (let i = 0; i < S * S; i++) {
    const v = Math.round(r() * 255);
    img.data.set([v, v, v, 22], i * 4);
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function layer(className, style = {}) {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, style);
  return el;
}

// ---------- Earth below the tower: NASA imagery projected as seen from orbit, then defocused (scene.css .hq-earth) ----------
// Day: Blue Marble (assets/earth/day.jpg). Night: the same land dimmed + Black Marble city lights (night.jpg), golden
// like the iPhone Earth wallpaper. Both images: NASA Earth Observatory, public domain.
// The planet's limb is the ellipse the sky gradient uses (daylight.js) and that masks the stars (scene.css):
// radii 110% x 95% of the frame, centre at 50% 130% (its top at 35% of the frame height).
const ELL = { rx: 1.10, ry: 0.95, cy: 1.30 };
const TOP = ELL.cy - ELL.ry;                             // 0.35: the Earth layer covers the lower 65% of the frame
const VIEW = { lat: 12, lon: 22 };                       // under the viewer: the Mediterranean low in the frame, Europe toward the horizon

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 5) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return s;
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function loadPixels(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0);
      resolve({ w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data });
    };
    im.onerror = reject;
    im.src = url;
  });
}

// bilinear sample of an equirectangular map at (lon, lat) radians -> out[0..2]
function sample(t, lon, lat, out) {
  const x = (((lon / (2 * Math.PI) + 0.5) % 1) + 1) % 1 * t.w - 0.5;
  const y = Math.min(t.h - 1.001, Math.max(0, (0.5 - lat / Math.PI) * t.h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = ((x0 % t.w) + t.w) % t.w, xb = (xa + 1) % t.w, r0 = y0 * t.w, r1 = r0 + t.w, d = t.d;
  for (let k = 0; k < 3; k++) {
    out[k] = (d[(r0 + xa) * 4 + k] * (1 - fx) + d[(r0 + xb) * 4 + k] * fx) * (1 - fy)
      + (d[(r1 + xa) * 4 + k] * (1 - fx) + d[(r1 + xb) * 4 + k] * fx) * fy;
  }
}

function renderEarth(day, nightLights, night) {
  const W = 1280, H = 400;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.className = night ? 'hq-earth__night' : 'hq-earth__day';
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const la = VIEW.lat * Math.PI / 180, lo = VIEW.lon * Math.PI / 180;
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const east = [-Math.sin(lo), Math.cos(lo), 0];
  const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const haze = night ? [22, 44, 104] : [150, 196, 244];
  const col = [0, 0, 0], lit = [0, 0, 0];
  for (let py = 0; py < H; py++) {
    const ey = (ELL.cy - (TOP + ((py + 0.5) / H) * (1 - TOP))) / ELL.ry;      // up from the ellipse centre
    for (let px = 0; px < W; px++) {
      const ex = ((px + 0.5) / W - 0.5) / ELL.rx;
      const r2 = ex * ex + ey * ey, i = (py * W + px) * 4;
      if (r2 >= 1) { img.data[i + 3] = 0; continue; }
      const z = Math.sqrt(1 - r2);                       // facing the viewer (1) ... limb (0)
      const X = ex * east[0] + ey * north[0] + z * up[0];
      const Y = ex * east[1] + ey * north[1] + z * up[1];
      const Z = ex * east[2] + ey * north[2] + z * up[2];
      const lat = Math.asin(Math.max(-1, Math.min(1, Z))), lon = Math.atan2(Y, X);
      sample(day, lon, lat, col);
      if (night) {
        sample(nightLights, lon, lat, lit);
        const L = (lit[0] * 0.3 + lit[1] * 0.55 + lit[2] * 0.15) / 255;
        const glow = Math.pow(sm(0.08, 0.62, L), 0.8) * 1.5;
        col[0] = col[0] * 0.2 + 255 * glow; col[1] = col[1] * 0.19 + 176 * glow; col[2] = col[2] * 0.26 + 72 * glow;
      } else {
        const cl = sm(0.54, 0.78, fbm(lon * 3.2 + 7.1, lat * 4.4 + 2.3)) * 0.8;   // soft weather systems
        for (let k = 0; k < 3; k++) col[k] += (248 - col[k]) * cl;
      }
      const h = sm(0.45, 1, 1 - z) * (night ? 0.75 : 0.85);                    // the air thickens toward the limb
      img.data[i] = Math.min(255, col[0] + (haze[0] - col[0]) * h);
      img.data[i + 1] = Math.min(255, col[1] + (haze[1] - col[1]) * h);
      img.data[i + 2] = Math.min(255, col[2] + (haze[2] - col[2]) * h);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function createSky({ container }) {
  document.documentElement.dataset.sky = 'space';       // the UI stays on dark glass (web/styles.css)
  const clip = layer('hq-earth__clip');
  const earth = layer('hq-earth');
  earth.append(clip);
  container.prepend(
    layer('hq-stars', { backgroundImage: `url(${starsDataUrl()})` }),
    earth,
    layer('hq-grain', { backgroundImage: `url(${grainDataUrl()})` }),
  );
  // ~0.3 s of pixel work once the images are in: after the first frames, so the office appears first
  Promise.all([loadPixels('/assets/earth/day.jpg'), loadPixels('/assets/earth/night.jpg')]).then(([day, lights]) => {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
    idle(() => {
      clip.append(renderEarth(day, lights, false), renderEarth(day, lights, true));
      earth.classList.add('is-ready');
    }, { timeout: 1500 });
  }).catch((e) => console.warn('[sky] Earth imagery missing, sky gradient only:', e?.message || e));
  return {};
}
