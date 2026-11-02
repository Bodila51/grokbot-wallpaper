// Bunkhouse interior. Saddle, lasso, a wanted poster. The outside ranch theme is separate.
import * as THREE from 'three';
import { box, cachedProps, canvasTex, cluster, cyl, mat, sign } from '../kit.js';
import { hungTexasFlag } from '../texas-flag.js';

const tint = {
  floor: '#D7B07A', wall: '#E7D7BE', wood: '#C6A67C', metal: '#3C2E28', fabric: '#E4CDB4', glass: '#E4D0B4',
};

function wanted() {
  return canvasTex(220, 300, (g, w, h) => {
    g.fillStyle = '#E7D3A8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6B3A24';
    g.lineWidth = 8;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#6B3A24';
    g.textAlign = 'center';
    g.font = '700 36px Palatino, Georgia, serif';
    g.fillText('WANTED', w / 2, 64);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 === 0 ? 36 : 16;
      const x = w / 2 + Math.cos(a) * r;
      const y = 150 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  });
}

function build() {
  const g = cluster();
  g.position.z = -4.72;
  const leather = mat('#6B3A24', 0.72);
  const wood = mat('#8A5A38', 0.84);
  const rope = mat('#C6A36A', 0.9);
  const iron = mat('#4A4038', 0.4, 0.6);

  box(g, wood, 0.85, 0.9, 0.5, -0.85, 0.45, 0.4);
  box(g, leather, 0.7, 0.18, 0.46, -0.85, 1.0, 0.4);
  cyl(g, leather, 0.1, 0.1, 0.2, -0.85, 1.16, 0.4, 8);
  const stirrupL = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12), iron);
  stirrupL.position.set(-1.15, 0.62, 0.4);
  g.add(stirrupL);
  const stirrupR = stirrupL.clone();
  stirrupR.position.x = -0.55;
  g.add(stirrupR);

  const lasso = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 6, 20), rope);
  lasso.position.set(0.15, 1.25, 0.35);
  g.add(lasso);

  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.15), sign(wanted()));
  poster.position.set(1.15, 1.45, 0.2);
  g.add(poster);
  const hung = hungTexasFlag(0.4);
  hung.position.set(-1.7, 1.42, 0.16);
  g.add(hung);
  cyl(g, wood, 0.26, 0.28, 0.62, 1.2, 0.31, 0.7, 10);
  return g;
}

export const ranchInterior = {
  id: 'ranch',
  label: 'Bunkhouse',
  accent: '#C46A3A',
  ink: '#FFF6EC',
  glass: '#E4D0B4',
  tint,
  createProps: () => cachedProps('ranch', build),
};
