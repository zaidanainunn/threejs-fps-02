// Effects: pooled tracers, impact sparks, muzzle light and the smoke clouds
// that block bot vision. Everything is pre-allocated — the hot loop never
// creates a mesh, a material or a vector.
import * as THREE from 'three';

export function createFx(scene) {
  // --- Tracers: 32 reusable line segments ---
  const TRACERS = 32;
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false; line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;
  function tracer(from, to, color = 0xffe9a8) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACERS;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.12;
    t.line.material.color.setHex(color);
  }

  // Hide every tracer instantly (used by the staged screenshot poses so
  // no shot fired during the settle is still visible in the frame).
  function clearTracers() {
    for (const t of tracers) { t.line.visible = false; t.life = 0; }
  }

  // --- Impact sparks: one Points cloud, 240 particles, ring-buffered ---
  const SPARKS = 240;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffc46a, size: 0.12, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;
  function burst(point, normal, count = 10, spread = 3.2) {
    for (let n = 0; n < count; n++) {
      const i = sparkNext; sparkNext = (sparkNext + 1) % SPARKS;
      sparkPos[i * 3] = point.x; sparkPos[i * 3 + 1] = point.y; sparkPos[i * 3 + 2] = point.z;
      sparkVel[i * 3] = normal.x * 2 + (Math.random() - 0.5) * spread;
      sparkVel[i * 3 + 1] = normal.y * 2 + Math.random() * spread * 0.7;
      sparkVel[i * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * spread;
      sparkLife[i] = 0.35 + Math.random() * 0.25;
    }
  }

  // --- Muzzle light: one point light, flashed on every shot ---
  const muzzleLight = new THREE.PointLight(0xffc46a, 0, 7, 1.8);
  scene.add(muzzleLight);
  function muzzle(point) {
    muzzleLight.position.copy(point);
    muzzleLight.intensity = 10;
  }

  // --- Smoke clouds: up to 6, each a translucent sphere + a slow spin ---
  const smokes = [];
  const smokeGeo = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9aa0a0, transparent: true, opacity: 0, roughness: 1, metalness: 0, depthWrite: false,
    });
    const mesh = new THREE.Mesh(smokeGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    smokes.push({ mesh, x: 0, y: 0, z: 0, r: 0, life: 0, maxLife: 0, active: false });
  }
  function addSmoke(x, y, z, r = 3.4, life = 16) {
    const s = smokes.find((c) => !c.active) || smokes[0];
    s.active = true; s.x = x; s.y = y; s.z = z; s.r = r; s.life = life; s.maxLife = life;
    s.mesh.visible = true;
    s.mesh.position.set(x, y, z);
    s.mesh.scale.setScalar(0.4);
  }
  function smokeList() { return smokes.filter((s) => s.active); }

  // --- Flash burst: a light at the pop point; the HUD does the white-out ---
  const flashLight = new THREE.PointLight(0xffffff, 0, 22, 1.4);
  scene.add(flashLight);
  function flashBurst(x, y, z) {
    flashLight.position.set(x, y, z);
    flashLight.intensity = 60;
  }

  function step(dt) {
    for (const t of tracers) {
      if (!t.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
    let anySpark = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) continue;
      anySpark = true;
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 9 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkPos[i * 3 + 1] < 0.02) { sparkPos[i * 3 + 1] = 0.02; sparkVel[i * 3 + 1] *= -0.3; }
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 500);
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
    for (const s of smokes) {
      if (!s.active) continue;
      s.life -= dt;
      const grow = 1 - Math.max(0, s.life / s.maxLife);
      const scale = s.r * (0.4 + 0.6 * Math.min(1, grow * 3));
      s.mesh.scale.setScalar(scale);
      s.mesh.material.opacity = 0.55 * Math.min(1, s.life / 3, (s.maxLife - s.life) / 1.5 + 0.2);
      s.mesh.rotation.y += dt * 0.25;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; }
    }
  }

  return { tracer, burst, muzzle, addSmoke, smokeList, flashBurst, step, clearTracers };
}
