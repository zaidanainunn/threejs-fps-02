// Weapons: the player's loadout, fire/reload timing, recoil and the
// low-poly viewmodel that sits on the camera. Grenades live here too:
// a thrown canister arcs, bounces once, then becomes a smoke cloud or a
// flash that blinds anyone looking at it.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './config.js';

// The grenade pool is shared: the player throws from it, and so do bots.
// A thrown canister arcs, bounces once, then becomes a smoke cloud or a
// flash that blinds anyone looking at it.
export function createGrenadePool(scene) {
  const live = []; // {kind, mesh, vel, bounces, timer, armed}
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x4a5548, roughness: 0.6, metalness: 0.3 });
  const flashMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.3, metalness: 0.6, emissive: 0x888888, emissiveIntensity: 0.4 });
  function throwAt(kind, origin, dir) {
    const mesh = new THREE.Mesh(grenadeGeo, kind === 'smoke' ? smokeMat : flashMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    // dir is a plain {x,y,z} unit vector from the thrower; the arc is a
    // fixed 13 m/s throw with 4.5 m/s of loft.
    live.push({
      kind, mesh,
      vel: new THREE.Vector3(dir.x * 13, dir.y * 13 + 4.5, dir.z * 13),
      bounces: 0, timer: 0, armed: false,
    });
  }
  function step(dt, onSmoke, onFlash) {
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i];
      g.timer += dt;
      g.vel.y -= 14 * dt;
      const p = g.mesh.position;
      p.x += g.vel.x * dt; p.y += g.vel.y * dt; p.z += g.vel.z * dt;
      if (p.y < 0.09) {
        p.y = 0.09;
        if (Math.abs(g.vel.y) > 2 && g.bounces < 2) { g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; g.bounces += 1; }
        else { g.vel.set(0, 0, 0); }
      }
      // Detonate: smoke blooms after 0.9 s on the ground, flash pops 1.4 s after the throw.
      if (!g.armed && ((g.kind === 'smoke' && g.timer > 0.9) || (g.kind === 'flash' && g.timer > 1.4))) {
        g.armed = true;
        if (g.kind === 'smoke') onSmoke(p.x, 1.4, p.z);
        else onFlash(p.x, p.y + 0.4, p.z);
        scene.remove(g.mesh);
        live.splice(i, 1);
      }
    }
  }
  function reset() {
    for (const g of live) scene.remove(g.mesh);
    live.length = 0;
  }
  return { throwAt, step, reset };
}

export function createWeapons(camera, scene, fx, grenades) {
  // The viewmodel: boxes only, parented to the camera so it never clips.
  // A conventional rifle silhouette — receiver, barrel, iron sights front
  // and rear, magazine, pistol grip, foregrip and stock — mid-grey matte
  // metal with a polymer grip, no glow, no ornament. The metal is light
  // enough to read against the bright ground, and a small fill light
  // parented to the camera keeps it from going black in shadow.
  const vm = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.45, metalness: 0.75 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.8, metalness: 0.2 });
  const sightMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4, metalness: 0.8 });
  const vmLight = new THREE.PointLight(0xfff2dd, 1.6, 2.5, 1.5);
  vmLight.position.set(0.2, 0.1, -0.2);
  camera.add(vmLight);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.62), gunMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), gunMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), gripMat);
  grip.position.set(0, -0.11, 0.16); grip.rotation.x = 0.35;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), gripMat);
  mag.position.set(0, -0.12, -0.05); mag.rotation.x = -0.12;
  const foreGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.07), gripMat);
  foreGrip.position.set(0, -0.1, -0.24); foreGrip.rotation.x = 0.15;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.16), gripMat);
  stock.position.set(0, -0.01, 0.36);
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), sightMat);
  rearSight.position.set(0, 0.075, 0.12);
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.015), sightMat);
  frontSight.position.set(0, 0.08, -0.34);
  const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  flashQuad.position.set(0, 0.02, -0.6);
  vm.add(body, barrel, grip, mag, foreGrip, stock, rearSight, frontSight, flashQuad);
  vm.position.set(0.24, -0.26, -0.5);
  camera.add(vm);

  const state = {
    current: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    reloading: false, reloadEnd: 0, lastShot: -10, bloom: 0, kick: 0, bobPhase: 0,
    owned: { pistol: true }, // weapon ids the player owns this match
    ammo: { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
    grenades: { smoke: 0, flash: 0 },
    armor: 0, helmet: false, kit: false,
  };
  const def = () => WEAPONS[state.current];

  function buyWeapon(id) {
    state.owned[id] = true;
    state.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
  function switchTo(id) {
    if (!state.owned[id] || state.current === id) return false;
    state.ammo[state.current] = { mag: state.mag, reserve: state.reserve };
    state.current = id;
    state.mag = state.ammo[id].mag; state.reserve = state.ammo[id].reserve;
    state.reloading = false; state.kick = 0.4;
    return true;
  }
  function canFire(now) {
    const w = def();
    return !state.reloading && state.mag > 0 && now - state.lastShot >= 60 / w.rpm;
  }
  function fire(now) {
    if (state.reloading) return 'reloading';
    if (state.mag <= 0) return 'dry';
    if (now - state.lastShot < 60 / def().rpm) return 'wait';
    state.mag -= 1;
    state.lastShot = now;
    state.bloom = Math.min(1, state.bloom + (def().kind === 'sniper' ? 0.9 : 0.22));
    state.kick = Math.min(1.2, state.kick + def().kick * 0.55);
    flashQuad.material.opacity = 0.6;
    setTimeout(() => { flashQuad.material.opacity = 0; }, 45);
    return 'fired';
  }
  function reload(now) {
    const w = def();
    if (state.reloading || state.mag === w.mag || state.reserve <= 0) return false;
    state.reloading = true;
    state.reloadEnd = now + w.reload;
    return true;
  }
  function finishReload() {
    const w = def();
    const need = w.mag - state.mag;
    const take = Math.min(need, state.reserve);
    state.mag += take; state.reserve -= take;
    state.reloading = false;
    state.ammo[state.current] = { mag: state.mag, reserve: state.reserve };
  }
  function spread(moveSpeed, airborne, crouched) {
    const w = def();
    let s = w.spread + state.bloom * 0.02;
    s += (moveSpeed / 6.4) * w.moveSpread;
    if (airborne) s += w.airSpread;
    if (crouched) s *= 0.7;
    return s;
  }

  function throwGrenade(kind, origin, dir) {
    if (state.grenades[kind] <= 0) return false;
    state.grenades[kind] -= 1;
    grenades.throwAt(kind, origin, dir);
    return true;
  }

  function step(dt, now, moveSpeed) {
    if (state.reloading && now >= state.reloadEnd) finishReload();
    state.bloom = Math.max(0, state.bloom - dt * 1.6);
    state.kick = Math.max(0, state.kick - dt * 3.2);
    // Viewmodel bob and kick: the gun dips on reload and kicks back on fire.
    state.bobPhase += dt * moveSpeed * 1.6;
    const bob = Math.min(1, moveSpeed / 6) * 0.012;
    const reloadDip = state.reloading ? Math.sin(((now - (state.reloadEnd - def().reload)) / def().reload) * Math.PI) * 0.16 : 0;
    vm.position.set(
      0.24 + Math.sin(state.bobPhase * 2) * bob,
      -0.26 + Math.abs(Math.cos(state.bobPhase * 2)) * bob - reloadDip,
      -0.5 + state.kick * 0.09,
    );
    vm.rotation.x = state.kick * 0.16 + (state.reloading ? -0.5 * Math.sin(((now - (state.reloadEnd - def().reload)) / def().reload) * Math.PI) : 0);
  }

  return {
    state, def, buyWeapon, switchTo, canFire, fire, reload, spread, throwGrenade, step,
    weaponIds: WEAPON_ORDER,
    reset() {
      state.current = 'pistol'; state.owned = { pistol: true };
      state.ammo = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
      state.mag = WEAPONS.pistol.mag; state.reserve = WEAPONS.pistol.reserve;
      state.reloading = false; state.bloom = 0; state.kick = 0;
      state.grenades = { smoke: 0, flash: 0 }; state.armor = 0; state.helmet = false; state.kit = false;
    },
  };
}
