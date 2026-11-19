// SOLMAR HEAT — entrypoint (Node 22, standard library only).
// Hands the game in: copies game/ and screenshots/ from beside this file to
// /output (or $MAKEFUN_OUTPUT_DIR outside the grader) and writes
// /output/dossier.json with the vendored make.fun library, which the judge
// reads. The caps below mirror the sealed gate's limits, so a build that
// passes here is shaped to pass there.
//
// Run it locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's numbers for this competition (see the kit's reference/gate.json):
// game/ at most 993 files and 48 MiB, index.html at most 1 MiB, 3-4 screenshots
// at most 256 KiB each, dossier text at most 160 KiB.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  console.error('main.ts: ' + message);
  process.exit(1);
}

function countFiles(dir) {
  let files = 0, bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) { const sub = countFiles(p); files += sub.files; bytes += sub.bytes; }
    else if (name.isFile()) { files += 1; bytes += statSync(p).size; }
    else fail('game/ holds a non-file entry: ' + p);
  }
  return { files, bytes };
}

const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
const indexSize = statSync(join(gameDir, 'index.html')).size;
if (indexSize > 1048576) fail('game/index.html is ' + indexSize + ' bytes, over the 1 MiB cap');

const tally = countFiles(gameDir);
if (tally.files > CAPS.game_max_files) fail('game/ holds ' + tally.files + ' files, over the 993 cap');
if (tally.bytes > CAPS.game_max_bytes) fail('game/ is ' + tally.bytes + ' bytes, over the 48 MiB cap');

const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
  fail('screenshots/ holds ' + shots.length + ' images, need 3 or 4');
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > CAPS.screenshots.max_bytes) fail('screenshots/' + name + ' is ' + size + ' bytes, over 256 KiB');
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
console.log('SOLMAR HEAT handed in: ' + tally.files + ' game files (' + tally.bytes + ' bytes), ' +
  shots.length + ' screenshots, dossier written to ' + join(out, 'dossier.json'));
