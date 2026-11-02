// Texas Hill Country: a Central Texas ranch around the office tower. Everything here is procedural
// (canvas textures and a few thousand triangles). Nothing is fetched. The office file does not
// import this module unless ?theme=ranch or the saved choice says so.
//
// Scenery sits on layer 1. The studio aura pass only sees layer 0, so the sunset shadow stays
// the building's. Lights get layer 1 enabled here; layer 0 is left on, so the tower is lit as before.
import * as THREE from 'three';
import { texasFlagpole } from './texas-flag.js';

const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ranchTheme = {
  id: 'ranch',
  label: 'Texas Hill Country',
  loading: 'Setting up the ranch…',
  themeColor: '#E36A3C',
  css: new URL('./ranch.css', import.meta.url).href,
  fontHref: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,800;9..144,900&display=swap',
  // Sun low in the frame (y grows downward), dusk blue in the corners.
  sky: {
    centre: [0.4, 0.7],
    radii: [1.05, 0.92],
    stops: [[0, '#FFE0A8'], [0.4, '#E15A32'], [1, '#1E315C']],
    shadow: '#4A2414',
  },
  lightPhase: 'golden',
  light: {
    night: 0, lamps: 0.22, windows: 0.1,
    sunI: 2.05, sunEl: 16, sunAz: 232, sunC: '#FF9A48',
    hemiI: 1.05, hemiSky: '#FFD2A4', hemiGnd: '#7E8A52',
    fillI: 0.32, fillC: '#FFC8A0', envI: 0.5, exposure: 1.06,
    shadow: 0.3,
  },
  restyle: restyleOffice,
  mount: mountRanch,
};

// Warm the tower once, before it is cloned: baked lightmaps pick up a limestone multiply,
// neutrals drift toward cedar and iron, plants toward live oak. Blobs are not in these templates.
function restyleOffice(templates) {
  const openMats = new Set();
  templates.floor_open?.traverse?.((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) if (m) openMats.add(m);
  });
  const seen = new Set();
  for (const [name, root] of Object.entries(templates)) {
    if (name === 'floor_open' || !root?.traverse) continue; // interiors tint the open floor themselves
    root.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m || seen.has(m) || openMats.has(m)) continue;
        seen.add(m);
        tintMaterial(m);
      }
    });
  }
}

function tintMaterial(m) {
  if (m.isMeshBasicMaterial && m.map) {
    m.color.set('#D7B07A');
    return;
  }
  if (!m.color) return;
  if (m.transparent && m.opacity < 0.65) {
    m.color.set('#E4D0B4');
    return;
  }
  const hsl = { h: 0, s: 0, l: 0 };
  m.color.getHSL(hsl);
  if (hsl.h > 0.22 && hsl.h < 0.48 && hsl.s > 0.12) {
    m.color.offsetHSL(-0.03, -0.04, -0.03);
  } else if (hsl.s < 0.14) {
    if (hsl.l > 0.78) m.color.set('#E7D7BE');
    else if (hsl.l > 0.45) m.color.set('#C6A67C');
    else m.color.set('#3C2E28');
  } else {
    let dh = 0.07 - hsl.h;
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    m.color.offsetHSL(dh * 0.65, 0.04, 0);
  }
  if (m.emissive && m.emissive.getHex() !== 0) {
    m.emissive.set(m.name === 'night_screen' ? '#FFB15A' : '#FFC48A');
  }
}

function mountRanch({ scene }) {
  const geos = [];
  const mats = [];
  const texs = [];
  const sway = [];
  const root = new THREE.Group();
  root.name = 'theme-ranch';

  const mat = (color, roughness = 0.86, metalness = 0, extra) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    mats.push(m);
    return m;
  };
  const geo = (g) => { geos.push(g); return g; };

  const bark = mat('#5C3B28', 0.92);
  const oak = mat('#2C4A2C', 0.86);
  const oakLite = mat('#3E6138', 0.84);
  const mesquite = mat('#8A9344', 0.8);
  const cedarGreen = mat('#314838', 0.88);
  const limestone = mat('#E4D7C4', 0.96);
  const limestoneDark = mat('#C9BBA6', 0.96);
  const iron = mat('#5C564F', 0.42, 0.72);
  const bone = mat('#E7DCC8', 0.72);
  const gold = mat('#E2B04A', 0.38, 0.62);
  const dark = mat('#1A120E', 0.9);
  const tinMat = mat('#ffffff', 0.62, 0.42, { map: tinTexture(texs) });
  const woodMat = mat('#ffffff', 0.9, 0.02, { map: woodTexture(texs) });
  const cedar = mat('#7A5236', 0.9);

  // Pad sits toward the camera so the far edge ends and the sunset shows behind the trees.
  root.add(ground(geo, mat, texs, 17, 2.2, 3.2));
  root.add(blobShadow(geo, mats, texs));

  buildFence(root, geo, mat, iron);
  liveOak(root, geo, bark, oak, oakLite, sway, -6.2, -11.2, 1.55);
  liveOak(root, geo, bark, oak, oakLite, sway, 7.4, -12.0, 1.7);
  liveOak(root, geo, bark, oak, oakLite, sway, -12.4, -3.2, 1.25);
  liveOak(root, geo, bark, oak, oakLite, sway, 14.2, -5.5, 1.2);
  liveOak(root, geo, bark, oak, oakLite, sway, -9.5, 7.4, 1.05);
  mesquiteTree(root, geo, bark, mesquite, sway, 10.6, 7.2, 0.95);
  mesquiteTree(root, geo, bark, mesquite, sway, -8.6, 8.2, 0.85);
  mesquiteTree(root, geo, bark, mesquite, sway, 9.2, -9.4, 0.8);
  cedarTree(root, geo, bark, cedarGreen, -13.5, -8.4, 2.8);
  cedarTree(root, geo, bark, cedarGreen, 1.2, -13.2, 3.2);
  cedarTree(root, geo, bark, cedarGreen, 12.6, -10.2, 2.6);
  cedarTree(root, geo, bark, cedarGreen, 15.4, 1.6, 2.5);
  cedarTree(root, geo, bark, cedarGreen, -14.2, 4.2, 2.3);

  for (const [x, z, s, darkRock] of [
    [-8.4, 8.6, 0.9, false], [-6.8, 9.2, 0.55, true], [8.2, 8.8, 0.8, false],
    [11.2, -7.4, 1.0, true], [-10.4, -7.6, 0.75, false], [4.6, -10.2, 0.6, true],
  ]) root.add(rock(geo, darkRock ? limestoneDark : limestone, x, z, s));

  cactus(root, geo, mat, 7.4, 8.4);
  cactus(root, geo, mat, 8.5, 7.6);
  cactus(root, geo, mat, -5.2, 8.8);

  const barn = buildBarn(geo, woodMat, tinMat, dark, iron, bone, gold, cedar);
  barn.position.set(-5.6, 0, -11.15);
  barn.rotation.y = 0.35;
  barn.scale.setScalar(0.7);
  root.add(barn);

  const mill = buildWindmill(geo, iron, tinMat);
  mill.group.position.set(1.4, 0, -12.4);
  mill.group.rotation.y = 0.55;
  root.add(mill.group);

  const tank = buildTank(geo, tinMat);
  tank.position.set(10.4, 0, -8.6);
  tank.scale.setScalar(0.85);
  root.add(tank);

  // Foreground, in front of the near face (the whole cloth stays past z = 6.2) and left
  // of center, clear of the slab and of the left-hand panels. Upper floors sit behind it.
  // rotation.y = π/4 keeps the obverse toward the iso camera.
  const flagpole = texasFlagpole({ poleHeight: 5.6, fly: 2.05 });
  flagpole.position.set(-0.8, 0, 7.5);
  flagpole.rotation.y = Math.PI / 4;
  root.add(flagpole);

  root.traverse((o) => { o.layers.set(1); o.castShadow = false; o.receiveShadow = false; });
  scene.add(root);
  scene.traverse((o) => { if (o.isLight) o.layers.enable(1); });

  let t = 0;
  return {
    update(dt) {
      if (REDUCE) return;
      t += dt;
      mill.blades.rotation.z = t * 0.45;
      for (const c of sway) c.rotation.y = Math.sin(t * 0.45 + c.userData.phase) * 0.035;
      if (flagpole.userData.pivot) flagpole.userData.pivot.rotation.y = Math.sin(t * 0.9) * 0.12;
    },
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const tex of texs) tex.dispose();
    },
  };
}

function canvasTex(w, h, draw, texs) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texs.push(t);
  return t;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ground(geo, mat, texs, radius, x, z) {
  const tex = canvasTex(512, 512, (g, w, h) => {
    const rnd = mulberry(0x51A11);
    g.fillStyle = '#C6A15E';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
    g.fillStyle = rnd() < 0.48 ? '#6E8A3E' : rnd() < 0.72 ? '#E6D3A4' : '#8A5A32';
    g.globalAlpha = 0.32 + rnd() * 0.45;
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, 10 + rnd() * 40, 8 + rnd() * 26, rnd() * 6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.45;
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = rnd() < 0.5 ? '#F3EADA' : '#6E532E';
      g.fillRect(rnd() * w, rnd() * h, 1.2, 1.2);
    }
    g.globalAlpha = 0.4;
    g.strokeStyle = '#E4D2AE';
    g.lineWidth = 22;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.62);
    g.quadraticCurveTo(w * 0.56, h * 0.78, w * 0.5, h * 0.98);
    g.stroke();
    const rim = g.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.5);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(62, 36, 16, 0.45)');
    g.globalAlpha = 1;
    g.fillStyle = rim;
    g.fillRect(0, 0, w, h);
  }, texs);
  const mesh = new THREE.Mesh(geo(new THREE.CircleGeometry(radius, 64)), mat('#ffffff', 1, 0, { map: tex }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, -0.03, z);
  return mesh;
}

function blobShadow(geo, mats, texs) {
  const tex = canvasTex(256, 256, (g, w, h) => {
    const rad = g.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, w * 0.48);
    rad.addColorStop(0, 'rgba(48, 22, 8, 0.42)');
    rad.addColorStop(0.55, 'rgba(48, 22, 8, 0.16)');
    rad.addColorStop(1, 'rgba(48, 22, 8, 0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, w, h);
  }, texs);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  mats.push(m);
  const mesh = new THREE.Mesh(geo(new THREE.PlaneGeometry(30, 22)), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.012;
  return mesh;
}

function woodTexture(texs) {
  return canvasTex(128, 256, (g, w, h) => {
    const rnd = mulberry(0xB00B);
    g.fillStyle = '#7A5236';
    g.fillRect(0, 0, w, h);
    const boards = 7;
    for (let i = 0; i < boards; i++) {
      const x = (i * w) / boards;
      g.fillStyle = i % 2 ? '#6A442C' : '#8C6244';
      g.fillRect(x, 0, w / boards - 2, h);
      g.strokeStyle = 'rgba(40, 20, 10, 0.35)';
      g.strokeRect(x + 0.5, 0, w / boards - 2, h);
      for (let k = 0; k < 8; k++) {
        g.strokeStyle = `rgba(90, 50, 24, ${0.15 + rnd() * 0.25})`;
        g.beginPath();
        const y = rnd() * h;
        g.moveTo(x + 3, y);
        g.lineTo(x + w / boards - 6, y + (rnd() - 0.5) * 10);
        g.stroke();
      }
    }
  }, texs);
}

function tinTexture(texs) {
  const t = canvasTex(64, 128, (g, w, h) => {
    const rnd = mulberry(0x71E0);
    g.fillStyle = '#8E4634';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 7) {
      g.fillStyle = (y / 7) % 2 ? '#A85A40' : '#6E3428';
      g.fillRect(0, y, w, 3);
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = rnd() < 0.5 ? '#C47A3A' : '#5A2A20';
      g.globalAlpha = 0.35;
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 6, 1.5 + rnd() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, texs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

function buildFence(parent, geo, mat, iron) {
  const x0 = -11.6, x1 = 11.6, z0 = -9.2, z1 = 9.5, gate = 1.7;
  const posts = [];
  const spans = [];
  const seen = new Set();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const edge = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.15));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3(ax + (bx - ax) * t, 0, az + (bz - az) * t);
      const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
      if (!seen.has(key)) { seen.add(key); posts.push(p); }
      if (prev) spans.push([prev, p]);
      prev = p;
    }
  };
  edge(x0, z0, x1, z0);
  edge(x1, z0, x1, z1);
  edge(x1, z1, gate, z1);
  edge(-gate, z1, x0, z1);
  edge(x0, z1, x0, z0);

  const wood = mat('#ffffff', 0.92, 0);
  const postGeo = geo(new THREE.CylinderGeometry(0.1, 0.14, 1.42, 6));
  const postMesh = new THREE.InstancedMesh(postGeo, wood, posts.length);
  postMesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const tones = ['#6B4630', '#8A5A3C', '#4E3426', '#7A5138'].map((hex) => new THREE.Color(hex));
  posts.forEach((p, i) => {
    const lean = ((i * 17) % 7 - 3) * 0.01;
    dummy.position.set(p.x, 0.71, p.z);
    dummy.rotation.set(lean, 0, lean * 0.4);
    dummy.scale.set(1, 0.94 + (i % 5) * 0.03, 1);
    dummy.updateMatrix();
    postMesh.setMatrixAt(i, dummy.matrix);
    postMesh.setColorAt(i, tones[i % tones.length]);
  });
  postMesh.instanceMatrix.needsUpdate = true;
  if (postMesh.instanceColor) postMesh.instanceColor.needsUpdate = true;
  parent.add(postMesh);

  const wireGeo = geo(new THREE.BoxGeometry(1, 0.022, 0.022));
  const wireMesh = new THREE.InstancedMesh(wireGeo, iron, spans.length * 3);
  wireMesh.frustumCulled = false;
  const dir = new THREE.Vector3();
  let w = 0;
  for (const [a, b] of spans) {
    dir.set(b.x - a.x, 0, b.z - a.z);
    const d = dir.length();
    dir.multiplyScalar(1 / d);
    for (const hy of [0.4, 0.72, 1.04]) {
      dummy.position.set((a.x + b.x) / 2, hy, (a.z + b.z) / 2);
      dummy.quaternion.setFromUnitVectors(xAxis, dir);
      dummy.scale.set(d, 1, 1);
      dummy.updateMatrix();
      wireMesh.setMatrixAt(w++, dummy.matrix);
    }
  }
  wireMesh.instanceMatrix.needsUpdate = true;
  parent.add(wireMesh);

  // Cattle guard in the gate: a few flat bars on the caliche.
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(geo(new THREE.BoxGeometry(3.1, 0.05, 0.07)), iron);
    bar.position.set(0, 0.04, z1 + 0.15 + i * 0.22);
    parent.add(bar);
  }
}

function liveOak(parent, geo, bark, oak, oakLite, sway, x, z, scale) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunk = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16 * scale, 0.3 * scale, 1.15 * scale, 6)), bark);
  trunk.position.y = 0.55 * scale;
  g.add(trunk);
  const canopy = new THREE.Group();
  canopy.userData.phase = x * 0.3 + z;
  const blob = geo(new THREE.IcosahedronGeometry(1, 1));
  const spots = [[0, 1.7, 0, 1.15], [-0.7, 1.45, 0.35, 0.85], [0.75, 1.5, -0.2, 0.9], [0.1, 1.9, -0.55, 0.7]];
  spots.forEach(([px, py, pz, s], i) => {
    const m = new THREE.Mesh(blob, i % 2 ? oakLite : oak);
    m.position.set(px * scale, py * scale, pz * scale);
    m.scale.set(s * scale * 1.45, s * scale * 0.62, s * scale * 1.2);
    canopy.add(m);
  });
  g.add(canopy);
  sway.push(canopy);
  parent.add(g);
}

function mesquiteTree(parent, geo, bark, leaf, sway, x, z, scale) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunk = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07 * scale, 0.14 * scale, 1.6 * scale, 5)), bark);
  trunk.position.y = 0.8 * scale;
  trunk.rotation.z = 0.18;
  g.add(trunk);
  const canopy = new THREE.Group();
  canopy.position.y = 1.5 * scale;
  canopy.userData.phase = z;
  const blob = geo(new THREE.IcosahedronGeometry(0.55 * scale, 0));
  [[0, 0, 0], [0.45, 0.15, 0.1], [-0.35, 0.05, -0.2]].forEach(([px, py, pz], i) => {
    const m = new THREE.Mesh(blob, leaf);
    m.position.set(px * scale, py * scale, pz * scale);
    m.scale.set(1.1 - i * 0.15, 0.7, 0.9);
    canopy.add(m);
  });
  g.add(canopy);
  sway.push(canopy);
  parent.add(g);
}

function cedarTree(parent, geo, bark, leaf, x, z, h) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunk = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07, 0.12, h * 0.28, 5)), bark);
  trunk.position.y = h * 0.12;
  g.add(trunk);
  const a = new THREE.Mesh(geo(new THREE.ConeGeometry(h * 0.34, h * 0.62, 7)), leaf);
  a.position.y = h * 0.42;
  g.add(a);
  const b = new THREE.Mesh(geo(new THREE.ConeGeometry(h * 0.24, h * 0.42, 7)), leaf);
  b.position.y = h * 0.72;
  g.add(b);
  parent.add(g);
}

function rock(geo, material, x, z, s) {
  const m = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(0.55, 0)), material);
  m.position.set(x, 0.16 * s, z);
  m.scale.set(s * 1.5, s * 0.42, s * 1.1);
  m.rotation.y = x + z;
  return m;
}

function cactus(parent, geo, mat, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const padMat = mat('#6E8F45', 0.74);
  const pad = geo(new THREE.SphereGeometry(0.28, 8, 6));
  [[0, 0.32, 0, 1], [0.08, 0.7, 0.02, 0.72], [-0.18, 0.58, 0, 0.5]].forEach(([px, py, pz, s]) => {
    const m = new THREE.Mesh(pad, padMat);
    m.position.set(px, py, pz);
    m.scale.set(s, s * 1.4, s * 0.28);
    g.add(m);
  });
  parent.add(g);
}

function box(geo, w, h, d, material) {
  return new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), material);
}

function buildBarn(geo, wood, tin, dark, iron, bone, gold, cedar) {
  const g = new THREE.Group();
  const body = box(geo, 6.6, 3.45, 4.8, wood);
  body.position.y = 1.725;
  g.add(body);

  const left = box(geo, 3.9, 0.12, 5.35, tin);
  left.position.set(-1.62, 3.78, 0);
  left.rotation.z = 0.48;
  g.add(left);
  const right = box(geo, 3.9, 0.12, 5.35, tin);
  right.position.set(1.62, 3.78, 0);
  right.rotation.z = -0.48;
  g.add(right);

  const shape = new THREE.Shape();
  shape.moveTo(-3.3, 0);
  shape.lineTo(3.3, 0);
  shape.lineTo(0, 1.62);
  shape.closePath();
  const gableGeo = geo(new THREE.ShapeGeometry(shape));
  for (const z of [2.42, -2.42]) {
    const gable = new THREE.Mesh(gableGeo, wood);
    gable.position.set(0, 3.45, z);
    if (z < 0) gable.rotation.y = Math.PI;
    g.add(gable);
  }

  const hole = box(geo, 1.7, 2.3, 0.16, dark);
  hole.position.set(-0.45, 1.15, 2.46);
  g.add(hole);
  const door = box(geo, 1.35, 2.15, 0.08, wood);
  door.position.set(0.85, 1.12, 2.5);
  g.add(door);
  for (const dir of [1, -1]) {
    const brace = box(geo, 1.85, 0.08, 0.05, iron);
    brace.position.set(-0.45, 1.2, 2.56);
    brace.rotation.z = dir * 0.72;
    g.add(brace);
  }

  const star = new THREE.Mesh(geo(new THREE.ShapeGeometry(starShape(0.46, 0.2))), gold);
  star.position.set(0.15, 4.15, 2.5);
  g.add(star);

  const horns = longhorn(geo, bone);
  horns.position.set(-0.45, 2.55, 2.58);
  horns.scale.setScalar(0.85);
  g.add(horns);

  const shoe = new THREE.Mesh(geo(new THREE.TorusGeometry(0.28, 0.045, 8, 18, Math.PI * 1.45)), iron);
  shoe.position.set(1.7, 2.15, 2.52);
  shoe.rotation.z = Math.PI * 0.28;
  g.add(shoe);

  const loft = box(geo, 0.62, 0.48, 0.08, dark);
  loft.position.set(0.15, 3.72, 2.5);
  g.add(loft);

  const wheel = wagonWheel(geo, cedar, iron);
  wheel.position.set(2.7, 0.75, 2.15);
  wheel.rotation.y = 0.4;
  wheel.rotation.z = 0.18;
  g.add(wheel);
  return g;
}

function starShape(outer, inner, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function longhorn(geo, bone) {
  const g = new THREE.Group();
  const skull = new THREE.Mesh(geo(new THREE.SphereGeometry(0.22, 10, 8)), bone);
  skull.scale.set(1.15, 0.82, 0.62);
  g.add(skull);
  for (const side of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(side * 0.12, 0.06, 0),
      new THREE.Vector3(side * 0.62, 0.32, 0.02),
      new THREE.Vector3(side * 1.05, 0.02, 0.08),
    );
    g.add(new THREE.Mesh(geo(new THREE.TubeGeometry(curve, 10, 0.045, 5, false)), bone));
  }
  return g;
}

function wagonWheel(geo, wood, iron) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo(new THREE.TorusGeometry(0.72, 0.055, 6, 18)), wood));
  const spoke = geo(new THREE.BoxGeometry(0.045, 1.35, 0.04));
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(spoke, wood);
    s.rotation.z = (i / 6) * Math.PI;
    g.add(s);
  }
  const hub = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8)), iron);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  return g;
}

function buildWindmill(geo, iron, tin) {
  const group = new THREE.Group();
  const legH = 5.4;
  const leg = geo(new THREE.CylinderGeometry(0.045, 0.06, legH, 5));
  const up = new THREE.Vector3(0, 1, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const base = new THREE.Vector3(sx * 0.85, 0, sz * 0.85);
    const top = new THREE.Vector3(sx * 0.16, 5.35, sz * 0.16);
    const dir = top.clone().sub(base);
    const len = dir.length();
    const m = new THREE.Mesh(leg, iron);
    m.position.copy(base).add(top).multiplyScalar(0.5);
    m.scale.y = len / legH;
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    group.add(m);
  }
  const head = new THREE.Group();
  head.position.y = 5.45;
  head.add(new THREE.Mesh(geo(new THREE.BoxGeometry(0.45, 0.38, 0.7)), iron));
  const blades = new THREE.Group();
  const blade = geo(new THREE.BoxGeometry(0.1, 1.25, 0.025));
  for (let i = 0; i < 12; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(blade, tin);
    m.position.y = 0.78;
    pivot.add(m);
    blades.add(pivot);
  }
  blades.add(new THREE.Mesh(geo(new THREE.SphereGeometry(0.14, 8, 6)), iron));
  head.add(blades);
  const tail = new THREE.Mesh(geo(new THREE.BoxGeometry(0.06, 0.7, 0.85)), tin);
  tail.position.set(0, 0.05, -0.7);
  head.add(tail);
  group.add(head);
  return { group, blades };
}

function buildTank(geo, tin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.15, 1.15, 2.25, 12)), tin);
  body.position.y = 1.12;
  g.add(body);
  const cap = new THREE.Mesh(geo(new THREE.ConeGeometry(1.28, 0.62, 12)), tin);
  cap.position.y = 2.5;
  g.add(cap);
  return g;
}
