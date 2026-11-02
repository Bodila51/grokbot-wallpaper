// Vault interior. Safe door, filing cabinets, a shredder, one green lamp.
import * as THREE from 'three';
import { box, cachedProps, cluster, cyl, lit, mat } from '../kit.js';

const tint = {
  floor: '#2C3330', wall: '#23282A', wood: '#3A342C', metal: '#14181A', fabric: '#2A3034', glass: '#8A9A78',
};

function build() {
  const g = cluster();
  const steel = mat('#4E5650', 0.38, 0.72);
  const dark = mat('#1A1E1C', 0.55, 0.4);
  const brass = mat('#C6A15A', 0.35, 0.65);
  const paper = mat('#E7E0D2', 0.8);

  box(g, dark, 1.15, 1.55, 0.55, -0.7, 0.78, 0.1);
  const door = cyl(g, steel, 0.42, 0.42, 0.08, -0.7, 0.95, 0.4, 20);
  door.rotation.x = Math.PI / 2;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 6, 16), brass);
  wheel.position.set(-0.7, 0.95, 0.48);
  g.add(wheel);
  cyl(g, brass, 0.04, 0.04, 0.06, -0.7, 0.95, 0.5, 8);

  box(g, steel, 0.48, 1.15, 0.5, 0.35, 0.58, 0.15);
  box(g, steel, 0.48, 1.15, 0.5, 0.88, 0.58, 0.15);
  for (const x of [0.35, 0.88]) {
    for (const y of [0.35, 0.62, 0.9]) box(g, brass, 0.22, 0.03, 0.03, x, y, 0.42);
  }

  box(g, dark, 0.42, 0.7, 0.4, 1.35, 0.35, 0.45);
  box(g, paper, 0.28, 0.04, 0.18, 1.35, 0.74, 0.5);
  cyl(g, lit('#9FBF7A', 0.45), 0.08, 0.1, 0.1, -1.35, 1.55, 0.15, 8);
  return g;
}

export const vaultInterior = {
  id: 'vault',
  label: 'Vault',
  accent: '#C6A15A',
  ink: '#1A140C',
  glass: '#8A9A78',
  tint,
  createProps: () => cachedProps('vault', build),
};
