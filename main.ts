// OPERATION ZERO — the entry program (Node 22, standard library only).
// It hands the game in: copies game/ and screenshots/ from beside this
// file to /output and writes /output/dossier.json with the kit's
// buildDossier library, exactly as the gate expects. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program runs twice and both runs must write the same bytes, so it
// does no work that depends on the clock or the environment: a plain copy
// and a deterministic dossier build.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Pre-flight: fail fast with a plain message when the entry is incomplete,
// instead of surfacing the dossier library's error from deep inside it.
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('main.ts: game/index.html is missing — the game is not built');
}
const shotDir = join(here, 'screenshots');
const shots = existsSync(shotDir)
  ? readdirSync(shotDir).filter((f) => !f.startsWith('.'))
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`main.ts: screenshots/ must hold 3 or 4 images, found ${shots.length}`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files, in all: game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

// A one-line receipt for the submit flow: what went in and how big it is.
// The dossier itself is deterministic, so this log is the only output that
// varies — and it goes to stdout, never into /output.
const gameFiles = readdirSync(gameDir, { recursive: true });
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(
  `OPERATION ZERO handed in: ${gameFiles.length} game files, ${shots.length} screenshots, dossier.json ${dossierBytes} bytes -> ${out}`,
);
