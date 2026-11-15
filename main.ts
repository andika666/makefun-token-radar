// Token Radar's program: one sealed snapshot in, one ranked board, one dashboard and one
// dossier out. Node 22, standard library only.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//
// The output directory holds board.json (the ranked board), data.js (the dashboard's data,
// written beside dashboard/), dashboard/ and screenshots/ (copies of this repository's own),
// and dossier.json (buildDossier's dossier of that dashboard and those screenshots, written
// last so it covers everything else in the output).

import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The caps the dossier is built under: the gate rebuilds with these same caps. */
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};

/** The snapshot's path: --input names a file or the directory holding snapshot.json. */
function inputPath(): string {
  const at = process.argv.indexOf('--input');
  const raw = at >= 0 ? process.argv[at + 1] : undefined;
  const path = raw ?? '/input/snapshot.json';
  if (existsSync(path) && statSync(path).isDirectory()) return join(path, 'snapshot.json');
  return path;
}

function main(): void {
  const input = inputPath();
  if (!existsSync(input)) {
    throw new Error(
      `token radar: no snapshot at ${input}: pass --input <snapshot.json|directory> or mount the sealed /input`,
    );
  }
  const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const root = new URL('.', import.meta.url).pathname;

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);

  mkdirSync(join(out, 'dashboard'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));
  cpSync(join(root, 'dashboard'), join(out, 'dashboard'), { recursive: true });
  cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));

  console.log(`token radar: ${board.length} rows, ${radar.live_size} live tokens, wrote ${out}`);
}

main();
