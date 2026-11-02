// Small procedural builders shared by interior themes. Geometries and materials are created once
// per theme and cloned per floor, so dressing a floor does not allocate a new mesh budget.
import * as THREE from 'three';

export function mat(color, roughness = 0.72, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

export function lit(color, intensity = 0.8) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.45, metalness: 0.05,
  });
}

export function sign(texture) {
  const m = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  return m;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function box(parent, material, w, h, d, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  parent.add(mesh);
  return mesh;
}

export function cyl(parent, material, rt, rb, h, x, y, z, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// Back-right of the room, in front of the glass, clear of the left-wall screens and the desks.
export function cluster() {
  const g = new THREE.Group();
  g.position.set(3.15, 0, -5.02);
  return g;
}

let cached = new Map();

/** Build once, clone per floor. `build` must be deterministic. */
export function cachedProps(id, build) {
  if (!cached.has(id)) cached.set(id, build());
  return cached.get(id).clone(true);
}
