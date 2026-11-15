// Procedural canvas textures for Blackwater Foundry. One seeded noise
// helper and one painter per surface; no assets, no network — the dossier
// carries the recipe, not the pixels. All textures are drawn once at load.
import * as THREE from 'three';
import { mulberry32 } from './utils.js';

function cv(s) { const c = document.createElement('canvas'); c.width = c.height = s; return c; }
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function base(c, col) { const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); return g; }
// Speckle: n random dots, one colour, varying alpha.
function dots(g, r, s, n, col, a0 = 0.25) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a0 * (0.3 + r() * 0.7);
    g.fillStyle = col;
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
  g.globalAlpha = 1;
}
// Soft blotches: translucent ellipses, the grime that breaks flat colour.
function blotch(g, r, s, n, col, a0 = 0.12, rm = 22) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a0 * (0.5 + r() * 0.5);
    g.fillStyle = col;
    const x = r() * s, y = r() * s, rad = 4 + r() * rm;
    g.beginPath(); g.ellipse(x, y, rad, rad * (0.4 + r() * 0.6), r() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
// Concrete floor: warm grey, speckle, oil blotches, slab joints on the
// tile edges so the repeat reads as a 4 m slab grid.
export function concreteTex(rx, ry) {
  const c = cv(128), g = base(c, '#8a8378'), r = mulberry32(11);
  dots(g, r, 128, 900, '#6a635a', 0.3); dots(g, r, 128, 500, '#a89f92', 0.25);
  blotch(g, r, 128, 4, '#3a332c', 0.14, 26);
  g.strokeStyle = 'rgba(40,36,30,0.5)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
  return tex(c, rx, ry);
}
// Brick: mortar base, staggered courses with per-brick brightness, soot.
export function brickTex(rx, ry) {
  const c = cv(256), g = base(c, '#6a4a3c'), r = mulberry32(23);
  for (let y = 0; y < 256; y += 16) {
    const off = (y / 16) % 2 ? 32 : 0;
    for (let x = -64; x < 256; x += 64) {
      const v = 0.75 + r() * 0.5;
      g.fillStyle = `rgb(${138 * v | 0},${90 * v | 0},${68 * v | 0})`;
      g.fillRect(x + off + 2, y + 2, 60, 12);
    }
  }
  dots(g, r, 256, 400, '#2a1c14', 0.25);
  blotch(g, r, 256, 5, '#241812', 0.16, 30);
  return tex(c, rx, ry);
}
// Dull steel: horizontal brushed streaks, rust blooms at random spots.
export function steelTex(rx, ry) {
  const c = cv(128), g = base(c, '#6a7076'), r = mulberry32(37);
  for (let i = 0; i < 160; i++) {
    g.globalAlpha = 0.05 + r() * 0.1;
    g.fillStyle = r() < 0.5 ? '#7d838a' : '#565c62';
    g.fillRect(0, r() * 128, 128, 1);
  }
  g.globalAlpha = 1;
  blotch(g, r, 128, 6, '#5a3a20', 0.2, 12);
  dots(g, r, 128, 200, '#3a3e42', 0.3);
  return tex(c, rx, ry);
}
// Asphalt: dark speckle, two patch repairs.
export function asphaltTex(rx, ry) {
  const c = cv(128), g = base(c, '#4a4640'), r = mulberry32(41);
  dots(g, r, 128, 1100, '#2e2b26', 0.35); dots(g, r, 128, 400, '#6a655c', 0.25);
  g.fillStyle = 'rgba(90,86,78,0.5)'; g.fillRect(10, 70, 60, 34);
  g.fillStyle = 'rgba(40,38,34,0.5)'; g.fillRect(70, 20, 44, 26);
  return tex(c, rx, ry);
}
// Pale silo: vertical panel seams, rust drips from the top rim.
export function siloTex(rx, ry) {
  const c = cv(256), g = base(c, '#cfc8b8'), r = mulberry32(53);
  dots(g, r, 256, 500, '#b5ad9c', 0.25); dots(g, r, 256, 300, '#e2dcc9', 0.2);
  g.strokeStyle = 'rgba(90,84,70,0.55)'; g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let i = 0; i < 10; i++) {
    const x = r() * 256, len = 20 + r() * 70;
    g.strokeStyle = `rgba(122,74,40,${0.25 + r() * 0.3})`; g.lineWidth = 2 + r() * 3;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 6, len); g.stroke();
  }
  return tex(c, rx, ry);
}
// Container: faded paint, vertical corrugation, grime. Base is a hex string.
export function containerTex(baseCol, rx, ry, seed) {
  const c = cv(128), g = base(c, baseCol), r = mulberry32(seed);
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 0, 3, 128);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 4, 0, 2, 128);
  }
  blotch(g, r, 128, 5, '#2a2018', 0.14, 20);
  dots(g, r, 128, 250, '#1c1712', 0.3);
  return tex(c, rx, ry);
}
// Crate: plank lines and a centre joint, nail speckle.
export function crateTex(rx, ry) {
  const c = cv(128), g = base(c, '#8a7350'), r = mulberry32(67);
  g.strokeStyle = 'rgba(60,44,26,0.6)'; g.lineWidth = 2;
  for (let y = 0; y <= 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.stroke();
  dots(g, r, 128, 300, '#5a4630', 0.3);
  return tex(c, rx, ry);
}
// Drum: rust bands top and bottom, speckle.
export function drumTex(rx, ry) {
  const c = cv(128), g = base(c, '#5a6a58'), r = mulberry32(71);
  dots(g, r, 128, 350, '#3a4438', 0.3);
  g.fillStyle = 'rgba(90,58,32,0.55)'; g.fillRect(0, 0, 128, 14); g.fillRect(0, 114, 128, 14);
  blotch(g, r, 128, 4, '#4a3018', 0.2, 14);
  return tex(c, rx, ry);
}
