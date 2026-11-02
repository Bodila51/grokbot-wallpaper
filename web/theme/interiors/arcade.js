// Arcade interior. Neon marquees, pixel screens, a joystick.
import * as THREE from 'three';
import { box, cachedProps, canvasTex, cluster, cyl, lit, mat, sign } from '../kit.js';

const tint = {
  floor: '#3A335C', wall: '#2A2744', wood: '#3A3058', metal: '#1A1830', fabric: '#3E3A62', glass: '#7A4DFF',
};

function pixelScreen(hex) {
  return canvasTex(64, 80, (g, w, h) => {
    g.fillStyle = '#07060f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = hex;
    const cells = [
      '00111100',
      '01000010',
      '01111110',
      '11011011',
      '11111111',
      '10111101',
      '10000001',
      '01000010',
    ];
    const s = 6;
    cells.forEach((row, y) => [...row].forEach((bit, x) => {
      if (bit === '1') g.fillRect(8 + x * s, 10 + y * s, s - 1, s - 1);
    }));
  });
}

function cabinet(g, x, body, glow, screenHex) {
  box(g, body, 0.72, 1.35, 0.62, x, 0.78, 0.15);
  const screen = box(g, sign(pixelScreen(screenHex)), 0.46, 0.52, 0.03, x, 1.12, 0.47);
  screen.material.color.set(glow);
  box(g, lit(glow, 0.7), 0.5, 0.12, 0.08, x, 1.52, 0.2);
  box(g, mat('#14141C', 0.5), 0.5, 0.08, 0.22, x, 0.72, 0.42);
  cyl(g, lit(glow, 0.45), 0.045, 0.045, 0.08, x - 0.08, 0.8, 0.52, 8);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lit(glow, 0.5));
  ball.position.set(x - 0.08, 0.88, 0.52);
  g.add(ball);
}

function build() {
  const g = cluster();
  const body = mat('#1B1A28', 0.55, 0.25);
  cabinet(g, -0.55, body, '#22E0FF', '#7AF6FF');
  cabinet(g, 0.4, body, '#FF3DBE', '#FF8AD4');
  box(g, lit('#7A4DFF', 0.35), 1.7, 0.06, 0.06, -0.05, 1.85, 0.05);
  return g;
}

export const arcadeInterior = {
  id: 'arcade',
  label: 'Arcade',
  accent: '#FF3DBE',
  ink: '#1A0A14',
  glass: '#7A4DFF',
  tint,
  createProps: () => cachedProps('arcade', build),
};
