// The local gate: the seven rows from the kit's RULES.txt, replicated here so the build is
// checked before it is handed in. Runs main.ts twice (determinism) and then checks the output.
// Usage: node scripts/gate.mjs --input <snapshot.json>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';
import { parseSnapshot, boardIssue } from '../lib/model.ts';

const input = process.argv.includes('--input') ? process.argv[process.argv.indexOf('--input') + 1] : '/input/snapshot.json';
const out1 = '/tmp/radar-gate-a';
const out2 = '/tmp/radar-gate-b';
const here = new URL('..', import.meta.url).pathname;

const results = [];
function row(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

for (const out of [out1, out2]) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  execFileSync('node', ['main.ts', '--input', input], { cwd: here, env: { ...process.env, MAKEFUN_OUTPUT_DIR: out }, stdio: 'pipe' });
}

// 0. Determinism: two runs write identical bytes.
function tree(dir) {
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p.slice(dir.length + 1));
    }
  })(dir);
  return files.sort();
}
const t1 = tree(out1);
const t2 = tree(out2);
let detOk = JSON.stringify(t1) === JSON.stringify(t2);
if (detOk) for (const f of t1) if (!readFileSync(join(out1, f)).equals(readFileSync(join(out2, f)))) { detOk = false; break; }
row('determinism: two runs write identical bytes', detOk, `${t1.length} files`);

const out = out1;
const snapshot = parseSnapshot(readFileSync(input, 'utf8'));

// 1. Dashboard shape: <=400 files / 4 MiB, index.html + >=1 css + >=1 js.
const dashDir = join(out, 'dashboard');
const dashFiles = existsSync(dashDir) ? readdirSync(dashDir).filter((n) => statSync(join(dashDir, n)).isFile()) : [];
const dashBytes = dashFiles.reduce((s, n) => s + statSync(join(dashDir, n)).size, 0);
const hasHtml = dashFiles.includes('index.html');
const hasCss = dashFiles.some((n) => n.endsWith('.css'));
const hasJs = dashFiles.some((n) => n.endsWith('.js'));
row('dashboard <=400 files / 4 MiB, index.html + css + js', dashFiles.length <= 400 && dashBytes <= 4_194_304 && hasHtml && hasCss && hasJs, `${dashFiles.length} files, ${dashBytes} bytes`);

// 2. No network: no http/https in dashboard source at all (stricter than the gate's attribute rule).
let netHit = null;
for (const n of dashFiles) {
  const text = readFileSync(join(dashDir, n), 'utf8');
  if (text.includes('http://') || text.includes('https://') || /fetch\s*\(|XMLHttpRequest|WebSocket|@import|url\s*\(/.test(text)) { netHit = n; break; }
}
row('dashboard makes no network call', netHit === null, netHit ? `found in ${netHit}` : 'no http/fetch/import/url()');

// 3. Dashboard source <=64 KiB (the dossier's text cap).
row('dashboard source <= 64 KiB', dashBytes <= 65_536, `${dashBytes} bytes`);

// 4. Board: 100..4000 rows, <=8 MiB, ranks 1..N, implied non-rising, watchlist covered, farm steps.
const boardPath = join(out, 'board.json');
const boardBytes = statSync(boardPath).size;
const board = JSON.parse(readFileSync(boardPath, 'utf8')).rows;
const issue = boardIssue(board, snapshot);
row('board 100..4000 rows, <=8 MiB, ranks 1..N, implied non-rising, watchlist covered, farm steps 3..12 x 20..600 chars',
  board.length >= 100 && board.length <= 4000 && boardBytes <= 8_388_608 && issue === null,
  `${board.length} rows, ${boardBytes} bytes${issue ? `; ${issue}` : ''}`);

// 5. Screenshots: 3..4, each <=512 KiB, long side <=1440, short side >=800.
const shotDir = join(out, 'screenshots');
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((n) => statSync(join(shotDir, n)).isFile()) : [];
function pngSize(buf) {
  if (buf.length < 33 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
let shotOk = shots.length >= 3 && shots.length <= 4;
let shotDetail = shots.map((n) => {
  const buf = readFileSync(join(shotDir, n));
  const size = pngSize(buf);
  const dims = size ? `${size.w}x${size.h}` : 'not a png';
  if (buf.length > 524_288) shotOk = false;
  if (!size || Math.max(size.w, size.h) > 1440 || Math.min(size.w, size.h) < 800) shotOk = false;
  return `${n} ${buf.length} B ${dims}`;
}).join('; ');
row('screenshots 3..4, each <=512 KiB, long side <=1440, short side >=800', shotOk, shotDetail || 'none');

// 6. Dossier: <=1.5 MiB and byte-identical to a rebuild from this output.
const dossierPath = join(out, 'dossier.json');
const dossierBytes = statSync(dossierPath).size;
const rebuilt = buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
const dossierText = readFileSync(dossierPath, 'utf8');
const dossierOk = dossierBytes <= 1_572_864 && Buffer.from(rebuilt).toString('utf8') === dossierText;
row('dossier <=1.5 MiB and byte-identical to rebuild', dossierOk, `${dossierBytes} bytes${Buffer.from(rebuilt).toString('utf8') === dossierText ? '' : '; rebuild differs'}`);

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? `gate: all ${results.length} rows PASS` : `gate: ${failed} of ${results.length} rows FAIL`);
process.exit(failed === 0 ? 0 : 1);
