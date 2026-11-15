// Collision: a vertical capsule (the player or a bot) sliding against the
// map's AABB colliders, and line-of-sight tests the bots and the shooting
// code share. Everything is plain numbers — no three.js objects in here.
import { capsuleHitsBox, rayHitsBox, rayHitsSphere } from './utils.js';

// Move a capsule by (dx, dz) on the ground plane, sliding along walls.
// p is {x, y, z}; the capsule stands from p.y to p.y + height.
// Returns nothing; p is mutated. y is handled by the caller's gravity.
export function moveCapsule(p, dx, dz, radius, height, boxes) {
  p.x += dx;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (capsuleHitsBox(p, radius, height, b)) {
      // Push out along the smallest horizontal penetration axis.
      const pushL = (p.x + radius) - b.min[0];
      const pushR = b.max[0] - (p.x - radius);
      if (pushL < pushR) p.x = b.min[0] - radius; else p.x = b.max[0] + radius;
    }
  }
  p.z += dz;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (capsuleHitsBox(p, radius, height, b)) {
      const pushB = (p.z + radius) - b.min[2];
      const pushF = b.max[2] - (p.z - radius);
      if (pushB < pushF) p.z = b.min[2] - radius; else p.z = b.max[2] + radius;
    }
  }
}

// True when the segment from (x0,y0,z0) to (x1,y1,z1) is clear of every box.
// Used for bot vision and for checking whether a shot's tracer is blocked.
export function lineOfSight(x0, y0, z0, x1, y1, z1, boxes) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const nx = dx / len, ny = dy / len, nz = dz / len;
  for (let i = 0; i < boxes.length; i++) {
    const t = rayHitsBox(x0, y0, z0, nx, ny, nz, boxes[i], len);
    if (t >= 0 && t < len - 0.01) return false;
  }
  return true;
}

// Line of sight that smoke can also block. smoke is an array of {x,y,z,r}.
export function lineOfSightSmoked(x0, y0, z0, x1, y1, z1, boxes, smoke) {
  if (!lineOfSight(x0, y0, z0, x1, y1, z1, boxes)) return false;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const nx = dx / len, ny = dy / len, nz = dz / len;
  for (let i = 0; i < smoke.length; i++) {
    const s = smoke[i];
    if (rayHitsSphere(x0, y0, z0, nx, ny, nz, s.x, s.y, s.z, s.r, len) >= 0) return false;
  }
  return true;
}

// The closest box hit along a ray, for bullet impacts. Returns {t, box} or null.
export function raycastBoxes(ox, oy, oz, dx, dy, dz, boxes, tMax) {
  let best = null, bestT = tMax;
  for (let i = 0; i < boxes.length; i++) {
    const t = rayHitsBox(ox, oy, oz, dx, dy, dz, boxes[i], bestT);
    if (t >= 0 && t < bestT) { bestT = t; best = boxes[i]; }
  }
  return best ? { t: bestT, box: best } : null;
}
