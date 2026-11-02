// Workshop interior. Sawhorses, lumber, a blueprint, hard hats.
import * as THREE from 'three';
import { box, cachedProps, canvasTex, cluster, cyl, mat, sign } from '../kit.js';

const tint = {
  floor: '#D7C4A4', wall: '#EFE6D6', wood: '#C4956A', metal: '#4A463F', fabric: '#E4D2B4', glass: '#7EA0D8',
};

function blueprint() {
  return canvasTex(320, 220, (g, w, h) => {
    g.fillStyle = '#D5E4F7';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2F6FED';
    g.lineWidth = 2;
    for (let x = 16; x < w; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 16; y < h; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = 4;
    g.strokeRect(40, 36, 150, 110);
    g.strokeRect(200, 50, 80, 90);
    g.beginPath();
    g.moveTo(40, 146);
    g.lineTo(115, 70);
    g.lineTo(190, 146);
    g.stroke();
  });
}

function hat(g, x, z) {
  const yellow = mat('#F5C400', 0.55);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), yellow);
  dome.position.set(x, 0.16, z);
  g.add(dome);
  cyl(g, yellow, 0.26, 0.26, 0.04, x, 0.14, z, 14);
}

function build() {
  const g = cluster();
  const lumber = mat('#C4956A', 0.86);
  const leg = mat('#8C6848', 0.8);
  box(g, lumber, 1.5, 0.08, 0.28, -0.2, 0.72, 0.35);
  for (const x of [-0.7, 0.3]) {
    const a = box(g, leg, 0.06, 0.78, 0.06, x, 0.36, 0.22);
    a.rotation.z = 0.35;
    const b = box(g, leg, 0.06, 0.78, 0.06, x, 0.36, 0.48);
    b.rotation.z = -0.35;
  }
  for (let i = 0; i < 4; i++) box(g, lumber, 1.15, 0.07, 0.22, 0.95, 0.08 + i * 0.08, 0.2);
  const board = box(g, sign(blueprint()), 0.95, 0.68, 0.03, -0.15, 1.45, -0.05);
  board.position.z = -0.08;
  cyl(g, mat('#5C5348', 0.7), 0.03, 0.03, 1.15, -0.7, 0.85, -0.02, 6);
  cyl(g, mat('#5C5348', 0.7), 0.03, 0.03, 1.15, 0.35, 0.85, -0.02, 6);
  hat(g, 0.55, 0.7);
  hat(g, 1.15, 0.65);
  return g;
}

export const casitaInterior = {
  id: 'casita',
  label: 'Workshop',
  accent: '#E2A31A',
  ink: '#1A1408',
  glass: '#7EA0D8',
  tint,
  createProps: () => cachedProps('casita', build),
};
