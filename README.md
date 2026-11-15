# OPERATION ZERO — Tactical FPS

A round-based tactical first-person shooter in Blackwater Foundry, built
with three.js 0.187.0 from static files — no build step, no network, no
server. Single-player against 9 bots.

## The game

Two teams, five against five. The **Wardens** defend the two charge sites
(Foundry and Silos); the **Breachers** plant the Demolition Charge. Rounds
are won by elimination, detonation or defusal; first to 8 rounds takes the
match, with sides switching after round 7. Money earned each round buys
weapons and gear in the buy menu — and losing pays more on a streak
($1,900, then $2,400, $2,900, $3,400), so saving for a full buy is a real
choice against forcing one. Weapons survive a round their owner survives.

- **Map** — Blackwater Foundry: Site A (brick foundry with a big furnace),
  Site B (pale silos and pipes), mid (faded-colour container yard), A Long,
  B Short, a connector and a bright overcast yard, built from primitive
  geometry with instanced props, oil stains, rust, peeling paint and
  painted signage (FOUNDRY / SILO, warehouse numbers, forklift lanes).
- **Gunplay** — hitscan raycasting with headshot multipliers, recoil and
  spread that punish firing on the move, crouching, jumping, acceleration
  and map collision. Four weapons (pistol, SMG, rifle, sniper), smoke and
  flash grenades.
- **Bots** — a finite-state machine over a waypoint graph (A\*). They see
  through a vision cone and line of sight (smoke blocks it), hear gunshots,
  remember last-seen positions, hold sites, push lanes, flash entries,
  throw smoke and plant/defuse the charge. One breacher carries the charge
  and commits to the site with an escort; the charge is picked up at once
  when its carrier falls. After a plant the attackers hold the site and
  the defenders retake, the closest defusing while the rest cover.
  Factual callouts announce the push, a dropped charge, a plant and a
  defuse. They never know where you are except through perception.
- **HUD** — health, armour, ammunition, round timer, score, money, kill
  feed, callouts, buy menu, scoreboard, damage direction and flash effects.

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
