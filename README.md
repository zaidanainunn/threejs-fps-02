# OPERATION ZERO — Tactical FPS

A round-based tactical first-person shooter in the Industrial Zone, built
with three.js 0.187.0 from static files — no build step, no network, no
server. Single-player against 9 bots.

## The game

Two teams, five against five. The **Wardens** defend the two Pulse Cores;
the **Breachers** plant them. Rounds are won by elimination, detonation or
defusal; first to 8 rounds takes the match, with sides switching after
round 4. Money earned each round buys weapons and gear in the buy menu.

- **Map** — the Industrial Zone: Site A (foundry), Site B (silos), mid,
  A Long, B Short, a connector and a dusk-lit yard, built from primitive
  geometry with instanced props, fog, rain and emissive strip lighting.
- **Gunplay** — hitscan raycasting with headshot multipliers, recoil and
  spread that punish firing on the move, crouching, jumping, acceleration
  and map collision. Four weapons (pistol, SMG, rifle, sniper), smoke and
  flash grenades.
- **Bots** — a finite-state machine over a waypoint graph (A\*). They see
  through a vision cone and line of sight (smoke blocks it), hear gunshots,
  remember last-seen positions, hold sites, push lanes, throw smoke and
  plant/defuse the core. They never know where you are except through
  perception.
- **HUD** — health, armour, ammunition, round timer, score, money, kill
  feed, buy menu, scoreboard, damage direction and flash effects.

## Play

```sh
node serve.ts
# open http://localhost:8080 — click to deploy
```

Keys: WASD move, mouse look, click fire, R reload, 1–4 weapons, G smoke,
F flash, E plant/defuse (hold), B buy menu, Shift walk, Ctrl crouch,
Space jump, Tab scoreboard.

## Screenshots

Deterministic poses for capture: `?shot=menu|cover|objective|buy&seed=1`
renders the pose, paints it twice and sets `window.__shotReady`.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the kit's `buildDossier` library.

## License

MIT — see LICENSE.
