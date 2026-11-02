// Studio interior. Ring light, camera, mic, posters.
import * as THREE from 'three';
import { box, cachedProps, canvasTex, cluster, cyl, lit, mat, sign } from '../kit.js';

const tint = {
  floor: '#E7E2DC', wall: '#F4F0EA', wood: '#C4B2A2', metal: '#3A3A40', fabric: '#F0D6DE', glass: '#FF8FA3',
};

function poster(bg, draw) {
  return canvasTex(180, 240, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    draw(g, w, h);
  });
}

function build() {
  const g = cluster();
  const steel = mat('#D5D7DC', 0.3, 0.75);
  const black = mat('#1C1C22', 0.45, 0.3);
  const stand = mat('#2C2C32', 0.5, 0.4);

  cyl(g, stand, 0.04, 0.08, 1.15, -0.85, 0.58, 0.2, 8);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 8, 20), lit('#FFF4E0', 0.85));
  ring.position.set(-0.85, 1.45, 0.2);
  g.add(ring);

  cyl(g, stand, 0.035, 0.06, 0.7, 0.15, 0.35, 0.35, 6);
  box(g, black, 0.28, 0.2, 0.34, 0.15, 0.85, 0.35);
  cyl(g, steel, 0.09, 0.11, 0.16, 0.15, 0.85, 0.56, 12);

  cyl(g, stand, 0.02, 0.025, 1.05, 0.7, 0.52, 0.25, 6);
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#222228', 0.4, 0.5));
  mic.scale.set(1, 1.4, 1);
  mic.position.set(0.7, 1.15, 0.25);
  g.add(mic);

  const play = poster('#F4F0EA', (ctx, w, h) => {
    ctx.fillStyle = '#FF4D6D';
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.28);
    ctx.lineTo(w * 0.38, h * 0.72);
    ctx.lineTo(w * 0.7, h * 0.5);
    ctx.closePath();
    ctx.fill();
  });
  const heart = poster('#241820', (ctx, w, h) => {
    ctx.fillStyle = '#FF4D6D';
    ctx.beginPath();
    ctx.arc(w * 0.38, h * 0.42, 28, 0, Math.PI * 2);
    ctx.arc(w * 0.62, h * 0.42, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.78);
    ctx.lineTo(w * 0.78, h * 0.5);
    ctx.fill();
  });
  box(g, sign(play), 0.55, 0.74, 0.03, -0.15, 1.7, -0.12);
  box(g, sign(heart), 0.55, 0.74, 0.03, 0.55, 1.7, -0.12);
  return g;
}

export const studioInterior = {
  id: 'studio',
  label: 'Studio',
  accent: '#FF4D6D',
  ink: '#FFFFFF',
  glass: '#FF8FA3',
  tint,
  createProps: () => cachedProps('studio', build),
};
