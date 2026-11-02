// Per-floor interior tint. Materials are cloned per floor instance, so this only changes that floor.
// The first call remembers the office colours; later dresses restore them before painting, so a floor
// can move from coffee back to office without keeping a stain.

const SKIP = /^(wall_screen|task_board|laptop_screen_\d\d)$/;

function eachMat(root, fn) {
  root.traverse((o) => {
    if (!o.isMesh || SKIP.test(o.name)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) if (m) fn(m, o);
  });
}

function remember(m) {
  if (m.userData.baseColor != null || !m.color) return;
  m.userData.baseColor = m.color.getHex();
  m.userData.baseEmissive = m.emissive ? m.emissive.getHex() : 0;
}

function restore(m) {
  remember(m);
  if (m.userData.baseColor != null && m.color) m.color.setHex(m.userData.baseColor);
  if (m.emissive && m.userData.baseEmissive != null && m.name !== 'night_screen') {
    // leave screen glow colours alone; only the body colour is themed
  }
}

/** Paint an open floor. `tint` null restores the office. */
export function applyTint(root, tint) {
  eachMat(root, (m, mesh) => {
    remember(m);
    restore(m);
    if (!tint || !m.color) return;
    if (m.name === 'night_screen' || m.name === 'night_lamp') return;
    const baked = mesh.userData.bakedName || mesh.name || '';
    if (m.isMeshBasicMaterial && m.map) {
      m.color.set(baked.includes('wall') ? tint.wall : tint.floor);
      return;
    }
    if (m.transparent && m.opacity < 0.65) {
      m.color.set(tint.glass || tint.wall);
      return;
    }
    const hsl = { h: 0, s: 0, l: 0 };
    m.color.getHSL(hsl);
    if (hsl.h > 0.22 && hsl.h < 0.46 && hsl.s > 0.15) return; // plants stay plants
    if (hsl.l < 0.22) m.color.set(tint.metal);
    else if (hsl.l > 0.78 && hsl.s < 0.25) m.color.set(tint.wall);
    else if (hsl.s < 0.16) m.color.set(hsl.l > 0.55 ? tint.fabric : tint.metal);
    else m.color.set(tint.wood);
  });
}

/** Closed floors only show their glass band. Tint that, leave the shell on the exterior theme. */
export function tintClosedGlass(root, glass) {
  eachMat(root, (m) => {
    remember(m);
    restore(m);
    if (!glass || !m.color) return;
    if (m.name === 'night_windows' || (m.transparent && m.opacity < 0.7)) m.color.set(glass);
  });
}
