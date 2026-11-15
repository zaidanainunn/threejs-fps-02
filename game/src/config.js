// OPERATION ZERO — shared tuning: teams, weapons, economy, round flow.
// One place for every number the other modules read; nothing here touches the DOM.
export const CFG = {
  // Map bounds (metres). The Industrial Zone is 76 wide (x) by 56 deep (z).
  map: { halfW: 38, halfD: 28, wallH: 6 },
  eye: 1.62, // camera height above the feet
  playerRadius: 0.42,
  playerHeight: 1.75,
  gravity: 18,
  walkSpeed: 5.4,
  runSpeed: 6.4,
  crouchSpeed: 2.6,
  jumpSpeed: 6.2,
  accel: 42, // ground acceleration toward the wish velocity
  airAccel: 9,
  friction: 11,
  // Rounds: buy phase, combat timer, first to N, sides switch after this round.
  round: { buySeconds: 15, combatSeconds: 100, winScore: 8, switchAfter: 4, plantSeconds: 3.5, defuseSeconds: 5, defuseKitSeconds: 2.5, coreFuseSeconds: 40 },
  // Economy (dollars). Kill/plant/defuse bonuses stack on the round payout.
  money: { start: 800, win: 3250, loss: 1900, kill: 300, plant: 300, defuse: 300, max: 16000 },
  teams: {
    wardens: { name: 'Wardens', color: 0x35c8ff, dark: 0x1d7fb8, label: 'WARDENS' },
    breachers: { name: 'Breachers', color: 0xff9a3c, dark: 0xc96a12, label: 'BREACHERS' },
  },
  sites: {
    A: { id: 'A', name: 'Site A — Foundry', core: [-27, 0, -8] },
    B: { id: 'B', name: 'Site B — Silos', core: [27, 0, -8] },
  },
};

// Weapons: damage is per body hit at close range; headshots multiply by headMult.
// spread is the base radians of random cone; moveSpread adds while moving, airSpread in the air.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0, kind: 'pistol',
    damage: 34, headMult: 3.5, falloff: 0.55, mag: 12, reserve: 48,
    auto: false, rpm: 320, reload: 1.6, spread: 0.006, moveSpread: 0.030, airSpread: 0.05,
    recoil: 0.011, kick: 0.35, range: 60, tracer: 0xffd27a, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'VK-9 Repeater', short: 'VK-9', price: 1500, kind: 'smg',
    damage: 26, headMult: 3.2, falloff: 0.45, mag: 32, reserve: 96,
    auto: true, rpm: 780, reload: 2.1, spread: 0.013, moveSpread: 0.034, airSpread: 0.055,
    recoil: 0.008, kick: 0.28, range: 55, tracer: 0xffe9a8, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longbow', short: 'AR-77', price: 2700, kind: 'rifle',
    damage: 33, headMult: 3.8, falloff: 0.6, mag: 30, reserve: 90,
    auto: true, rpm: 600, reload: 2.4, spread: 0.004, moveSpread: 0.026, airSpread: 0.05,
    recoil: 0.014, kick: 0.5, range: 80, tracer: 0xfff2c0, sound: 'rifle',
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Longshot', short: 'LW-50', price: 4750, kind: 'sniper',
    damage: 115, headMult: 3.0, falloff: 0.85, mag: 5, reserve: 15,
    auto: false, rpm: 50, reload: 3.1, spread: 0.0008, moveSpread: 0.09, airSpread: 0.12,
    recoil: 0.05, kick: 1.4, range: 120, tracer: 0xcfe8ff, sound: 'sniper',
  },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];

export const GEAR = {
  armor: { name: 'Kevlar Vest', price: 650 },
  helmet: { name: 'Ballistic Helmet', price: 350 },
  smoke: { name: 'Smoke Canister', price: 300 },
  flash: { name: 'Flash Charge', price: 200 },
  kit: { name: 'Defuse Kit', price: 400 }, // Wardens only
};

// Bot tuning: reaction time, accuracy and aggression are per-bot jitter around these.
export const BOT = {
  count: 9, // 4 teammates + 5 enemies around the player
  hp: 100,
  viewRange: 42,
  viewHalfAngle: 1.05, // ~60 degrees each side
  hearRange: 26,
  reactMin: 0.28, // seconds from seeing an enemy to first shot
  reactMax: 0.62,
  aimError: 0.030, // radians of aim noise at 10 m, grows with distance
  burstMin: 2, burstMax: 5, // shots per burst, then a pause
  burstPause: 0.45,
  moveSpeed: 4.6,
  thinkEvery: 0.15, // perception tick, staggered per bot
  memorySeconds: 4, // how long a last-seen position stays worth investigating
  smokeAtSeconds: 18, // breachers throw their smoke this far into the round
};
