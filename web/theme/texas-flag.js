// The Texas state flag, drawn to the proportions in Texas Government Code §3100.051:
// height is 2/3 of the length; the blue vertical stripe is 1/3 of the length; the fly is
// split into equal white-over-red stripes; the white star's circumscribed diameter is
// 3/4 the width of the blue stripe, centered there, one point up.
// Colors are the de facto Old Glory set Texas uses (blue #002868, red #BF0A30).
import * as THREE from 'three';

const BLUE = '#002868';
const RED = '#BF0A30';
const WHITE = '#FFFFFF';

let texture = null;
let material = null;

function starPath(g, cx, cy, outer) {
  const inner = outer * Math.sin(Math.PI / 10) / Math.sin(Math.PI * 3 / 10); // regular pentagram
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
}

function flagTexture() {
  if (texture) return texture;
  const length = 480;                         // fly
  const height = Math.round(length * 2 / 3);  // hoist
  const blueW = length / 3;
  const c = document.createElement('canvas');
  c.width = length;
  c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = BLUE;
  g.fillRect(0, 0, blueW, height);
  g.fillStyle = WHITE;
  g.fillRect(blueW, 0, length - blueW, height / 2);
  g.fillStyle = RED;
  g.fillRect(blueW, height / 2, length - blueW, height / 2);
  g.fillStyle = WHITE;
  starPath(g, blueW / 2, height / 2, (blueW * 0.75) / 2);
  texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function flagMaterial() {
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      map: flagTexture(), side: THREE.FrontSide, toneMapped: false,
    });
  }
  return material;
}

/** Cloth in the XY plane, facing +Z. Hoist (blue) is the local −X edge. Height:width = 2:3. */
export function texasFlagCloth(height) {
  const width = height * 1.5;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), flagMaterial());
  mesh.name = 'texas-flag';
  mesh.userData.flagWidth = width;
  mesh.userData.flagHeight = height;
  return mesh;
}

/**
 * A pole with the flag bent off the top, hoist against the pole.
 * `fly` is the cloth length. The cloth's pivot is the hoist, so a little yaw reads as wind.
 */
export function texasFlagpole({ poleHeight = 5.4, fly = 1.8 } = {}) {
  const g = new THREE.Group();
  g.name = 'texas-flagpole';
  const steel = new THREE.MeshStandardMaterial({ color: '#C5C1B6', roughness: 0.4, metalness: 0.62 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, poleHeight, 8), steel);
  pole.position.y = poleHeight / 2;
  g.add(pole);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), steel);
  ball.position.y = poleHeight + 0.02;
  g.add(ball);

  const clothH = fly * 2 / 3;
  const pivot = new THREE.Group();
  pivot.name = 'texas-flag-pivot';
  pivot.position.set(0.05, poleHeight - 0.06, 0);
  const cloth = texasFlagCloth(clothH);
  cloth.position.set(cloth.userData.flagWidth / 2, -clothH / 2, 0);
  pivot.add(cloth);
  g.add(pivot);
  g.userData.pivot = pivot;
  return g;
}

/** A small flag hung from a dowel, for the bunkhouse wall. Faces +Z. */
export function hungTexasFlag(height = 0.42) {
  const g = new THREE.Group();
  g.name = 'texas-flag-hung';
  const cloth = texasFlagCloth(height);
  const wood = new THREE.MeshStandardMaterial({ color: '#6B4630', roughness: 0.8 });
  const dowel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cloth.userData.flagWidth + 0.06, 6), wood);
  dowel.rotation.z = Math.PI / 2;
  dowel.position.y = height / 2 + 0.02;
  cloth.position.y = 0;
  g.add(dowel, cloth);
  return g;
}
