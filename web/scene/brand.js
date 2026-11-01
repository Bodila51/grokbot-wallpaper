// Sign on the tower's front face, in the dark glass band of the 2nd floor under the office (SpaceX look). The tower
// below floor 1 is static, so the sign is too. Source, first that works: ?brand=TEXT (try a name), the owner's logo
// at assets/brand/logo.png (white on transparent), else the text BRAND. Each user can drop in their own logo file.
import * as THREE from 'three';

const BRAND = 'BOT HQ';
const FONT = 'Michroma';
const BAND = { x0: -7.0, y: -2.58, h: 0.95, z: 6.24, maxW: 8.2 };   // +Z face (slab edge z = 6.2)

function textCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 240;
  const g = c.getContext('2d');
  let size = c.height * 0.62;
  const set = () => { g.font = `400 ${size}px "${FONT}", "Arial Black", sans-serif`; g.letterSpacing = `${Math.round(size * 0.32)}px`; };
  set();
  const w = g.measureText(text).width;
  if (w > c.width * 0.96) { size *= c.width * 0.96 / w; set(); }
  g.fillStyle = '#FFFFFF';
  g.textBaseline = 'middle';
  g.fillText(text, 0, c.height / 2);
  return c;
}

export function createWordmark(parent, { logoUrl } = {}) {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.name = 'wordmark';
  mesh.visible = false;
  parent.add(mesh);

  function show(tex, aspect) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    mat.map?.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
    const w = Math.min(BAND.maxW, BAND.h * aspect);
    mesh.scale.set(w, BAND.h, 1);
    mesh.position.set(BAND.x0 + w / 2, BAND.y, BAND.z);
    mesh.visible = true;
  }
  function showText(text) {
    const c = textCanvas(text);
    show(new THREE.CanvasTexture(c), 8.2 / BAND.h);
    document.fonts?.load(`400 64px "${FONT}"`).then(() => {
      const c2 = textCanvas(text);
      show(new THREE.CanvasTexture(c2), 8.2 / BAND.h);
    }, () => {});
  }

  const asked = new URLSearchParams(location.search).get('brand');
  if (asked) showText(asked.toUpperCase().slice(0, 24));
  else if (logoUrl) {
    new THREE.TextureLoader().loadAsync(logoUrl)
      .then((t) => show(t, t.image.width / t.image.height))
      .catch(() => showText(BRAND));
  } else showText(BRAND);

  return {
    // night: 0..1 — painted white by day, backlit at night
    update(night) { mat.color.setScalar(0.86 + 0.14 * night); },
  };
}
