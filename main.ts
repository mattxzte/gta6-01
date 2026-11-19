// main.ts — SOLMAR HEAT II entrypoint (Node 22).
// Copies game/ and screenshots/ from this repository to the output directory
// and writes /output/dossier.json with buildDossier from the kit's vendored
// library (vendor/makefun-game.ts, unchanged). Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');
if (!existsSync(gameSrc)) throw new Error('main.ts: game/ is missing from the repository');
if (!existsSync(shotsSrc)) throw new Error('main.ts: screenshots/ is missing from the repository');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });

const dossier = await buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('SOLMAR HEAT II handed in: game/ + screenshots/ + dossier.json in ' + outDir);
