// Blackwater Foundry: a bright overcast industrial yard with two charge
// sites, three lanes and the cover, choke points and sightlines a tactical
// round needs. Daylight, matte materials and architecture do the reading:
// Site A is brick with a big furnace, Site B is pale silos and pipes, mid
// is faded-colour containers. Everything is primitive Three.js geometry;
// repeated props are InstancedMesh; text signs are canvas textures made
// at load (no assets, no network). The map's collision is the AABB list
// it returns, and its waypoint graph is what the bots navigate.
import * as THREE from 'three';
import { aabb } from './utils.js';
import { CFG } from './config.js';
import { concreteTex, brickTex, steelTex, asphaltTex, siloTex, containerTex, crateTex, drumTex } from './textures.js';

// Bright overcast daylight. Concrete warm grey, dull steel, rust, faded
// industrial paint; team colour is limited to identification, never to
// glowing decoration. Painted blue and safety yellow replace the old
// cyan/amber emissive strips.
const PAL = {
  sky: 0xc3d2d8, fog: 0xc3d2d8, sun: 0xfff1d6, hemiSky: 0xdfe9ee, hemiGround: 0x8a7f72,
  floor: 0x77716a, asphalt: 0x5f5b55, wall: 0x9a938a, wallTop: 0x8a8378,
  brick: 0x8a5a44, brickDark: 0x74483a, rust: 0x7a4a28, steel: 0x6a7076,
  silo: 0xcfc8b8, pipe: 0x7a6a4a,
  containerA: 0x5a7a8a, containerB: 0x9a5a44, containerC: 0x7a7a52,
  crate: 0x8a7350, barrel: 0x5a6a58, dark: 0x2a2622,
  paintBlue: 0x2a5a8a, safetyYellow: 0xd8a018, charge: 0x2e2a26, chargeLid: 0xd8a018,
};

export function createWorld(scene) {
  scene.background = new THREE.Color(PAL.sky);
  scene.fog = new THREE.FogExp2(PAL.fog, 0.0032);
  // Gradient sky dome (pale horizon, deeper zenith): a flat sky colour
  // washes out the top of every screenshot; this costs one canvas.
  const skyC = document.createElement('canvas');
  skyC.width = 4; skyC.height = 256;
  const sg = skyC.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#9fb2bd'); grad.addColorStop(0.55, '#c3d2d8'); grad.addColorStop(1, '#dcdcc9');
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
  const skyT = new THREE.CanvasTexture(skyC);
  skyT.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false }));
  scene.add(sky);

  const colliders = [];
  const mat = (color, rough = 0.85, metal = 0.15, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const M = {
    // Textured surfaces: the map carries the colour, so the base colour
    // is white; repeats are tuned so the pattern scale reads in metres
    // (brick courses ~7 cm, floor slabs ~4 m, silo seams ~1.4 m).
    floor: mat(0xffffff, 0.95, 0.0, { map: concreteTex(25, 20) }),
    asphalt: mat(0xffffff, 0.95, 0.0, { map: asphaltTex(6, 4) }),
    wall: mat(PAL.wall, 0.9, 0.05),
    wallTop: mat(PAL.wallTop, 0.9, 0.05),
    brick: mat(0xffffff, 0.95, 0.0, { map: brickTex(13, 5) }),
    brickDark: mat(0x9a8a80, 0.95, 0.0, { map: brickTex(13, 5) }),
    rust: mat(PAL.rust, 0.7, 0.45),
    steel: mat(0xffffff, 0.5, 0.6, { map: steelTex(2, 1) }),
    silo: mat(0xffffff, 0.75, 0.25, { map: siloTex(3, 2) }),
    contA: mat(0xffffff, 0.65, 0.3, { map: containerTex('#5a7a8a', 4, 1, 79) }),
    contB: mat(0xffffff, 0.65, 0.3, { map: containerTex('#9a5a44', 4, 1, 83) }),
    contC: mat(0xffffff, 0.65, 0.3, { map: containerTex('#7a7a52', 4, 1, 89) }),
    crate: mat(0xffffff, 0.85, 0.1, { map: crateTex(1, 1) }),
    barrel: mat(0xffffff, 0.6, 0.5, { map: drumTex(2, 1) }),
    pipe: mat(PAL.pipe, 0.5, 0.6),
    dark: mat(PAL.dark, 0.95, 0.0),
    paintBlue: mat(PAL.paintBlue, 0.8, 0.1),
    safetyYellow: mat(PAL.safetyYellow, 0.8, 0.1),
    charge: mat(PAL.charge, 0.55, 0.6),
    chargeLid: mat(PAL.chargeLid, 0.6, 0.3),
  };
  // Fire mouth: its own material so the glow can flicker without touching
  // anything else that shares the dark material.
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0x1a1210, emissive: 0xff6a22, emissiveIntensity: 0.8, roughness: 0.9,
  });

  function box(cx, cz, w, d, h, y = 0, material = M.wall, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(cx, y + h / 2, cz);
    m.castShadow = h > 1.2; m.receiveShadow = true;
    scene.add(m);
    if (collide) colliders.push(aabb(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2));
    return m;
  }
  function cyl(cx, cz, r, h, y = 0, material = M.steel, collide = true, seg = 14) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
    m.position.set(cx, y + h / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (collide) colliders.push(aabb(cx - r, y, cz - r, cx + r, y + h, cz + r));
    return m;
  }
  // Flat decal plane (oil stain, rust patch, floor marking, contact
  // shadow): no collision, a hair above the surface so it never z-fights.
  // Pass a map for a textured decal (the asphalt yard patch).
  function decal(cx, cz, w, d, color, y = 0.02, opacity = 0.55, ry = 0, map = null) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial(map
        ? { map, roughness: 1, metalness: 0, transparent: true, opacity }
        : { color, roughness: 1, metalness: 0, transparent: true, opacity }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = ry;
    m.position.set(cx, y, cz); m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  // Painted sign: text drawn on a canvas, put on a plane. No asset files.
  function sign(text, w, h, cx, cy, cz, ry = 0, fg = '#f2ede2', bg = '#3a352e', font = 0.42) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = Math.max(64, Math.round(512 * (h / w)));
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg; g.font = `bold ${Math.round(c.height * font)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }));
    m.position.set(cx, cy, cz); m.rotation.y = ry; m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // ---- Ground and perimeter ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.map.halfW * 2 + 24, CFG.map.halfD * 2 + 24), M.floor);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // Asphalt yard patch (textured) and oil stains: the floor is not one flat colour.
  decal(0, 0, 30, 20, 0, 0.015, 0.9, 0, asphaltTex(6, 4));
  decal(-28, -8, 14, 16, 0x6a655e, 0.015, 0.5);
  decal(28, -8, 14, 16, 0x6a655e, 0.015, 0.5);
  decal(-6, -2, 3.2, 2.2, 0x2a2521, 0.02, 0.6, 0.4); // oil stain, mid
  decal(14, 12, 2.6, 1.8, 0x2a2521, 0.02, 0.55, 1.1); // oil stain, B yard
  decal(-20, 18, 2.4, 1.6, 0x2a2521, 0.02, 0.55, 0.2); // oil stain, A yard
  // Contact shadows (AO fakes, zero perf cost): dark strips where the
  // walls meet the floor and under the big masses, so the bright scene
  // keeps its depth without any extra light.
  decal(0, 27.6, 60, 0.7, 0x241f1a, 0.02, 0.4);
  decal(-30, -17.2, 15, 0.7, 0x241f1a, 0.02, 0.4);
  decal(30, -17.2, 15, 0.7, 0x241f1a, 0.02, 0.4);
  decal(-6, -2, 9, 4.4, 0x241f1a, 0.02, 0.4);
  decal(6, 2, 9, 4.4, 0x241f1a, 0.02, 0.4);
  decal(-31, -12, 7, 5, 0x1c1512, 0.02, 0.45); // furnace base soot
  // Forklift lane markings: safety-yellow lines down the two main lanes.
  decal(-21, 8, 0.35, 26, PAL.safetyYellow, 0.02, 0.5);
  decal(21, 8, 0.35, 26, PAL.safetyYellow, 0.02, 0.5);
  const W = CFG.map.halfW, D = CFG.map.halfD, H = CFG.map.wallH;
  box(0, -D - 0.5, W * 2 + 2, 1, H, 0, M.wallTop); // north wall
  box(0, D + 0.5, W * 2 + 2, 1, H, 0, M.wallTop); // south wall
  box(-W - 0.5, 0, 1, D * 2 + 2, H, 0, M.wallTop); // west wall
  box(W + 0.5, 0, 1, D * 2 + 2, H, 0, M.wallTop); // east wall
  // Painted blue band on the south wall, safety-yellow on the north: the
  // two ends of the map read differently at a glance, with plain paint.
  box(0, D - 0.05, W * 2, 0.1, 0.5, 3.6, M.paintBlue, false);
  box(0, -D + 0.05, W * 2, 0.1, 0.5, 3.6, M.safetyYellow, false);
  // Wayfinding signage: the foundry name reads from both spawns (the
  // north-wall sign faces south), and each lane has its name on the wall
  // beside it, so the first 30 seconds already teach the callouts.
  sign('BLACKWATER FOUNDRY', 16, 1.6, 0, 4.8, -D + 0.1, 0, '#f2ede2', '#3a352e');
  sign('A LONG', 4.5, 1.1, -W + 0.1, 4.2, 12, Math.PI / 2, '#1c1a16', '#d8a018');
  sign('B SHORT', 4.5, 1.1, W - 0.1, 4.2, 8, -Math.PI / 2, '#f2ede2', '#2a5a8a');

  // ---- Site A foundry (west): brick walls, a big furnace, FOUNDRY sign ----
  // The south wall has a 3 m doorway on the A-long lane (x=-34): the first
  // build's solid south wall left the lane's graph edge cutting the wall.
  box(-30, -18, 16, 1, H, 0, M.brick); // north wall of A building
  box(-36.75, 2, 2.5, 1, H, 0, M.brick); // south wall, west stub
  box(-27.25, 2, 10.5, 1, H, 0, M.brick); // south wall, east stub
  box(-37.4, -8, 1, 21, H, 0, M.brick); // west wall (uses the perimeter)
  box(-22, -16, 1, 5, H, 0, M.brick); // east wall, north stub
  box(-22, 0, 1, 5, H, 0, M.brick); // east wall, south stub
  // Big furnace block with a chimney and a dark fire mouth.
  box(-31, -14, 6, 4, 3.2, 0, M.rust);
  box(-31, -13, 6.6, 0.4, 0.6, 3.2, M.steel);
  cyl(-33.5, -15.5, 0.9, 9, 0, M.brickDark, true, 12); // chimney
  box(-28, -14, 0.3, 2.2, 1.6, 0.6, fireMat, false); // fire mouth, no collision
  // Warm light spilling from the fire mouth: Site A reads warm from any
  // angle against Site B's cool steel, which is the site identity.
  const warm = new THREE.PointLight(0xffb36a, 5, 14, 1.8);
  warm.position.set(-27, 2, -13); scene.add(warm);
  box(-26, -2, 4, 3, 2.2, 0, M.steel);
  // Rust streaks on the brick, peeling paint on the steel block.
  decal(-30, -6, 1.2, 3.0, 0x4a2a18, 0.02, 0.45, 0.3);
  sign('FOUNDRY', 7, 1.4, -21.4, 4.6, -8, Math.PI / 2, '#f2ede2', '#5a3a28');
  sign('A', 2.2, 2.2, -21.4, 2.2, -13.5, Math.PI / 2, '#1c1a16', '#d8a018');

  // ---- Site B silos (east): pale silos, pipes, SILO sign ----
  // The south wall has a 3 m doorway on the B-short lane (x=34), matching A.
  box(30, -18, 16, 1, H, 0, M.wall);
  box(27.25, 2, 10.5, 1, H, 0, M.wall); // south wall, west stub
  box(36.75, 2, 2.5, 1, H, 0, M.wall); // south wall, east stub
  box(37.4, -8, 1, 21, H, 0, M.wall);
  box(22, -16, 1, 5, H, 0, M.wall);
  box(22, 0, 1, 5, H, 0, M.wall);
  // Pale silos the charge sits between, with a pipe run overhead.
  // The middle silo is smaller and set back so the B-short lane (x=34)
  // and the site node stay clear of it.
  cyl(33, -14, 2.6, 7, 0, M.silo);
  cyl(31, -4, 2.0, 6, 0, M.silo);
  cyl(28, -16, 2.0, 5.5, 0, M.steel);
  const bPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 10), M.pipe);
  bPipe.rotation.x = Math.PI / 2; bPipe.position.set(33, 7.4, -10); bPipe.castShadow = true; scene.add(bPipe);
  sign('SILO', 5, 1.4, 21.4, 4.6, -8, -Math.PI / 2, '#2a2622', '#cfc8b8');
  sign('B', 2.2, 2.2, 21.4, 2.2, -13.5, -Math.PI / 2, '#f2ede2', '#2a5a8a');

  // ---- Mid: faded-colour container stacks with a connector gap at x=0 ----
  box(-6, -2, 8, 3.4, 2.6, 0, M.contA);
  box(6, 2, 8, 3.4, 2.6, 0, M.contB);
  box(-6, -2, 8, 3.4, 2.6, 2.6, M.contC);
  box(6, 2, 8, 3.4, 2.6, 2.6, M.contA);
  // Rust patches and peeling paint on the containers, warehouse numbers.
  box(-6, -3.75, 2.2, 0.1, 1.1, 0.7, M.rust, false);
  box(6, 3.75, 2.2, 0.1, 1.1, 0.7, M.rust, false);
  sign('07', 1.6, 1.0, -6, 1.6, -3.78, Math.PI, '#f2ede2', '#5a7a8a');
  sign('12', 1.6, 1.0, 6, 1.6, 3.78, 0, '#f2ede2', '#9a5a44');
  // Overhead pipe bridge across mid.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 24, 10), M.pipe);
  pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 5.2, -4); pipe.castShadow = true; scene.add(pipe);

  // ---- Yard cover: crates, barrels and low walls ----
  const crateSpots = [
    [-14, -12, 1.6], [-17.5, -13.5, 1.2], [-15, -8, 1.0], [14, -12, 1.6], [17.5, -13.5, 1.2],
    [-10, 16, 1.4], [-8.4, 17.2, 1.0], [10, 16, 1.4], [8.4, 17.2, 1.0],
    [-32.5, 4, 1.5], [-31.5, -2, 1.2], [31.5, 3.5, 1.5], [31.5, -2, 1.2],
    [-4, 14, 1.3], [4, -14, 1.3], [3, 20, 1.5], [-20, 9, 1.2], [20, 9, 1.2],
    [-27, 12, 1.4], [27, 12, 1.4], [-18, -23, 1.2], [18, -23, 1.2],
  ];
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crates = new THREE.InstancedMesh(crateGeo, M.crate, crateSpots.length);
  const dummy = new THREE.Object3D();
  crateSpots.forEach(([x, z, s], i) => {
    dummy.position.set(x, s / 2, z);
    dummy.rotation.set(0, (i * 0.7) % Math.PI, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    crates.setMatrixAt(i, dummy.matrix);
    colliders.push(aabb(x - s / 2, 0, z - s / 2, x + s / 2, s, z + s / 2));
  });
  crates.castShadow = true; crates.receiveShadow = true;
  scene.add(crates);

  const barrelSpots = [[-16, -14], [-15, -15.4], [16, -14], [15, -15.4], [-36, 18], [36, 18], [-8, -8], [8, -8], [-22, 14], [22, 14]];
  const barrels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 1.15, 12), M.barrel, barrelSpots.length);
  barrelSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0.58, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); barrels.setMatrixAt(i, dummy.matrix);
    colliders.push(aabb(x - 0.55, 0, z - 0.55, x + 0.55, 1.15, z + 0.55));
  });
  barrels.castShadow = true; barrels.receiveShadow = true;
  scene.add(barrels);

  // Low cover walls in the yards.
  box(-12, 20, 6, 0.8, 1.3, 0, M.wall);
  box(12, 20, 6, 0.8, 1.3, 0, M.wall);
  box(-12, -20, 6, 0.8, 1.3, 0, M.wall);
  box(12, -20, 6, 0.8, 1.3, 0, M.wall);

  // ---- Lane identity props: visual only, no collision, placed flush to
  // walls or off the nav lanes (checked against every waypoint edge), so
  // the nav graph and the bots never notice them. ----
  // Site A: coal pile by the furnace wall.
  cyl(-35.8, -2, 1.1, 0.9, 0, M.dark, false, 10);
  cyl(-35.8, -2, 0.65, 0.6, 0.9, M.dark, false, 10);
  // Site B: pipe stack along the east yard.
  const pp1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 8, 10), M.pipe);
  pp1.rotation.z = Math.PI / 2; pp1.position.set(33, 0.5, 20); pp1.castShadow = true; scene.add(pp1);
  const pp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 8, 10), M.pipe);
  pp2.rotation.z = Math.PI / 2; pp2.position.set(32.6, 1.05, 20); pp2.castShadow = true; scene.add(pp2);
  // Mid: pallet stack in the south yard, clear of the spawn-to-mid lane.
  box(-16, 24.5, 2.2, 1.6, 0.18, 0, M.crate, false);
  box(-16, 24.5, 2.2, 1.6, 0.18, 0.18, M.crate, false);

  // ---- Lamp posts: plain steel poles with matte heads, daylight accents ----
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.6, metalness: 0.5 });
  const lampSpots = [[-33, 2], [33, -2], [-3.5, -15.5], [-27, -14], [24, -12]]; // none on a lane: the old (0,-14) pole sat on the mid lane and trapped bots against it
  for (const [x, z] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), M.steel);
    pole.position.set(x, 2.3, z); pole.castShadow = true; scene.add(pole);
    colliders.push(aabb(x - 0.15, 0, z - 0.15, x + 0.15, 4.6, z + 0.15));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.28), lampMat);
    head.position.set(x, 4.7, z); scene.add(head);
    const light = new THREE.PointLight(0xfff1d6, 6, 14, 1.7);
    light.position.set(x, 4.5, z); scene.add(light);
  }
  // Painted bands (plain paint, no glow) marking the two site entries.
  box(-21.4, -8, 0.15, 5, 0.5, 2.2, M.paintBlue, false);
  box(21.4, -8, 0.15, 5, 0.5, 2.2, M.safetyYellow, false);

  // ---- Demolition Charge: a matte steel case with a safety-yellow lid on
  // a hazard-striped pad at each site. Planted, a small red beacon blinks.
  function buildCore(site) {
    const [cx, , cz] = CFG.sites[site].core;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.35, 20), M.steel);
    pad.position.y = 0.18; pad.receiveShadow = true; g.add(pad);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.12, 8, 32), M.safetyYellow);
    stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.4; g.add(stripe);
    const charge = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.62), M.charge);
    body.position.y = 0.62; body.castShadow = true; charge.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.1, 0.66), M.chargeLid);
    lid.position.y = 0.9; charge.add(lid);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), M.steel);
    dial.rotation.x = Math.PI / 2; dial.position.set(0.3, 0.68, 0.32); charge.add(dial);
    g.add(charge);
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0x7a1a12, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.4 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), beaconMat);
    beacon.position.set(-0.32, 1.0, 0); g.add(beacon);
    const light = new THREE.PointLight(0xff3a20, 0, 10, 1.6);
    light.position.y = 1.6; g.add(light);
    g.position.set(cx, 0, cz);
    scene.add(g);
    return { group: g, core: charge, ring: stripe, light, mat: beaconMat, beacon };
  }
  const cores = { A: buildCore('A'), B: buildCore('B') };

  // ---- Pale daytime skyline outside the walls, softened by haze ----
  const skyline = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x9aa8ad, fog: true });
  const skySpots = [[-60, -40, 18, 30], [-20, -55, 24, 42], [25, -50, 16, 26], [60, -35, 20, 34], [-55, 40, 16, 24], [55, 45, 22, 30], [0, 60, 30, 38]];
  for (const [x, z, w, h] of skySpots) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), skyMat);
    m.position.set(x, h / 2 - 2, z); skyline.add(m);
  }
  scene.add(skyline);
  // High pale sun: light, not a picture — the sky is overcast, the sun a
  // bright patch behind cloud.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false, transparent: true, opacity: 0.55 }));
  sunDisc.position.set(-40, 55, -90); sunDisc.lookAt(0, 0, 0); scene.add(sunDisc);

  // ---- Lights: bright overcast — strong hemisphere, high sun, soft fill ----
  const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 2.0);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(PAL.sun, 2.8);
  sunLight.position.set(-25, 45, -30);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = true;
  // Tight frustum, just the play area: a 2048 map over a 90 m span wastes
  // most of its texels; 1024 over 80x64 keeps the shadows crisp and cheap.
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -40; sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 32; sunLight.shadow.camera.bottom = -32;
  sunLight.shadow.camera.far = 160; sunLight.shadow.bias = -0.0004;
  scene.add(sunLight, sunLight.target);
  const fill = new THREE.DirectionalLight(0xbcd0dd, 0.9);
  fill.position.set(30, 20, 40); scene.add(fill);

  // ---- Waypoint graph: hand-placed nodes on the lanes, edges between neighbours ----
  const wp = [
    [0, 24], [0, -24], // 0 warden spawn, 1 breacher spawn
    [0, 12], [0, 0], [0, -12], // 2 mid south, 3 mid, 4 mid north
    [-34, 12], [-34, -8], [-34, -19], // 5 A long south, 6 A long, 7 A long north
    [-27, -8], [-20, -8], [-30, 6], // 8 site A, 9 A entry, 10 A back
    [34, 8], [34, -8], [34, -19], // 11 B short south, 12 B short, 13 B short north
    [27, -8], [20, -8], [30, 6], // 14 site B, 15 B entry, 16 B back
    [-13, 10], [12, 10], // 17 connector west, 18 connector east — west node sits clear of the mid container's corner
    [-20, 20], [20, 20], [-20, -20], [20, -20], // 19-22 yards
    [-9, -11], [9, -11], // 23 A yard, 24 B yard — clear of the crate clusters at (±14,-12)
  ];
  // Every edge is a walkable lane: it never cuts a wall, a container, a
  // silo or a low yard wall, and no node sits inside a collider. (The
  // first build had edges through the site walls and the mid container,
  // and crates on the A-long/B-short lanes — bots pinned themselves on
  // them instead of reaching the sites.)
  const wpEdges = [
    [0, 2], [0, 19], [0, 20], [2, 3], [2, 17], [2, 18], [3, 4], [3, 15], [3, 24],
    [4, 1], [4, 23], [4, 24], [1, 7], [1, 13], [1, 21], [1, 22],
    [5, 6], [5, 10], [5, 19], [6, 8], [6, 9], [7, 21], [8, 9], [9, 23],
    [11, 12], [11, 16], [11, 20], [12, 14], [12, 15], [13, 22], [14, 15], [15, 24],
    [17, 19], [17, 23], [18, 20], [18, 24], [23, 24], [10, 16],
  ];
  const adj = wp.map(() => []);
  for (const [a, b] of wpEdges) { adj[a].push(b); adj[b].push(a); }

  const spawn = {
    wardens: [[-4, 24], [-1.5, 25], [1.5, 25], [4, 24], [0, 22.5]],
    breachers: [[-4, -24], [-1.5, -25], [1.5, -25], [4, -24], [0, -22.5]],
  };

  function setCoreState(site, state) {
    const c = cores[site];
    if (state === 'planted') {
      c.mat.emissive.setHex(0xff3a20); c.mat.emissiveIntensity = 2.2;
      c.light.intensity = 9;
    } else {
      c.mat.emissive.setHex(0x000000); c.mat.emissiveIntensity = 0;
      c.light.intensity = 0;
    }
  }

  return {
    colliders, spawn, cores, setCoreState,
    waypoints: { nodes: wp, adj },
    holdSpots: {
      wardens: [
        { x: -24, z: -6, yaw: 0.5 }, { x: -18, z: -12, yaw: -0.6 }, { x: 24, z: -6, yaw: -0.5 },
        { x: 18, z: -12, yaw: 0.6 }, { x: 0, z: 4, yaw: 0 }, { x: -8, z: 14, yaw: 0.3 }, { x: 8, z: 14, yaw: -0.3 },
      ],
      breachers: [
        { x: -6, z: -16, yaw: 0 }, { x: 6, z: -16, yaw: 0 }, { x: -14, z: -18, yaw: 0.4 }, { x: 14, z: -18, yaw: -0.4 },
      ],
    },
    // Post-plant hold positions around each site, for the breachers who
    // guard a planted charge while the wardens retake. They sit exactly on
    // waypoint nodes, so reaching the path's end means reaching the spot.
    postPlantSpots: {
      A: [{ x: -20, z: -8 }, { x: -30, z: 6 }, { x: -34, z: -8 }],
      B: [{ x: 20, z: -8 }, { x: 30, z: 6 }, { x: 34, z: -8 }],
    },
    step(dt, time) {
      // Furnace glow flicker: two slow sines, no gameplay impact.
      fireMat.emissiveIntensity = 0.75 + Math.sin(time * 7) * 0.15 + Math.sin(time * 13.7) * 0.1;
      // The planted beacon blinks; the idle charge sits still on its pad.
      for (const site of ['A', 'B']) {
        const c = cores[site];
        if (c.light.intensity > 0) {
          const on = Math.sin(time * 5) > 0;
          c.light.intensity = on ? 9 : 2;
          c.mat.emissiveIntensity = on ? 2.2 : 0.5;
        }
      }
    },
  };
}
