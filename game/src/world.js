// The Industrial Zone: a dusk-lit factory yard with two Pulse Core sites,
// three lanes and the cover, choke points and sightlines a tactical round
// needs. Everything is primitive Three.js geometry; repeated props are
// InstancedMesh. The map's collision is the AABB list it returns, and its
// waypoint graph is what the bots navigate.
import * as THREE from 'three';
import { aabb } from './utils.js';
import { CFG } from './config.js';

const PAL = {
  sky: 0x241a30, fog: 0x241a30, sun: 0xff8a3c, hemiSky: 0x7a5a9a, hemiGround: 0x241a12,
  floor: 0x2e2a28, wall: 0x3b3633, wallTop: 0x4a423c, rust: 0x7a4a28, steel: 0x4c5560,
  containerA: 0x1f6f8b, containerB: 0xb06a1f, crate: 0x5a4a30, barrel: 0x3a5a4a,
  pipe: 0x6a5a3a, glass: 0x35c8ff, amber: 0xff9a3c, core: 0x35e0ff, dark: 0x191512,
};

export function createWorld(scene) {
  scene.background = new THREE.Color(PAL.sky);
  scene.fog = new THREE.FogExp2(PAL.fog, 0.011);

  const colliders = [];
  const mat = (color, rough = 0.85, metal = 0.15, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const M = {
    floor: mat(PAL.floor, 0.55, 0.25),
    wall: mat(PAL.wall, 0.9, 0.05),
    wallTop: mat(PAL.wallTop, 0.9, 0.05),
    rust: mat(PAL.rust, 0.7, 0.45),
    steel: mat(PAL.steel, 0.45, 0.7),
    contA: mat(PAL.containerA, 0.6, 0.35),
    contB: mat(PAL.containerB, 0.6, 0.35),
    crate: mat(PAL.crate, 0.85, 0.1),
    barrel: mat(PAL.barrel, 0.6, 0.5),
    pipe: mat(PAL.pipe, 0.5, 0.6),
    dark: mat(PAL.dark, 0.95, 0.0),
    glass: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.15, metalness: 0.8, emissive: 0x1a3a4a, emissiveIntensity: 0.6 }),
    stripCyan: new THREE.MeshStandardMaterial({ color: 0x0a2a33, emissive: PAL.glass, emissiveIntensity: 2.4, roughness: 0.4 }),
    stripAmber: new THREE.MeshStandardMaterial({ color: 0x33220a, emissive: PAL.amber, emissiveIntensity: 2.4, roughness: 0.4 }),
    core: new THREE.MeshStandardMaterial({ color: 0x06222a, emissive: PAL.core, emissiveIntensity: 2.8, roughness: 0.3, metalness: 0.2 }),
    coreHot: new THREE.MeshStandardMaterial({ color: 0x2a1206, emissive: 0xff5a1e, emissiveIntensity: 3.2, roughness: 0.3, metalness: 0.2 }),
  };

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

  // ---- Ground and perimeter ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.map.halfW * 2 + 24, CFG.map.halfD * 2 + 24), M.floor);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const W = CFG.map.halfW, D = CFG.map.halfD, H = CFG.map.wallH;
  box(0, -D - 0.5, W * 2 + 2, 1, H, 0, M.wallTop); // north wall
  box(0, D + 0.5, W * 2 + 2, 1, H, 0, M.wallTop); // south wall
  box(-W - 0.5, 0, 1, D * 2 + 2, H, 0, M.wallTop); // west wall
  box(W + 0.5, 0, 1, D * 2 + 2, H, 0, M.wallTop); // east wall

  // ---- Site A warehouse (west) with a wide east-facing doorway ----
  box(-30, -18, 16, 1, H, 0, M.wall); // north wall of A building
  box(-30, 2, 16, 1, H, 0, M.wall); // south wall of A building
  box(-37.4, -8, 1, 21, H, 0, M.wall); // west wall (uses the perimeter)
  box(-22, -16, 1, 5, H, 0, M.wall); // east wall, north stub
  box(-22, 0, 1, 5, H, 0, M.wall); // east wall, south stub
  // Furnace block inside A, and a catwalk beam overhead.
  box(-31, -14, 6, 4, 3.2, 0, M.rust);
  box(-31, -13, 6.6, 0.4, 0.6, 3.2, M.steel);
  box(-26, -2, 4, 3, 2.2, 0, M.steel);

  // ---- Site B warehouse (east), mirrored ----
  box(30, -18, 16, 1, H, 0, M.wall);
  box(30, 2, 16, 1, H, 0, M.wall);
  box(37.4, -8, 1, 21, H, 0, M.wall);
  box(22, -16, 1, 5, H, 0, M.wall);
  box(22, 0, 1, 5, H, 0, M.wall);
  // Silos inside B: three tall cylinders the core sits between.
  cyl(33, -14, 2.6, 7, 0, M.rust);
  cyl(33, -6, 2.6, 7, 0, M.steel);
  cyl(28, -16, 2.0, 5.5, 0, M.steel);

  // ---- Mid structure: two container stacks with a connector gap at x=0 ----
  box(-6, -2, 8, 3.4, 2.6, 0, M.contA);
  box(6, 2, 8, 3.4, 2.6, 0, M.contB);
  box(-6, -2, 8, 3.4, 2.6, 2.6, M.contB);
  box(6, 2, 8, 3.4, 2.6, 2.6, M.contA);
  // Overhead pipe bridge across mid.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 24, 10), M.pipe);
  pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 5.2, -4); pipe.castShadow = true; scene.add(pipe);

  // ---- Yard cover: crates, barrels and low walls ----
  const crateSpots = [
    [-14, -12, 1.6], [-13, -10.4, 1.2], [-14, -9, 1.0], [14, -12, 1.6], [13, -10.4, 1.2],
    [-10, 16, 1.4], [-8.4, 17.2, 1.0], [10, 16, 1.4], [8.4, 17.2, 1.0],
    [-34, 6, 1.5], [-34, -2, 1.2], [34, 2, 1.5], [34, -6, 1.2],
    [-4, 14, 1.3], [4, -14, 1.3], [0, 20, 1.5], [-20, 6, 1.2], [20, 6, 1.2],
    [-27, 12, 1.4], [27, 12, 1.4], [-18, -20, 1.2], [18, -20, 1.2],
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

  const barrelSpots = [[-16, -14], [-15, -15.4], [16, -14], [15, -15.4], [-36, 18], [36, 18], [-8, -8], [8, -8], [-24, 18], [24, 18]];
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

  // ---- Floodlights: poles with warm heads that lift the lanes out of shadow ----
  const floodMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffc46a, emissiveIntensity: 3.0 });
  const floodSpots = [[-33, 2], [33, -2], [0, -14], [-27, -14], [24, -12]];
  for (const [x, z] of floodSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), M.steel);
    pole.position.set(x, 2.3, z); pole.castShadow = true; scene.add(pole);
    colliders.push(aabb(x - 0.15, 0, z - 0.15, x + 0.15, 4.6, z + 0.15));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.28), floodMat);
    head.position.set(x, 4.7, z); scene.add(head);
    const light = new THREE.PointLight(0xffc46a, 26, 26, 1.7);
    light.position.set(x, 4.5, z); scene.add(light);
  }
  const stripGeo = new THREE.BoxGeometry(4, 0.12, 0.12);
  const stripPositions = [
    [-20, 24, M.stripCyan], [0, 24, M.stripCyan], [20, 24, M.stripCyan],
    [-20, -24, M.stripAmber], [0, -24, M.stripAmber], [20, -24, M.stripAmber],
    [-22, -8, M.stripCyan], [22, -8, M.stripAmber],
  ];
  for (const [x, z, material] of stripPositions) {
    const s = new THREE.Mesh(stripGeo, material);
    s.position.set(x, 3.4, z); scene.add(s);
  }

  // ---- Pulse Cores: a pad, a floating octahedron and a ring at each site ----
  function buildCore(site) {
    const [cx, , cz] = CFG.sites[site].core;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.35, 20), M.steel);
    pad.position.y = 0.18; pad.receiveShadow = true; g.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.09, 10, 32),
      new THREE.MeshStandardMaterial({ color: 0x06222a, emissive: PAL.core, emissiveIntensity: 2.2 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; g.add(ring);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), M.core.clone());
    core.position.y = 1.7; core.castShadow = true; g.add(core);
    const light = new THREE.PointLight(PAL.core, 14, 16, 1.6);
    light.position.y = 2.2; g.add(light);
    g.position.set(cx, 0, cz);
    scene.add(g);
    return { group: g, core, ring, light, mat: core.material };
  }
  const cores = { A: buildCore('A'), B: buildCore('B') };

  // ---- Dusk skyline silhouettes outside the walls ----
  const skyline = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x1a1224, fog: true });
  const skySpots = [[-60, -40, 18, 30], [-20, -55, 24, 42], [25, -50, 16, 26], [60, -35, 20, 34], [-55, 40, 16, 24], [55, 45, 22, 30], [0, 60, 30, 38]];
  for (const [x, z, w, h] of skySpots) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), skyMat);
    m.position.set(x, h / 2 - 2, z); skyline.add(m);
  }
  scene.add(skyline);
  // Low sun disc, just above the north-west horizon.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a, fog: false, transparent: true, opacity: 0.9 }));
  sun.position.set(-70, 16, -90); sun.lookAt(0, 8, 0); scene.add(sun);

  // ---- Lights ----
  const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.15);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(PAL.sun, 2.6);
  sunLight.position.set(-40, 26, -50);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -45; sunLight.shadow.camera.right = 45;
  sunLight.shadow.camera.top = 45; sunLight.shadow.camera.bottom = -45;
  sunLight.shadow.camera.far = 140; sunLight.shadow.bias = -0.0004;
  scene.add(sunLight, sunLight.target);
  const fill = new THREE.DirectionalLight(0x8a6ab0, 0.7);
  fill.position.set(30, 20, 40); scene.add(fill);

  // ---- Rain: one Points cloud, recycled around the camera ----
  const RAIN = 1400;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN * 3);
  const rainSeed = [];
  for (let i = 0; i < RAIN; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 90;
    rainPos[i * 3 + 1] = Math.random() * 26;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    rainSeed.push(14 + Math.random() * 8);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x9aa8c0, size: 0.09, transparent: true, opacity: 0.5, sizeAttenuation: true,
  }));
  rain.frustumCulled = false;
  scene.add(rain);

  // ---- Waypoint graph: hand-placed nodes on the lanes, edges between neighbours ----
  const wp = [
    [0, 24], [0, -24], // 0 warden spawn, 1 breacher spawn
    [0, 12], [0, 0], [0, -12], // 2 mid south, 3 mid, 4 mid north
    [-34, 12], [-34, -8], [-34, -20], // 5 A long south, 6 A long, 7 A long north
    [-27, -8], [-20, -8], [-30, 6], // 8 site A, 9 A entry, 10 A back
    [34, 8], [34, -8], [34, -20], // 11 B short south, 12 B short, 13 B short north
    [27, -8], [20, -8], [30, 6], // 14 site B, 15 B entry, 16 B back
    [-12, 10], [12, 10], // 17 connector west, 18 connector east
    [-20, 20], [20, 20], [-20, -20], [20, -20], // 19-22 yards
    [-14, -12], [14, -12], // 23 A yard, 24 B yard
  ];
  const wpEdges = [
    [0, 2], [0, 19], [0, 20], [2, 3], [2, 17], [2, 18], [3, 4], [3, 9], [3, 15], [3, 23], [3, 24],
    [4, 1], [4, 7], [4, 13], [4, 23], [4, 24], [1, 7], [1, 13], [1, 21], [1, 22],
    [5, 6], [5, 10], [5, 19], [6, 7], [6, 8], [6, 9], [7, 21], [8, 9], [8, 10], [9, 23],
    [11, 12], [11, 16], [11, 20], [12, 13], [12, 14], [12, 15], [13, 22], [14, 15], [14, 16], [15, 24],
    [17, 19], [17, 23], [18, 20], [18, 24], [19, 20], [21, 22], [23, 24],
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
      c.mat.emissive.setHex(0xff5a1e); c.mat.emissiveIntensity = 3.4;
      c.ring.material.emissive.setHex(0xff5a1e);
      c.light.color.setHex(0xff5a1e);
    } else {
      c.mat.emissive.setHex(PAL.core); c.mat.emissiveIntensity = 2.8;
      c.ring.material.emissive.setHex(PAL.core);
      c.light.color.setHex(PAL.core);
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
    step(dt, time, camX, camZ) {
      // Rain falls and recycles in a box that follows the camera.
      const pos = rainGeo.attributes.position.array;
      for (let i = 0; i < RAIN; i++) {
        pos[i * 3 + 1] -= rainSeed[i] * dt;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = 24 + Math.random() * 2;
          pos[i * 3] = camX + (Math.random() - 0.5) * 90;
          pos[i * 3 + 2] = camZ + (Math.random() - 0.5) * 70;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      // Cores hover and spin slowly; the ring breathes.
      for (const site of ['A', 'B']) {
        const c = cores[site];
        c.core.rotation.y += dt * 0.8;
        c.core.position.y = 1.7 + Math.sin(time * 1.6 + (site === 'A' ? 0 : 2)) * 0.12;
        const pulse = 1.9 + Math.sin(time * 2.4) * 0.5;
        c.ring.material.emissiveIntensity = pulse;
        c.light.intensity = 12 + Math.sin(time * 2.4) * 3;
      }
    },
  };
}
