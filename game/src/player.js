// The player: a capsule with acceleration, friction, crouch, jump and
// gravity, sliding against the map's AABBs. Movement punishes accuracy —
// the weapon spread grows with speed — so stopping to aim pays.
import { CFG } from './config.js';
import { clamp, damp } from './utils.js';
import { moveCapsule } from './collision.js';

export function createPlayer(colliders) {
  const state = {
    pos: { x: 0, y: 0, z: 24 }, // feet
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    hp: 100, armor: 0, helmet: false,
    alive: true, onGround: true, crouched: false,
    recoilPitch: 0, recoilYaw: 0,
    lastDamageDir: 0, lastDamageAt: -10,
  };

  function eyeHeight() { return state.crouched ? 1.15 : CFG.eye; }
  function speed() { return Math.hypot(state.vel.x, state.vel.z); }

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch = clamp(state.pitch - dy * 0.0021, -1.45, 1.45);
  }
  function addRecoil(pitch, yaw) {
    state.recoilPitch += pitch;
    state.recoilYaw += yaw;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    // Recoil recovery: the kick eases back toward zero.
    state.recoilPitch = damp(state.recoilPitch, 0, 9, dt);
    state.recoilYaw = damp(state.recoilYaw, 0, 9, dt);
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    state.crouched = keys.has('ControlLeft') || keys.has('KeyC');
    const wishSpeed = state.crouched ? CFG.crouchSpeed : (keys.has('ShiftLeft') ? CFG.walkSpeed : CFG.runSpeed);
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    // Forward is -Z rotated by yaw; right is +X rotated by yaw.
    let wx = (-sin * fwd + cos * strafe);
    let wz = (-cos * fwd - sin * strafe);
    const wl = Math.hypot(wx, wz);
    if (wl > 0.001) { wx /= wl; wz /= wl; }
    const accel = state.onGround ? CFG.accel : CFG.airAccel;
    state.vel.x = damp(state.vel.x, wx * wishSpeed, accel / wishSpeed, dt);
    state.vel.z = damp(state.vel.z, wz * wishSpeed, accel / wishSpeed, dt);
    // Friction when no input: the slide stops quickly, the strafe stops faster.
    if (wl < 0.001 && state.onGround) {
      const f = Math.max(0, 1 - CFG.friction * dt);
      state.vel.x *= f; state.vel.z *= f;
    }
    if (keys.has('Space') && state.onGround) {
      state.vel.y = CFG.jumpSpeed;
      state.onGround = false;
    }
    state.vel.y -= CFG.gravity * dt;
    const height = state.crouched ? 1.25 : CFG.playerHeight;
    moveCapsule(state.pos, state.vel.x * dt, state.vel.z * dt, CFG.playerRadius, height, colliders);
    state.pos.y += state.vel.y * dt;
    if (state.pos.y <= 0) { state.pos.y = 0; state.vel.y = 0; state.onGround = true; }
    // Map bounds, in case a collider gap ever lets the capsule out.
    state.pos.x = clamp(state.pos.x, -CFG.map.halfW + 0.6, CFG.map.halfW - 0.6);
    state.pos.z = clamp(state.pos.z, -CFG.map.halfD + 0.6, CFG.map.halfD - 0.6);
  }

  // Damage: armour absorbs half of body damage; the head is unarmoured unless
  // a helmet is worn. Returns true when this hit killed the player.
  function damage(amount, head, fromYaw) {
    if (!state.alive) return false;
    let dmg = amount;
    if (state.armor > 0 && !head) {
      const absorbed = Math.min(state.armor, dmg * 0.5);
      state.armor -= absorbed;
      dmg -= absorbed;
    } else if (head && state.helmet) {
      dmg *= 0.5;
    }
    state.hp -= dmg;
    state.lastDamageDir = fromYaw;
    if (state.hp <= 0) { state.hp = 0; state.alive = false; return true; }
    return false;
  }

  function reset(x, z, yaw) {
    state.pos.x = x; state.pos.z = z; state.pos.y = 0;
    state.vel.x = 0; state.vel.y = 0; state.vel.z = 0;
    state.yaw = yaw; state.pitch = 0;
    state.hp = 100; state.armor = 0; state.helmet = false;
    state.alive = true; state.crouched = false;
    state.recoilPitch = 0; state.recoilYaw = 0;
  }

  return {
    state, look, addRecoil, step, damage, reset, eyeHeight, speed,
    eyePos(out) {
      out.x = state.pos.x; out.y = state.pos.y + eyeHeight(); out.z = state.pos.z;
      return out;
    },
  };
}
