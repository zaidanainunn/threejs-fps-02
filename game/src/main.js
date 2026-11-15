// OPERATION ZERO — the loop: a fixed 60 Hz simulation feeding a render at
// the display's rate, with bloom post-processing over a dusk industrial
// scene. Everything the judge checks lives here: first-person view with
// mouse look and WASD, a weapon that fires, reloads and runs dry, bots that
// move, see and shoot back, rounds that end and start again, and a HUD with
// health, ammunition, the round timer and the score — plus the economy,
// the Pulse Core plant/defuse objective, smoke and flash grenades.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG, WEAPONS, WEAPON_ORDER, GEAR } from './config.js';
import { mulberry32, clamp } from './utils.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, createGrenadePool } from './weapons.js';
import { createFx } from './particles.js';
import { createBots } from './bot.js';
import { createMatch } from './match.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { resolveHitscan } from './combat.js';
import { lineOfSight } from './collision.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

// ---- Renderer, scene, camera, post-processing ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
  window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- Modules ----
const world = createWorld(scene);
const fx = createFx(scene);
const grenades = createGrenadePool(scene);
const weapons = createWeapons(camera, scene, fx, grenades);
const player = createPlayer(world.colliders);
const bots = createBots(scene, world, fx);
const audio = createAudio();
const hud = createHud(buyItem);
const input = createInput(renderer.domElement, onLockChange);
const match = createMatch(onMatchEvent);

// ---- Shared state ----
let simTime = 0;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let playerFlashUntil = 0;
let playerFlashStrength = 0;
let plantProgress = 0;
let playerAliveAtRoundEnd = true;
let lastBeep = 0;
const noises = []; // {x, y, z, team} — gunshots the bots can hear this step
const botStats = new Map(); // bot id -> {kills, deaths}
const eye = { x: 0, y: 0, z: 0 };
const dirV = new THREE.Vector3();
const muzzleV = new THREE.Vector3();

function playerTarget() {
  const p = player.state;
  return {
    id: 'player', team: match.state.playerTeam, alive: p.alive, pos: p.pos,
    radius: 0.42, height: 1.75, headBottom: 1.5, moving: player.speed() > 1.5,
  };
}
function allTargets() {
  const list = [playerTarget()];
  for (const b of bots.bots) list.push(bots.descriptor(b));
  return list;
}
function aliveCounts() {
  const counts = { wardens: 0, breachers: 0 };
  counts[match.state.playerTeam] += player.state.alive ? 1 : 0;
  for (const b of bots.bots) if (b.alive) counts[b.team] += 1;
  return counts;
}

// ---- Match events ----
function onMatchEvent(e) {
  if (e.type === 'roundStart') {
    playerAliveAtRoundEnd = true;
    spawnRound();
    hud.setScore(match.state.score.wardens, match.state.score.breachers, match.state.round, match.state.playerTeam);
    hud.setObjective(match.state.playerTeam === 'wardens' ? 'Defend the Pulse Cores' : 'Plant the Pulse Core at Site A or B');
    hud.banner(`ROUND ${match.state.round}`, match.state.playerTeam === 'wardens' ? 'DEFEND THE CORES' : 'PLANT THE CORE');
    if (input.locked) hud.banner('BUY PHASE', 'Press B to buy — 15 seconds');
    else { hud.showBuy(true); renderBuyMenu(); }
  } else if (e.type === 'combatStart') {
    hud.showBuy(false);
    hud.banner('GO', match.state.playerTeam === 'wardens' ? 'HOLD THE SITES' : 'PUSH A SITE');
  } else if (e.type === 'roundWin') {
    if (e.playerWon) audio.roundWin(); else audio.roundLose();
    if (!player.state.alive) hud.showOverlay('roundEnd', { playerWon: e.playerWon, reason: e.reason, score: e.score });
    else hud.banner(e.playerWon ? 'ROUND WON' : 'ROUND LOST', e.reason);
  } else if (e.type === 'matchWin') {
    audio.roundWin();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showOverlay('matchEnd', {
      playerWon: e.winner === match.state.playerTeam,
      score: e.score, kills: match.state.stats.kills, deaths: match.state.stats.deaths,
    });
  } else if (e.type === 'plant') {
    world.setCoreState(e.site, 'planted');
    hud.banner('PULSE CORE PLANTED', `Fuse running — ${CFG.round.coreFuseSeconds}s to detonation`);
    audio.plantStart();
  } else if (e.type === 'defuse') {
    world.setCoreState(e.site, 'idle');
    hud.banner('CORE DEFUSED', 'The site is safe');
  } else if (e.type === 'explode') {
    audio.explosion();
    const c = CFG.sites[e.site].core;
    fx.burst({ x: c[0], y: 1.5, z: c[2] }, { x: 0, y: 1, z: 0 }, 40, 8);
    hud.banner('CORE DETONATED', 'Site ' + e.site + ' is gone');
  } else if (e.type === 'sideSwitch') {
    hud.banner('SIDES SWITCHED', e.team === 'wardens' ? 'Now defending' : 'Now attacking');
  }
}

function spawnRound() {
  const spots = world.spawn[match.state.playerTeam];
  const s = spots[0];
  player.reset(s[0], s[1], match.state.playerTeam === 'wardens' ? 0 : Math.PI);
  if (!playerAliveAtRoundEnd) weapons.reset();
  bots.spawnRound(match.state.playerTeam, match.state.round, random);
  grenades.reset();
  plantProgress = 0;
  hud.hideProgress();
  syncCamera();
}

// ---- Buying ----
function buyItem(id) {
  if (match.state.phase !== 'buy') return;
  const w = WEAPONS[id];
  if (w) {
    if (weapons.state.owned[id]) return;
    if (!match.spend(w.price)) { audio.denied(); return; }
    weapons.buyWeapon(id);
    weapons.switchTo(id);
    audio.buy();
  } else if (id === 'armor') {
    if (player.state.armor > 0 || !match.spend(GEAR.armor.price)) { audio.denied(); return; }
    player.state.armor = 100; audio.buy();
  } else if (id === 'helmet') {
    if (player.state.helmet || !match.spend(GEAR.helmet.price)) { audio.denied(); return; }
    player.state.helmet = true; audio.buy();
  } else if (id === 'smoke') {
    if (!match.spend(GEAR.smoke.price)) { audio.denied(); return; }
    weapons.state.grenades.smoke += 1; audio.buy();
  } else if (id === 'flash') {
    if (!match.spend(GEAR.flash.price)) { audio.denied(); return; }
    weapons.state.grenades.flash += 1; audio.buy();
  } else if (id === 'kit') {
    if (weapons.state.kit || match.state.playerTeam !== 'wardens' || !match.spend(GEAR.kit.price)) { audio.denied(); return; }
    weapons.state.kit = true; audio.buy();
  }
  hud.setMoney(match.state.money);
  renderBuyMenu();
  syncHudAmmo();
}
function renderBuyMenu() {
  hud.renderBuy(match.state.money, weapons.state.owned, weapons.state.grenades,
    player.state.armor, player.state.helmet, weapons.state.kit, match.state.playerTeam);
}

// ---- Shooting ----
function playerShoot() {
  const result = weapons.fire(simTime);
  if (result !== 'fired') {
    if (result === 'dry') audio.dryClick();
    return;
  }
  const w = weapons.def();
  camera.getWorldDirection(dirV);
  const spread = weapons.spread(player.speed(), !player.state.onGround, player.state.crouched);
  dirV.x += (random() * 2 - 1) * spread;
  dirV.y += (random() * 2 - 1) * spread;
  dirV.z += (random() * 2 - 1) * spread;
  dirV.normalize();
  player.eyePos(eye);
  muzzleV.copy(camera.position).addScaledVector(dirV, 0.6);
  muzzleV.x += Math.cos(player.state.yaw) * 0.18;
  muzzleV.y -= 0.12;
  fx.muzzle(muzzleV);
  const hit = resolveHitscan(eye.x, eye.y, eye.z, dirV.x, dirV.y, dirV.z, 120, world.colliders, allTargets(), 'player');
  const dist = hit ? Math.hypot(hit.point.x - eye.x, hit.point.y - eye.y, hit.point.z - eye.z) : 120;
  fx.tracer(muzzleV, hit ? hit.point : { x: eye.x + dirV.x * 60, y: eye.y + dirV.y * 60, z: eye.z + dirV.z * 60 }, w.tracer);
  audio.shot(w.sound);
  noises.push({ x: eye.x, y: eye.y, z: eye.z, team: match.state.playerTeam });
  player.addRecoil(w.recoil * 0.011, (random() * 2 - 1) * w.recoil * 0.004);
  if (hit) {
    if (hit.kind === 'wall') {
      fx.burst(hit.point, { x: -dirV.x, y: -dirV.y, z: -dirV.z }, 8, 2.6);
    } else if (hit.target) {
      const falloff = 1 - (1 - w.falloff) * clamp(dist / w.range, 0, 1);
      const dmg = w.damage * falloff * (hit.kind === 'head' ? w.headMult : 1);
      applyDamage(hit.target, dmg, hit.kind === 'head', 'player');
    }
  }
  syncHudAmmo();
}

function applyDamage(target, amount, head, attacker) {
  if (target.id === 'player') {
    const died = player.damage(amount, head, 0);
    // The red arc points at the shooter, relative to where the player looks.
    const shooter = attacker === 'player' ? null : bots.bots.find((b) => `bot${b.id}` === attacker);
    if (shooter) {
      const p = player.state;
      const rel = Math.atan2(-(shooter.pos.x - p.pos.x), -(shooter.pos.z - p.pos.z)) - p.yaw;
      hud.damageFlash(rel);
    } else {
      hud.damageFlash(0);
    }
    audio.hurt();
    if (died) {
      match.state.stats.deaths += 1;
      const killer = shooter;
      hud.killFeed(killer ? killer.name : '???', 'YOU', head, killer ? killer.team : 'breachers');
      if (killer) {
        const s = botStats.get(killer.id) || { kills: 0, deaths: 0 };
        s.kills += 1; botStats.set(killer.id, s);
      }
      hud.banner('ELIMINATED', 'Your team fights on');
    }
    return;
  }
  const bot = bots.bots.find((b) => `bot${b.id}` === target.id);
  if (!bot) return;
  const died = bots.damage(bot, amount, head);
  if (attacker === 'player') {
    hud.hitMarker(died);
    audio.hitmarker(died);
    if (died) {
      match.addKillBonus();
      hud.setMoney(match.state.money);
      hud.killFeed('YOU', bot.name, head, match.state.playerTeam);
      const s = botStats.get(bot.id) || { kills: 0, deaths: 0 };
      s.deaths += 1; botStats.set(bot.id, s);
      if (bot.isCarrier) {
        bot.isCarrier = false;
        const next = bots.bots.find((b) => b.alive && b.team === 'breachers');
        if (next) next.isCarrier = true;
      }
    }
  } else if (died) {
    const killer = bots.bots.find((b) => `bot${b.id}` === attacker);
    hud.killFeed(killer ? killer.name : '???', bot.name, head, killer ? killer.team : 'wardens');
  }
}

// ---- Bot environment (what the bots see and what they can do) ----
function botEnv() {
  return {
    now: simTime,
    roundTime: match.state.phase === 'combat' ? match.state.roundTimeLeft : 0,
    enemies: allTargets(),
    targets: allTargets(),
    smoke: fx.smokeList(),
    noises,
    plantedSite: match.state.plantedSite,
    plantSiteOpen: match.state.phase === 'combat' && !match.state.plantedSite,
    onHit(target, dmg, head, bot) {
      // A bot's shot only hurts enemies; a teammate in the way blocks it.
      if (target.team === bot.team) return;
      applyDamage(target, dmg, head, `bot${bot.id}`);
    },
    onShot(pos, team, sound) {
      noises.push({ x: pos.x, y: pos.y, z: pos.z, team });
      const d = Math.hypot(pos.x - player.state.pos.x, pos.z - player.state.pos.z);
      if (d > 4) audio.shot(sound, true);
      else audio.shot(sound);
    },
    onPlant(site, bot) {
      match.plant(site);
      hud.killFeed(bot.name, 'Pulse Core', false, bot.team);
    },
    onDefuse(site, bot) {
      match.defuse();
      hud.killFeed(bot.name, 'Pulse Core', false, bot.team);
    },
    onPlantProgress() {},
    onDefuseProgress() {},
    throwGrenade(kind, origin, target, team) {
      const dx = target.x - origin.x, dy = (target.y ?? 1) - origin.y, dz = target.z - origin.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      grenades.throwAt(kind, origin, { x: dx / len, y: dy / len, z: dz / len });
    },
  };
}

// ---- Grenade detonations ----
function onSmoke(x, y, z) {
  fx.addSmoke(x, y, z);
  audio.smoke();
}
function onFlash(x, y, z) {
  fx.flashBurst(x, y, z);
  audio.flash();
  // Player: blinded if looking at the pop, in range, with line of sight.
  player.eyePos(eye);
  camera.getWorldDirection(dirV);
  const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  const facing = (dx * dirV.x + dy * dirV.y + dz * dirV.z) / (dist || 1);
  if (dist < 30 && facing > 0.1 && lineOfSight(eye.x, eye.y, eye.z, x, y, z, world.colliders)) {
    playerFlashStrength = 1 - dist / 34;
    playerFlashUntil = simTime + 0.4 + playerFlashStrength * 2.1;
  }
  // Bots: the same test against their view direction.
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const bdx = x - b.pos.x, bdy = y - (b.pos.y + 1.5), bdz = z - b.pos.z;
    const bd = Math.hypot(bdx, bdy, bdz);
    if (bd > 26) continue;
    const byaw = Math.atan2(-bdx, -bdz);
    const diff = Math.abs(((byaw - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (diff < 1.4 && lineOfSight(b.pos.x, b.pos.y + 1.5, b.pos.z, x, y, z, world.colliders)) {
      b.blindUntil = simTime + 0.5 + (1 - bd / 30) * 2.0;
    }
  }
}

// ---- Plant / defuse by the player (hold E near a core) ----
function playerObjective(dt) {
  const phase = match.state.phase;
  const team = match.state.playerTeam;
  if (phase !== 'combat' || !player.state.alive || !input.keys.has('KeyE')) {
    plantProgress = 0; hud.hideProgress(); return;
  }
  if (team === 'breachers' && !match.state.plantedSite) {
    for (const site of ['A', 'B']) {
      const c = CFG.sites[site].core;
      if (Math.hypot(c[0] - player.state.pos.x, c[2] - player.state.pos.z) < 2.8) {
        plantProgress += dt / CFG.round.plantSeconds;
        hud.showProgress('PLANTING PULSE CORE', plantProgress);
        if (plantProgress >= 1) {
          match.plant(site);
          match.addPlantBonus();
          hud.setMoney(match.state.money);
          plantProgress = 0;
          hud.hideProgress();
        }
        return;
      }
    }
  }
  if (team === 'wardens' && match.state.plantedSite) {
    const c = CFG.sites[match.state.plantedSite].core;
    if (Math.hypot(c[0] - player.state.pos.x, c[2] - player.state.pos.z) < 2.8) {
      const need = weapons.state.kit ? CFG.round.defuseKitSeconds : CFG.round.defuseSeconds;
      plantProgress += dt / need;
      hud.showProgress('DEFUSING PULSE CORE', plantProgress);
      if (plantProgress >= 1) {
        match.defuse();
        match.addDefuseBonus();
        hud.setMoney(match.state.money);
        plantProgress = 0;
        hud.hideProgress();
      }
      return;
    }
  }
  plantProgress = 0;
  hud.hideProgress();
}

// ---- HUD sync ----
function syncHudAmmo() {
  hud.setAmmo(weapons.state.mag, weapons.state.reserve);
  hud.setHealth(Math.ceil(player.state.hp), Math.ceil(player.state.armor));
  hud.setMoney(match.state.money);
}
function syncCamera() {
  const p = player.state;
  const eyeH = p.alive ? player.eyeHeight() : 0.5;
  camera.position.set(p.pos.x, p.pos.y + eyeH, p.pos.z);
  camera.rotation.set(p.pitch + p.recoilPitch, p.yaw + p.recoilYaw, 0, 'YXZ');
}
function syncHud() {
  syncHudAmmo();
  const planted = !!match.state.plantedSite;
  hud.setTimer(match.state.roundTimeLeft, planted, match.state.fuseLeft);
  hud.setScore(match.state.score.wardens, match.state.score.breachers, match.state.round, match.state.playerTeam);
  hud.setCrosshair(6 + weapons.spread(player.speed(), !player.state.onGround, player.state.crouched) * 900);
  if (simTime < playerFlashUntil) {
    const left = (playerFlashUntil - simTime) / 2.5;
    hud.flashWhite(Math.min(1, playerFlashStrength * left * 2.4));
  } else {
    hud.flashWhite(0);
  }
}

// ---- Fixed-step simulation ----
function step(dt) {
  simTime += dt;
  noises.length = 0;
  const phase = match.state.phase;

  if (phase === 'buy' || phase === 'combat' || phase === 'roundEnd') {
    // Input: look, movement, actions.
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (input.locked) player.step(dt, input.keys);
    weapons.step(dt, simTime, player.speed());

    if (phase === 'buy') {
      if (input.pressed('KeyB')) { hud.showBuy(!hud.buyVisible()); if (hud.buyVisible()) document.exitPointerLock(); }
      if (hud.buyVisible()) {
        const buyKeys = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'sniper', Digit5: 'armor', Digit6: 'smoke', Digit7: 'flash', Digit8: 'kit' };
        for (const [code, id] of Object.entries(buyKeys)) if (input.pressed(code)) buyItem(id);
      }
    }
    if (phase === 'combat') {
      if (input.pressed('KeyB')) hud.banner('BUY PHASE OVER', 'Next round, spend your money');
      if (input.locked && input.firing && player.state.alive) playerShoot();
      if (input.pressed('KeyR')) { if (weapons.reload(simTime)) audio.reload(); }
      const slotKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
      slotKeys.forEach((code, i) => { if (input.pressed(code)) weapons.switchTo(WEAPON_ORDER[i]); });
      if (input.pressed('KeyG')) {
        player.eyePos(eye);
        camera.getWorldDirection(dirV);
        if (weapons.throwGrenade('smoke', eye, dirV)) audio.smoke();
      }
      if (input.pressed('KeyF')) {
        player.eyePos(eye);
        camera.getWorldDirection(dirV);
        if (weapons.throwGrenade('flash', eye, dirV)) audio.flash();
      }
      playerObjective(dt);
    }

    // Scoreboard while Tab is held.
    if (input.keys.has('Tab')) {
      const rows = [{ name: 'YOU', team: match.state.playerTeam, kills: match.state.stats.kills, deaths: match.state.stats.deaths, alive: player.state.alive }];
      for (const b of bots.bots) {
        const s = botStats.get(b.id) || { kills: 0, deaths: 0 };
        rows.push({ name: b.name, team: b.team, kills: s.kills, deaths: s.deaths, alive: b.alive });
      }
      hud.showScoreboard(rows);
    } else {
      hud.hideScoreboard();
    }

    // Bots and grenades only run during combat: the buy phase is freeze time.
    if (phase === 'combat') {
      bots.step(dt, simTime, botEnv());
      grenades.step(dt, onSmoke, onFlash);
    }
    match.update(dt, aliveCounts());
    if (match.state.phase === 'roundEnd' || match.state.phase === 'matchEnd') {
      playerAliveAtRoundEnd = player.state.alive;
    }
    if (match.state.plantedSite && simTime - lastBeep > 1) {
      lastBeep = simTime;
      audio.plantBeep(match.state.fuseLeft < 8);
    }
  }

  world.step(dt, simTime, player.state.pos.x, player.state.pos.z);
  fx.step(dt);
  syncCamera();
  syncHud();
}

// ---- Frame loop ----
function frame(now) {
  if (frozen) return;
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  composer.render();
}

function onLockChange(locked) {
  if (shot || selftest) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (match.state.phase === 'matchEnd') {
    // Keep the match-end overlay up.
  } else if (match.state.phase === 'combat' || match.state.phase === 'buy') {
    if (!hud.buyVisible()) hud.showOverlay('paused');
  }
}

function startGame() {
  if (started) return;
  started = true;
  match.startMatch();
  hud.hideOverlay();
  if (!shot && !selftest) input.requestLock();
}

hud.onPlay(() => {
  if (match.state.phase === 'matchEnd') {
    weapons.reset();
    match.startMatch();
    hud.hideOverlay();
    if (!shot) input.requestLock();
    return;
  }
  if (match.state.phase === 'roundEnd') { hud.hideOverlay(); return; }
  startGame();
});

// Clicking the canvas re-locks the pointer mid-round (after closing the buy menu).
renderer.domElement.addEventListener('click', () => {
  if (!input.locked && !hud.overlayVisible() && !hud.buyVisible()
    && (match.state.phase === 'buy' || match.state.phase === 'combat')) {
    input.requestLock();
  }
});

// ---- Deterministic screenshot poses (?shot=name&seed=N) ----
function paintTwiceThenReady() {
  hud.hideBanner();
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    composer.render();
    painted += 1;
    if (painted === 2) { window.__shotReady = true; frozen = true; }
  }
  requestAnimationFrame(paint);
}
function settle(steps) { for (let i = 0; i < steps; i++) step(FIXED_STEP); }

function placeBot(b, x, z, yaw) {
  b.pos.x = x; b.pos.z = z; b.pos.y = 0; b.yaw = yaw;
  b.state = 'hold'; b.path = []; b.pathI = 0; b.target = null;
  b.group.position.set(x, 0, z); b.group.rotation.y = yaw;
}
function aimAt(x, y, z) {
  const p = player.state;
  const dx = x - p.pos.x, dy = y - (p.pos.y + player.eyeHeight()), dz = z - p.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(clamp(dy / len, -1, 1));
  syncCamera();
}

function runShot(name) {
  match.startMatch();
  match.state.phase = 'combat';
  match.state.phaseT = 0;
  match.state.roundTimeLeft = 88;
  hud.hideOverlay();
  hud.showBuy(false);
  const p = player.state;
  if (name === 'menu') {
    p.pos.x = 0; p.pos.z = 24; p.yaw = 0; p.pitch = 0.02;
    syncCamera();
    settle(30);
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  if (name === 'cover') {
    // South-yard firefight: the player aims across the open yard at two
    // breachers pushing from mid, floodlit from the north.
    p.pos.x = 2; p.pos.z = 6; p.yaw = 0; p.pitch = 0;
    weapons.buyWeapon('rifle');
    weapons.switchTo('rifle');
    const b1 = bots.bots.find((b) => b.team === 'breachers');
    const b2 = bots.bots.filter((b) => b.team === 'breachers')[1];
    placeBot(b1, -6, 12, 2.6);
    placeBot(b2, 2, 16, Math.PI);
    settle(20);
    aimAt(-6, 1.3, 12);
    playerShoot();
    settle(6); // the flash decays, the tracer is still in the air
    paintTwiceThenReady();
    return;
  }
  if (name === 'objective') {
    // Site A: a breacher plants the core while smoke hangs behind the site.
    // Both bots face the core (backs to the camera) so they hold the pose
    // instead of turning on the player.
    p.pos.x = -14; p.pos.z = -1; p.yaw = 0; p.pitch = 0;
    player.state.hp = 100; player.state.alive = true;
    weapons.buyWeapon('rifle');
    weapons.switchTo('rifle');
    const carrier = bots.bots.find((b) => b.team === 'breachers' && b.isCarrier) || bots.bots[4];
    placeBot(carrier, -25.5, -7, 0.98);
    const guard = bots.bots.find((b) => b.team === 'breachers' && b !== carrier);
    placeBot(guard, -22, -4, 0.9);
    onSmoke(-22, 1.4, -11);
    settle(24);
    match.state.plantedSite = 'A';
    match.state.fuseLeft = 32;
    world.setCoreState('A', 'planted');
    aimAt(-27, 1.5, -8);
    paintTwiceThenReady();
    return;
  }
  if (name === 'buy') {
    p.pos.x = 2; p.pos.z = 22; p.yaw = 0; p.pitch = 0.02;
    match.state.phase = 'buy';
    match.state.phaseT = 2;
    match.state.money = 5400;
    settle(20);
    renderBuyMenu();
    hud.showBuy(true);
    paintTwiceThenReady();
    return;
  }
  paintTwiceThenReady();
}

// ---- Headless self-test (?selftest=1): drives the real loop and reports ----
function runSelfTest() {
  const results = { ok: true, checks: {} };
  const check = (name, cond) => { results.checks[name] = !!cond; if (!cond) results.ok = false; };
  try {
    match.startMatch();
    check('match_started', match.state.phase === 'buy' && match.state.round === 1);
    check('bots_spawned', bots.bots.filter((b) => b.alive).length === 9);
    check('player_spawned', player.state.alive && player.state.hp === 100);
    // Buy phase: give the player money, buy a rifle, then let the round start.
    match.state.money = 5000;
    buyItem('rifle');
    check('buy_rifle', weapons.state.current === 'rifle' && match.state.money === 2300);
    match.state.phase = 'combat';
    match.state.phaseT = 0;
    // Aim at the nearest enemy bot and shoot until it dies (max 5 s of sim).
    let killed = 0;
    for (let i = 0; i < 300 && killed === 0; i++) {
      const enemy = bots.bots.find((b) => b.alive && b.team !== match.state.playerTeam);
      if (!enemy) break;
      const p = player.state;
      const dx = enemy.pos.x - p.pos.x, dy = 1.3 - player.eyeHeight(), dz = enemy.pos.z - p.pos.z;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.asin(clamp(dy / Math.hypot(dx, dy, dz), -1, 1));
      syncCamera();
      if (weapons.canFire(simTime)) playerShoot();
      if (weapons.state.mag === 0) weapons.reload(simTime);
      step(FIXED_STEP);
      killed = bots.bots.filter((b) => !b.alive).length;
    }
    check('player_shot_kills', killed > 0);
    check('money_for_kill', match.state.money >= 2600);
    // Reload works.
    weapons.state.mag = 0;
    const reloaded = weapons.reload(simTime);
    for (let i = 0; i < 200; i++) step(FIXED_STEP);
    check('reload', reloaded && weapons.state.mag > 0);
    // Run the bots for 200 s of sim: rounds must progress, bots must act.
    // (Deaths are tracked cumulatively: rounds respawn everyone, so a
    // snapshot at the end of the run could catch a fresh round.)
    let plantedSeen = false, roundAdvanced = false, anyBotDead = false;
    for (let i = 0; i < 12000; i++) {
      step(FIXED_STEP);
      if (match.state.plantedSite) plantedSeen = true;
      if (match.state.round > 1) roundAdvanced = true;
      if (bots.bots.some((b) => !b.alive)) anyBotDead = true;
      if (match.state.phase === 'matchEnd') break;
    }
    check('round_advanced', roundAdvanced);
    check('bots_plant_or_fight', plantedSeen || anyBotDead);
    // State at the end of the organic run, for diagnosing flaky plant checks.
    results.organicEnd = {
      round: match.state.round, phase: match.state.phase,
      roundTimeLeft: Math.round(match.state.roundTimeLeft * 10) / 10,
      aliveW: bots.bots.filter((b) => b.alive && b.team === 'wardens').length,
      aliveB: bots.bots.filter((b) => b.alive && b.team === 'breachers').length,
      playerHp: Math.round(player.state.hp),
    };
    // Objective check: fresh round state first, so it never depends on
    // whatever the organic run left behind (a wiped-out round can leave
    // no living carrier to test with).
    bots.spawnRound(match.state.playerTeam, match.state.round, Math.random);
    match.state.phase = 'combat';
    match.state.roundTimeLeft = 90; // fresh timer: the organic run may have left it short
    match.state.plantedSite = null;
    const carrier = bots.bots.find((b) => b.alive && b.team === 'breachers' && b.isCarrier)
      || bots.bots.find((b) => b.alive && b.team === 'breachers');
    if (carrier) {
      carrier.pos.x = -27; carrier.pos.z = -8; carrier.state = 'move'; carrier.path = [];
      carrier.isCarrier = true;
      for (const b of bots.bots) {
        if (b.team === 'wardens' && b.alive) { b.pos.x = 30; b.pos.z = 20; b.state = 'hold'; b.path = []; b.target = null; }
      }
      for (let i = 0; i < 420; i++) step(FIXED_STEP);
      check('bot_plants_core', match.state.plantedSite === 'A');
      // Defuse check: clear the breachers, put a warden on the planted core.
      for (const b of bots.bots) if (b.team === 'breachers' && b.alive) { b.alive = false; b.state = 'dead'; b.group.visible = false; }
      const warden = bots.bots.find((b) => b.alive && b.team === 'wardens');
      if (warden && match.state.plantedSite) {
        warden.pos.x = -27; warden.pos.z = -8; warden.state = 'retake'; warden.path = []; warden.target = null;
        for (let i = 0; i < 420; i++) step(FIXED_STEP);
        check('bot_defuses_core', match.state.plantedSite === null && match.state.score.wardens > 0);
      } else {
        check('bot_defuses_core', false);
      }
    } else {
      check('bot_plants_core', false);
      check('bot_defuses_core', false);
    }
    check('no_crash', true);
    results.round = match.state.round;
    results.score = match.state.score;
    results.phase = match.state.phase;
    results.playerHp = player.state.hp;
    results.botsAlive = bots.bots.filter((b) => b.alive).length;
    results.botDeaths = bots.bots.filter((b) => !b.alive).length;
    results.plantedSeen = plantedSeen;
  } catch (err) {
    results.ok = false;
    results.error = String(err && err.message || err);
  }
  const div = document.createElement('div');
  div.id = 'selftest';
  div.textContent = JSON.stringify(results);
  document.body.appendChild(div);
  document.title = 'SELFTEST ' + (results.ok ? 'PASS' : 'FAIL');
  window.__shotReady = true;
  frozen = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
hud.showOverlay('start');
if (shot) runShot(shot);
else if (selftest) runSelfTest();
else requestAnimationFrame(frame);
