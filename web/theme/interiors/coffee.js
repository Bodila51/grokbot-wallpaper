// Coffee bar interior. Chalk menu, espresso machine, cups.
import { box, cachedProps, canvasTex, cluster, cyl, lit, mat, sign } from '../kit.js';

const tint = {
  floor: '#E4C4A0', wall: '#F6E7D4', wood: '#A56B43', metal: '#3E3834', fabric: '#E7D3C0', glass: '#C4896A',
};

function menuTexture() {
  return canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#243028';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#D9C7A2';
    g.lineWidth = 8;
    g.strokeRect(16, 16, w - 32, h - 32);
    g.fillStyle = '#F4E6C8';
    g.textAlign = 'center';
    g.font = '700 46px Georgia, serif';
    g.fillText('MENU', w / 2, 78);
    g.font = '600 30px Georgia, serif';
    ['drip', 'latte', 'mocha', 'cap'].forEach((line, i) => g.fillText(line, w / 2, 150 + i * 48));
  });
}

function build() {
  const g = cluster();
  const wood = mat('#8C5A38', 0.78);
  const steel = mat('#C5C8CE', 0.28, 0.8);
  const dark = mat('#2A2422', 0.6, 0.2);
  const cup = mat('#F7F1E8', 0.4);
  const cream = mat('#F3E0C4', 0.55);
  box(g, wood, 1.7, 0.92, 0.62, -0.15, 0.46, 0.35);
  box(g, dark, 0.62, 0.55, 0.42, -0.55, 1.2, 0.28);
  cyl(g, steel, 0.16, 0.16, 0.12, -0.55, 1.52, 0.28, 16);
  cyl(g, steel, 0.03, 0.03, 0.28, -0.28, 1.35, 0.42, 8);
  cyl(g, cup, 0.07, 0.055, 0.1, 0.15, 1.0, 0.42, 10);
  cyl(g, cream, 0.075, 0.06, 0.11, 0.38, 1.01, 0.4, 10);
  cyl(g, lit('#FFB15A', 0.55), 0.1, 0.12, 0.08, -0.55, 1.85, 0.15, 10);
  const board = box(g, sign(menuTexture()), 0.92, 1.35, 0.05, 0.85, 1.55, -0.05);
  board.position.z = -0.02;
  return g;
}

export const coffeeInterior = {
  id: 'coffee',
  label: 'Coffee bar',
  accent: '#6F4E37',
  ink: '#FFF6EC',
  glass: '#C4896A',
  tint,
  createProps: () => cachedProps('coffee', build),
};
