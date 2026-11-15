// Hitscan resolution shared by the player and the bots: one ray against the
// map's AABBs and every living character's hitbox. A character is a capsule
// with a head zone; the ray returns the closest thing it meets.
import { rayHitsBox } from './utils.js';
import { raycastBoxes } from './collision.js';

// target: { id, team, alive, pos: {x,y,z}, radius, height, headTop, headBottom }
// ignoreId is the shooter's own id: a ray starts inside the shooter's own
// capsule, so without it every shot would hit its own head at t = 0.
// Returns { kind: 'wall'|'body'|'head', target, point, t } or null.
export function resolveHitscan(ox, oy, oz, dx, dy, dz, range, boxes, targets, ignoreId) {
  let bestT = range;
  let best = null;
  const wall = raycastBoxes(ox, oy, oz, dx, dy, dz, boxes, range);
  if (wall) { bestT = wall.t; best = { kind: 'wall', target: null, t: wall.t }; }

  for (const t of targets) {
    if (!t.alive || t.id === ignoreId) continue;
    // Body capsule as a box around the character.
    const box = {
      min: [t.pos.x - t.radius, t.pos.y, t.pos.z - t.radius],
      max: [t.pos.x + t.radius, t.pos.y + t.height, t.pos.z + t.radius],
    };
    const hit = rayHitsBox(ox, oy, oz, dx, dy, dz, box, bestT);
    if (hit < 0) continue;
    // Head zone: the top slice of the capsule.
    const hy = oy + dy * hit;
    const kind = hy >= t.pos.y + t.headBottom ? 'head' : 'body';
    bestT = hit;
    best = { kind, target: t, t: hit };
  }
  if (!best) return null;
  best.point = { x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT };
  return best;
}
