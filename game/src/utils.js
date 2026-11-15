// Small shared helpers: seeded RNG, clamps, lerps and the AABB math the
// collision, shooting and bot-vision code all build on. No allocations in the
// hot paths: callers pass scratch vectors in.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// AABB: { min: [x,y,z], max: [x,y,z] }. Stored as plain arrays so the map
// builder can write them inline and the collision code can read them fast.
export function aabb(minX, minY, minZ, maxX, maxY, maxZ) {
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// Does the vertical capsule (feet position p, radius r, height h) overlap the box?
export function capsuleHitsBox(p, r, h, box) {
  const cx = clamp(p.x, box.min[0], box.max[0]);
  const cy = clamp(p.y, box.min[1], box.max[1]);
  const cz = clamp(p.z, box.min[2], box.max[2]);
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  // Inside the box in xz and overlapping in y counts as a hit too.
  if (dx === 0 && dz === 0) return p.y < box.max[1] && p.y + h > box.min[1];
  return dx * dx + dz * dz < r * r && p.y < box.max[1] && p.y + h > box.min[1];
}

// Slab ray vs AABB. Returns the entry distance along the ray, or -1 on a miss.
// The ray origin/direction are plain {x,y,z} objects; tMax caps the range.
export function rayHitsBox(ox, oy, oz, dx, dy, dz, box, tMax) {
  let tMin = 0, tMaxCur = tMax;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ox : i === 1 ? oy : oz;
    const d = i === 0 ? dx : i === 1 ? dy : dz;
    const lo = box.min[i], hi = box.max[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMaxCur) tMaxCur = t2;
      if (tMin > tMaxCur) return -1;
    }
  }
  return tMin;
}

// Ray vs a sphere (smoke clouds). Returns the entry distance, or -1.
export function rayHitsSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, tMax) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const t = tca - Math.sqrt(r2 - d2);
  return t < tMax ? t : -1;
}

// Angle helpers for yaw (radians, -PI..PI).
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function yawTo(x0, z0, x1, z1) { return Math.atan2(-(x1 - x0), -(z1 - z0)); }
