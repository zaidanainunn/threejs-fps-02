// Bots: 9 of them (4 teammates, 5 enemies) running a small FSM over a
// waypoint graph. They never know where anyone is except through vision
// (cone + line of sight, smoke blocks it), hearing (gunshots) and memory
// of a last-seen position. They shoot with the same hitscan resolver the
// player uses, so a bot's kill is a real ray, not a dice roll.
// Objective discipline: one breacher carries the Demolition Charge and
// commits to the site (he only stops to fight up close), one escorts him,
// the rest open the lane; after a plant the breachers hold the site and
// the wardens retake, the closest warden defusing while the rest cover.
import * as THREE from 'three';
import { BOT, WEAPONS, CFG } from './config.js';
import { clamp, angleDiff, yawTo, mulberry32 } from './utils.js';
import { lineOfSightSmoked, moveCapsule } from './collision.js';
import { resolveHitscan } from './combat.js';

const NAMES = {
  wardens: ['Vigil', 'Haven', 'Bastion', 'Sentry', 'Aegis'],
  breachers: ['Rook', 'Havoc', 'Blitz', 'Fuse', 'Nomad'],
};

// A* over the waypoint graph. Returns an array of node indices, or [].
function astar(nodes, adj, from, to) {
  if (from === to) return [to];
  const open = [from];
  const came = new Map([[from, -1]]);
  const g = new Map([[from, 0]]);
  const h = (i) => Math.hypot(nodes[i][0] - nodes[to][0], nodes[i][1] - nodes[to][1]);
  const f = new Map([[from, h(from)]]);
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if ((f.get(open[i]) ?? 1e9) < (f.get(open[best]) ?? 1e9)) best = i;
    const cur = open.splice(best, 1)[0];
    if (cur === to) {
      const path = [];
      let n = cur;
      while (n !== -1) { path.unshift(n); n = came.get(n); }
      return path;
    }
    for (const nb of adj[cur]) {
      const ng = (g.get(cur) ?? 0) + Math.hypot(nodes[cur][0] - nodes[nb][0], nodes[cur][1] - nodes[nb][1]);
      if (ng < (g.get(nb) ?? 1e9)) {
        g.set(nb, ng); f.set(nb, ng + h(nb)); came.set(nb, cur);
        if (!open.includes(nb)) open.push(nb);
      }
    }
  }
  return [];
}

export function createBots(scene, world, fx) {
  const bots = [];
  const boxes = world.colliders;
  const wp = world.waypoints.nodes;
  const adj = world.waypoints.adj;
  const tmpDir = { x: 0, y: 0, z: 0 };

  function nearestNode(x, z) {
    let best = 0, bestD = 1e9;
    for (let i = 0; i < wp.length; i++) {
      const d = (wp[i][0] - x) ** 2 + (wp[i][1] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function buildBot(id, team) {
    const color = CFG.teams[team].color;
    const g = new THREE.Group();
    // Matte kit: dark fatigues, a small team-coloured shoulder patch for
    // identification only — no glowing torso, no lit visor in daylight.
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x3a3f38, roughness: 0.85, metalness: 0.1 });
    const patchMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8, metalness: 0.3 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.25, metalness: 0.6 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), torsoMat);
    torso.position.y = 1.02; torso.castShadow = true; g.add(torso);
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.04), patchMat);
    patch.position.set(-0.12, 1.18, 0.17); g.add(patch);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), darkMat);
    head.position.y = 1.56; head.castShadow = true; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.05), visorMat);
    visor.position.set(0, 1.58, 0.16); g.add(visor);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), darkMat);
    legL.position.set(-0.12, 0.36, 0); g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), darkMat);
    legR.position.set(0.12, 0.36, 0); g.add(legR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), darkMat);
    gun.position.set(0.2, 1.12, -0.3); g.add(gun);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; g.add(disc);
    scene.add(g);
    return {
      id, team, name: NAMES[team][id % 5],
      group: g, torsoMat, patchMat, visorMat, disc, legL, legR,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      yaw: 0, hp: 100, armor: 0, alive: true,
      weapon: WEAPONS.rifle, state: 'move', path: [], pathI: 0,
      target: null, lastSeen: null, lastSeenAt: -99, reactAt: 0,
      burstLeft: 0, nextShot: 0, burstPauseUntil: 0,
      holdSpot: null, planSite: 'A', isCarrier: false, isEscort: false,
      blindUntil: 0, thinkAt: 0, strafeDir: 1, strafeUntil: 0,
      smokeThrown: false, flashThrown: false, flashReadyAt: 0, plantT: 0, defuseT: 0,
      walkPhase: Math.random() * 6, planAnnounced: false, postPlantSpot: null, hasLoadout: false,
      lastNodeDist: 1e9, stuckSince: 0, detourUntil: 0, detourDir: 1,
      avertUntil: 0, avertYaw: 0, // turned away from a teammate's flash
    };
  }

  for (let i = 0; i < BOT.count; i++) {
    bots.push(buildBot(i, i < 4 ? 'wardens' : 'breachers'));
  }

  // Descriptor for the hitscan resolver: the bot as a capsule with a head zone.
  function descriptor(b) {
    return { id: `bot${b.id}`, team: b.team, alive: b.alive, pos: b.pos, radius: 0.34, height: 1.75, headBottom: 1.42 };
  }

  function spawnRound(playerTeam, round, random) {
    const enemyTeam = playerTeam === 'wardens' ? 'breachers' : 'wardens';
    for (const b of bots) {
      // Ids 0..3 are the player's teammates, 4..8 the enemy team.
      b.team = b.id < 4 ? playerTeam : enemyTeam;
      const spots = world.spawn[b.team];
      const s = spots[b.id % spots.length];
      b.pos.x = s[0] + (random() - 0.5) * 1.2;
      b.pos.y = 0; b.pos.z = s[1] + (random() - 0.5) * 1.2;
      b.yaw = b.team === 'wardens' ? 0 : Math.PI; // wardens face north, breachers south
      // A bot who survived the last round keeps his weapon and armour;
      // a dead bot re-buys. The team buys as a team: one sniper per side,
      // the rest rifles with an SMG for the entry and the escort.
      const survived = b.alive;
      b.hp = 100; b.alive = true;
      if (!survived) b.armor = random() < 0.5 ? 50 : 0;
      b.state = 'move'; b.path = []; b.pathI = 0; b.target = null;
      b.lastSeen = null; b.burstLeft = 0; b.blindUntil = 0;
      b.smokeThrown = false; b.flashThrown = false; b.flashReadyAt = 0;
      b.plantT = 0; b.defuseT = 0;
      b.isCarrier = false; b.isEscort = false; b.holdSpot = null;
      b.planAnnounced = false; b.postPlantSpot = null;
      if (!survived || !b.hasLoadout) {
        const slot = b.id % 5; // 0 carrier-side, 1 escort, 2 entry, 3 sniper, 4 rifle
        b.weapon = slot === 3 ? WEAPONS.sniper : slot === 1 || slot === 2 ? WEAPONS.smg : WEAPONS.rifle;
        b.hasLoadout = true;
      }
      // Breachers pick a site to hit; Wardens take a hold spot.
      if (b.team === 'breachers') {
        b.planSite = random() < 0.55 ? 'A' : 'B';
      } else {
        b.holdSpot = world.holdSpots.wardens[Math.floor(random() * world.holdSpots.wardens.length)];
      }
      b.group.visible = true;
      b.group.rotation.set(0, 0, 0);
      b.group.position.set(b.pos.x, 0, b.pos.z);
      b.disc.visible = true;
      b.patchMat.color.setHex(CFG.teams[b.team].color);
      b.disc.material.color.setHex(CFG.teams[b.team].color);
    }
    // One breacher carries the Demolition Charge, one escorts him. The
    // whole push follows one site plan for the round.
    const attackers = bots.filter((b) => b.team === 'breachers' && b.alive);
    if (attackers.length) {
      const site = random() < 0.55 ? 'A' : 'B';
      for (const b of attackers) b.planSite = site;
      const carrier = attackers[Math.floor(random() * attackers.length)];
      carrier.isCarrier = true;
      carrier.weapon = WEAPONS.rifle; // the carrier fights at rifle range
      const escorts = attackers.filter((b) => b !== carrier);
      if (escorts.length) {
        const escort = escorts[Math.floor(random() * escorts.length)];
        escort.isEscort = true;
        escort.weapon = WEAPONS.smg;
      }
    }
  }

  function pathTo(b, x, z) {
    const from = nearestNode(b.pos.x, b.pos.z);
    const to = nearestNode(x, z);
    const p = astar(wp, adj, from, to);
    b.path = p; b.pathI = 0;
  }

  function moveAlongPath(b, dt, speed, now) {
    if (b.pathI >= b.path.length) return true;
    const node = wp[b.path[b.pathI]];
    const dx = node[0] - b.pos.x, dz = node[1] - b.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.0) { b.pathI += 1; b.lastNodeDist = 1e9; b.stuckSince = 0; return b.pathI >= b.path.length; }
    // Stuck recovery: the capsule slide can pin a bot head-on against a
    // small post, so if we have not closed on the node for 1.5 s, sidestep
    // perpendicular to the lane for a second to slide around the blocker.
    if (dist < b.lastNodeDist - 0.05) { b.lastNodeDist = dist; b.stuckSince = now; }
    else if (now - b.stuckSince > 1.5 && now >= b.detourUntil) {
      b.detourUntil = now + 1.0;
      b.detourDir = Math.random() < 0.5 ? -1 : 1;
      b.lastNodeDist = 1e9; b.stuckSince = now;
    }
    let vx, vz;
    if (now < b.detourUntil) {
      vx = (-dz / dist) * speed * b.detourDir;
      vz = (dx / dist) * speed * b.detourDir;
    } else {
      vx = (dx / dist) * speed; vz = (dz / dist) * speed;
    }
    b.yaw = yawTo(b.pos.x, b.pos.z, node[0], node[1]);
    moveCapsule(b.pos, vx * dt, vz * dt, 0.34, 1.75, boxes);
    b.walkPhase += dt * 9;
    return false;
  }

  function canSee(b, target, smoke) {
    const dx = target.pos.x - b.pos.x, dy = (target.pos.y + 1.3) - (b.pos.y + 1.5), dz = target.pos.z - b.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > BOT.viewRange) return false;
    const ang = angleDiff(yawTo(b.pos.x, b.pos.z, target.pos.x, target.pos.z), b.yaw);
    if (Math.abs(ang) > BOT.viewHalfAngle) return false;
    return lineOfSightSmoked(b.pos.x, b.pos.y + 1.5, b.pos.z, target.pos.x, target.pos.y + 1.3, target.pos.z, boxes, smoke);
  }

  function shootAt(b, target, now, env) {
    // Aim at the chest, sometimes the head, with distance-scaled error.
    const aimY = (Math.random() < 0.28 ? 1.58 : 1.2) + (target.pos.y || 0);
    const dx = target.pos.x - b.pos.x, dy = aimY - (b.pos.y + 1.45), dz = target.pos.z - b.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const err = BOT.aimError * (dist / 10) * (target.moving ? 1.4 : 1);
    const nx = dx / dist + (Math.random() * 2 - 1) * err;
    const ny = dy / dist + (Math.random() * 2 - 1) * err * 0.7;
    const nz = dz / dist + (Math.random() * 2 - 1) * err;
    const len = Math.hypot(nx, ny, nz);
    const hit = resolveHitscan(b.pos.x, b.pos.y + 1.45, b.pos.z, nx / len, ny / len, nz / len, 90, boxes, env.targets, `bot${b.id}`);
    const muzzle = { x: b.pos.x, y: b.pos.y + 1.45, z: b.pos.z };
    fx.muzzle(muzzle);
    if (hit) {
      fx.tracer(muzzle, hit.point, 0xffb36a);
      if (hit.kind === 'wall') {
        fx.burst(hit.point, { x: -nx, y: -ny, z: -nz }, 6, 2.4);
      } else if (hit.target) {
        const falloff = 1 - (1 - b.weapon.falloff) * clamp(dist / b.weapon.range, 0, 1);
        const dmg = b.weapon.damage * falloff * (hit.kind === 'head' ? b.weapon.headMult : 1);
        env.onHit(hit.target, dmg, hit.kind === 'head', b);
      }
    } else {
      fx.tracer(muzzle, { x: muzzle.x + nx * 60, y: muzzle.y + ny * 60, z: muzzle.z + nz * 60 }, 0xffb36a);
    }
    env.onShot(b.pos, b.team, b.weapon.sound);
  }

  function step(dt, now, env) {
    const smoke = env.smoke;
    for (const b of bots) {
      if (!b.alive) continue;
      const blinded = now < b.blindUntil;
      // --- Perception, staggered so not every bot thinks on the same step ---
      if (now >= b.thinkAt) {
        b.thinkAt = now + BOT.thinkEvery + (b.id % 5) * 0.03;
        if (!blinded) {
          // Vision: the closest visible enemy wins.
          let best = null, bestD = 1e9;
          for (const e of env.enemies) {
            if (!e.alive || e.team === b.team) continue;
            const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
            if (d < bestD && canSee(b, e, smoke)) { best = e; bestD = d; }
          }
          if (best) {
            // The carrier commits to the objective: he only stops to fight
            // an enemy close enough to block the plant; farther contacts
            // are noted, not chased.
            const carrierFar = b.isCarrier && bestD > BOT.carrierEngageRange
              && (b.state === 'move' || b.state === 'plant');
            if (!carrierFar) {
              if (!b.target) b.reactAt = now + BOT.reactMin + Math.random() * (BOT.reactMax - BOT.reactMin);
              b.target = best;
              b.lastSeen = { x: best.pos.x, z: best.pos.z };
              b.lastSeenAt = now;
              if (b.state !== 'engage') b.state = 'engage';
            } else {
              b.lastSeen = { x: best.pos.x, z: best.pos.z };
              b.lastSeenAt = now;
            }
          } else if (b.target) {
            // Lost sight: keep the last-seen position for a while.
            b.target = null;
            if (now - b.lastSeenAt > BOT.memorySeconds) b.state = b.team === 'breachers' ? 'move' : 'hold';
            else b.state = 'investigate';
          }
          // Hearing: a recent shot from an enemy gives a last-seen position.
          // The carrier never turns off the objective for a sound.
          if (!b.isCarrier) {
            for (const n of env.noises) {
              if (n.team === b.team) continue;
              const d = Math.hypot(n.x - b.pos.x, n.z - b.pos.z);
              if (d < BOT.hearRange && now - b.lastSeenAt > 0.5) {
                b.lastSeen = { x: n.x, z: n.z };
                b.lastSeenAt = now;
                if (b.state !== 'engage') b.state = 'investigate';
              }
            }
          }
        }
        // The carrier plants the moment he reaches the charge pad, unless
        // an enemy he can see is close enough to stop him.
        if (b.isCarrier && env.plantSiteOpen) {
          const core = CFG.sites[b.planSite].core;
          const dCore = Math.hypot(core[0] - b.pos.x, core[2] - b.pos.z);
          const closeThreat = b.target && b.target.alive
            && Math.hypot(b.target.pos.x - b.pos.x, b.target.pos.z - b.pos.z) < 10;
          if (dCore < 2.8 && !closeThreat) b.state = 'plant';
        }
        // --- Role decisions when nothing is in front of us ---
        if (b.state !== 'engage' && !blinded) {
          if (env.plantedSite) {
            if (b.team === 'wardens') {
              // Retake: the closest living warden defuses, the rest hold
              // angles around the site and cover him.
              const core = CFG.sites[env.plantedSite].core;
              const d = Math.hypot(core[0] - b.pos.x, core[2] - b.pos.z);
              const mates = bots.filter((o) => o.alive && o.team === 'wardens');
              const closest = mates.reduce((a, o) => {
                const od = Math.hypot(core[0] - o.pos.x, core[2] - o.pos.z);
                const ad = Math.hypot(core[0] - a.pos.x, core[2] - a.pos.z);
                return od < ad ? o : a;
              }, b);
              if (b === closest) {
                if (d < 2.6) b.state = 'defuse';
                else if (b.state !== 'retake' || b.pathI >= b.path.length) { pathTo(b, core[0], core[2]); b.state = 'retake'; }
              } else if (d < 4.5) {
                b.state = 'hold';
              } else if (b.state !== 'retake' || b.pathI >= b.path.length) {
                // Stop short of the pad and hold the angle from cover.
                const gx = core[0] + (b.pos.x - core[0]) / (d || 1) * 4.5;
                const gz = core[2] + (b.pos.z - core[2]) / (d || 1) * 4.5;
                pathTo(b, gx, gz); b.state = 'retake';
              }
            } else {
              // After the plant the breachers hold the site, they do not roam.
              const spots = world.postPlantSpots[env.plantedSite];
              if (!b.postPlantSpot) b.postPlantSpot = spots[b.id % spots.length];
              const s = b.postPlantSpot;
              const d = Math.hypot(s.x - b.pos.x, s.z - b.pos.z);
              if (d < 1.5) b.state = 'hold';
              // Re-path when the path runs out: a path that ends on the
              // bot's own node must not leave him standing still in 'move'.
              else if (b.state !== 'move' || b.pathI >= b.path.length) { pathTo(b, s.x, s.z); b.state = 'move'; }
            }
          } else if (b.team === 'breachers' && b.isCarrier && env.plantSiteOpen) {
            const core = CFG.sites[b.planSite].core;
            const d = Math.hypot(core[0] - b.pos.x, core[2] - b.pos.z);
            if (d < 2.8) b.state = 'plant';
            else if (b.state !== 'move' || b.pathI >= b.path.length) { pathTo(b, core[0], core[2]); b.state = 'move'; }
            if (!b.planAnnounced && env.roundTime > 0) {
              b.planAnnounced = true;
              env.onCallout(`Pushing ${CFG.callouts[b.planSite]} — ${b.name} carries the charge`);
            }
          } else if (b.team === 'breachers' && b.isEscort && env.plantSiteOpen) {
            // The escort stays on the carrier and fights what threatens him.
            const carrier = bots.find((o) => o.alive && o.team === 'breachers' && o.isCarrier);
            if (carrier) {
              const d = Math.hypot(carrier.pos.x - b.pos.x, carrier.pos.z - b.pos.z);
              if (d > BOT.escortRange && (b.state !== 'move' || b.pathI >= b.path.length)) {
                pathTo(b, carrier.pos.x, carrier.pos.z); b.state = 'move';
              } else if (d <= BOT.escortRange) {
                b.state = 'hold';
                b.yaw = yawTo(b.pos.x, b.pos.z, carrier.pos.x, carrier.pos.z);
              }
            } else if (b.state !== 'move' || b.pathI >= b.path.length) {
              const core = CFG.sites[b.planSite].core;
              pathTo(b, core[0], core[2]); b.state = 'move';
            }
          } else if (b.team === 'breachers' && b.state === 'move') {
            // Push toward the planned site; hold the angle once there.
            const core = CFG.sites[b.planSite].core;
            const dc = Math.hypot(core[0] - b.pos.x, core[2] - b.pos.z);
            if (dc < 2.5) b.state = 'hold';
            else if (b.path.length === 0 || b.pathI >= b.path.length) pathTo(b, core[0], core[2]);
          } else if (b.team === 'wardens' && b.state === 'move') {
            // Walk to the assigned hold spot, then sit on it and scan.
            const spot = b.holdSpot || { x: 0, z: 12 };
            const ds = Math.hypot(spot.x - b.pos.x, spot.z - b.pos.z);
            if (ds < 1.5) b.state = 'hold';
            else if (b.path.length === 0 || b.pathI >= b.path.length) pathTo(b, spot.x, spot.z);
          } else if (b.state === 'investigate' && b.lastSeen) {
            const d = Math.hypot(b.lastSeen.x - b.pos.x, b.lastSeen.z - b.pos.z);
            if (d < 1.5 || now - b.lastSeenAt > BOT.memorySeconds) {
              b.state = b.team === 'breachers' ? 'move' : 'hold';
              if (b.team === 'breachers') pathTo(b, CFG.sites[b.planSite].core[0], CFG.sites[b.planSite].core[2]);
            } else if (b.pathI >= b.path.length) {
              pathTo(b, b.lastSeen.x, b.lastSeen.z);
            }
          }
        }
        // Breacher smoke: the push throws smoke at the site entry once a round.
        if (b.team === 'breachers' && !b.smokeThrown && env.roundTime > BOT.smokeAtSeconds && b.state !== 'dead') {
          const entry = b.planSite === 'A' ? [-20, -8] : [20, -8];
          const d = Math.hypot(entry[0] - b.pos.x, entry[1] - b.pos.z);
          if (d < 26) {
            b.smokeThrown = true;
            env.throwGrenade('smoke', { x: b.pos.x, y: b.pos.y + 1.4, z: b.pos.z }, { x: entry[0], y: 1, z: entry[1] }, b.team);
          }
        }
        // Breacher flash: before entering a chokepoint, flash the entry —
        // but never with a teammate standing in the blast, and never more
        // often than the cooldown allows. The push follows right after.
        if (b.team === 'breachers' && !env.plantedSite && now >= b.flashReadyAt && b.state === 'move') {
          const entry = b.planSite === 'A' ? [-20, -8] : [20, -8];
          const d = Math.hypot(entry[0] - b.pos.x, entry[1] - b.pos.z);
          if (d < BOT.flashEntryRange && d > 2) {
            const mateNear = bots.some((o) => o.alive && o.team === b.team && o !== b
              && Math.hypot(entry[0] - o.pos.x, entry[1] - o.pos.z) < 6);
            if (!mateNear) {
              b.flashReadyAt = now + BOT.flashCooldown;
              b.flashThrown = true;
              env.throwGrenade('flash', { x: b.pos.x, y: b.pos.y + 1.4, z: b.pos.z }, { x: entry[0], y: 1.6, z: entry[1] }, b.team);
              env.onCallout(`Flashing ${CFG.callouts[b.planSite]} entry`);
            }
          }
        }
      }

      // --- Movement ---
      const averting = now < b.avertUntil;
      if (averting) {
        // A teammate called a flash: stand still, facing away from the pop,
        // until it goes off. Nobody on the push blinds himself.
        b.yaw = b.avertYaw;
      } else if (blinded) {
        // Blinded bots shuffle slowly and never shoot.
        b.yaw += dt * 0.8;
        moveCapsule(b.pos, Math.sin(b.yaw) * 0.8 * dt, Math.cos(b.yaw) * 0.8 * dt, 0.34, 1.75, boxes);
      } else if (b.state === 'engage' && b.target && now >= b.reactAt) {
        // Strafe sideways while engaging; flip direction every second or so.
        if (now > b.strafeUntil) { b.strafeDir *= -1; b.strafeUntil = now + 0.7 + Math.random() * 0.6; }
        const tyaw = yawTo(b.pos.x, b.pos.z, b.target.pos.x, b.target.pos.z);
        b.yaw = tyaw;
        const sx = Math.cos(tyaw) * b.strafeDir * 2.1, sz = -Math.sin(tyaw) * b.strafeDir * 2.1;
        moveCapsule(b.pos, sx * dt, sz * dt, 0.34, 1.75, boxes);
      } else if (b.state === 'move' || b.state === 'retake' || b.state === 'investigate') {
        moveAlongPath(b, dt, BOT.moveSpeed, now);
      } else if (b.state === 'hold') {
        // Scan: slow yaw sweep across the lane.
        b.yaw += Math.sin(now * 0.5 + b.id) * dt * 0.35;
      } else if (b.state === 'plant' || b.state === 'defuse') {
        // Standing still at the core, facing it.
        const site = b.state === 'defuse' ? env.plantedSite : b.planSite;
        const c = CFG.sites[site].core;
        b.yaw = yawTo(b.pos.x, b.pos.z, c[0], c[2]);
      }

      // --- Plant / defuse progress ---
      if (b.state === 'plant') {
        b.plantT += dt;
        env.onPlantProgress(b, b.plantT / CFG.round.plantSeconds);
        if (b.plantT >= CFG.round.plantSeconds) { b.plantT = 0; b.state = 'move'; env.onPlant(b.planSite, b); }
      } else if (b.state === 'defuse') {
        b.defuseT += dt;
        env.onDefuseProgress(b, b.defuseT / CFG.round.defuseSeconds);
        if (b.defuseT >= CFG.round.defuseSeconds) { b.defuseT = 0; b.state = 'hold'; env.onDefuse(env.plantedSite, b); }
      } else {
        // Leaving plant/defuse restarts the channel from zero.
        b.plantT = 0; b.defuseT = 0;
      }

      // --- Shooting: bursts with pauses, only after the reaction time ---
      // Averting bots hold their fire: they are facing away from the flash.
      if (b.state === 'engage' && b.target && b.target.alive && now >= b.reactAt && !blinded && !averting) {
        if (b.burstLeft <= 0 && now >= b.burstPauseUntil) {
          b.burstLeft = BOT.burstMin + Math.floor(Math.random() * (BOT.burstMax - BOT.burstMin + 1));
          b.nextShot = now;
        }
        if (b.burstLeft > 0 && now >= b.nextShot) {
          shootAt(b, b.target, now, env);
          b.burstLeft -= 1;
          b.nextShot = now + 60 / b.weapon.rpm;
          if (b.burstLeft <= 0) b.burstPauseUntil = now + BOT.burstPause * (0.7 + Math.random() * 0.6);
        }
      }

      // --- Sync the visual group ---
      b.group.position.set(b.pos.x, b.pos.y, b.pos.z);
      b.group.rotation.y = b.yaw;
      // Map bounds: the capsule slide can eject a bot to the wrong side of
      // a thin wall at a corner; the clamp pulls him back inside at once
      // instead of leaving him lost outside the map.
      b.pos.x = clamp(b.pos.x, -CFG.map.halfW + 0.6, CFG.map.halfW - 0.6);
      b.pos.z = clamp(b.pos.z, -CFG.map.halfD + 0.6, CFG.map.halfD - 0.6);
      // Walk cycle: legs swing; standing still they settle.
      const moving = b.state === 'move' || b.state === 'retake' || b.state === 'investigate';
      const swing = moving ? Math.sin(b.walkPhase) * 0.4 : 0;
      b.legL.rotation.x = swing;
      b.legR.rotation.x = -swing;
    }
  }

  function damage(bot, amount, head) {
    if (!bot.alive) return false;
    let dmg = amount;
    if (bot.armor > 0 && !head) {
      const absorbed = Math.min(bot.armor, dmg * 0.5);
      bot.armor -= absorbed; dmg -= absorbed;
    }
    bot.hp -= dmg;
    if (bot.hp <= 0) {
      bot.hp = 0; bot.alive = false; bot.state = 'dead';
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      bot.disc.visible = false;
      // The charge never dies with its carrier: the next living breacher
      // picks it up at once and the team is told.
      if (bot.isCarrier) {
        bot.isCarrier = false;
        const next = bots.find((o) => o.alive && o.team === 'breachers' && o !== bot);
        if (next) {
          next.isCarrier = true;
          next.planSite = bot.planSite;
          carrierDropName = next.name;
        } else {
          carrierDropName = null;
        }
      }
      return true;
    }
    return false;
  }

  function aliveCount(team) { return bots.filter((b) => b.alive && b.team === team).length; }

  // The name of the bot who picked up a dropped charge, if one died since
  // the last read; main.js turns it into a callout. Null clears the flag.
  let carrierDropName = null;
  function takeCarrierDrop() {
    const name = carrierDropName;
    carrierDropName = null;
    return name;
  }

  function reset() {
    for (const b of bots) {
      b.group.visible = true;
      b.group.rotation.set(0, 0, 0);
      b.disc.visible = true;
    }
  }

  return { bots, descriptor, spawnRound, step, damage, aliveCount, reset, takeCarrierDrop };
}
