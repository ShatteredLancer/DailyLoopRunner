import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fsuDir = join(repoRoot, 'FSU_mod');
const originPath = join(fsuDir, '【FSU】EAFC FUT WEB 增强器-26.09_origin.user.js');
const modifiedPath = join(fsuDir, '【FSU】EAFC FUT WEB 增强器-26.09_mod.user.js');
const patchPath = join(fsuDir, 'FSU-26.09-club-cache-optimization.patch');
const manifestPath = join(fsuDir, 'fsu-mod-manifest.json');
const replayName = 'FSU.user.js';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const allowed = options.allowedStatuses || [0];
  if (!allowed.includes(result.status)) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}${output ? `\n${output}` : ''}`);
  }
  return result;
}

function readVersion(path) {
  const match = readFileSync(path, 'utf8').match(/^\/\/\s*@version\s+([^\s]+)\s*$/m);
  if (!match) throw new Error(`No userscript @version found in ${path}`);
  return match[1];
}

function normalizePatchHeaders(rawPatch) {
  const lines = rawPatch.replace(/\r\n/g, '\n').split('\n');
  const diffIndex = lines.findIndex((line) => line.startsWith('diff --git '));
  const oldIndex = lines.findIndex((line) => line.startsWith('--- '));
  const newIndex = lines.findIndex((line) => line.startsWith('+++ '));
  if (diffIndex < 0 || oldIndex < 0 || newIndex < 0) {
    throw new Error('Generated FSU diff is missing standard Git patch headers');
  }
  lines[diffIndex] = `diff --git a/${replayName} b/${replayName}`;
  lines[oldIndex] = `--- a/${replayName}`;
  lines[newIndex] = `+++ b/${replayName}`;
  return lines.join('\n');
}

const originVersion = readVersion(originPath);
const modifiedVersion = readVersion(modifiedPath);
if (originVersion !== modifiedVersion) {
  throw new Error(`FSU version mismatch: origin ${originVersion}, modified ${modifiedVersion}`);
}

const diff = run(
  'git',
  ['diff', '--no-index', '--binary', '--no-ext-diff', '--', originPath, modifiedPath],
  { allowedStatuses: [1] },
);
const patch = normalizePatchHeaders(diff.stdout);
writeFileSync(patchPath, patch, 'utf8');

const replayDir = mkdtempSync(join(tmpdir(), 'fsu-patch-replay-'));
try {
  const replayPath = join(replayDir, replayName);
  copyFileSync(originPath, replayPath);
  const gitApplyPrefix = ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'apply'];
  run('git', [...gitApplyPrefix, '--check', '--whitespace=nowarn', patchPath], { cwd: replayDir });
  run('git', [...gitApplyPrefix, '--whitespace=nowarn', patchPath], { cwd: replayDir });
  run(process.execPath, ['--check', replayPath], { cwd: replayDir });
  const replayHash = sha256(replayPath);
  const modifiedHash = sha256(modifiedPath);
  if (replayHash !== modifiedHash) {
    throw new Error(`Replayed FSU hash ${replayHash} does not match modified hash ${modifiedHash}`);
  }
} finally {
  rmSync(replayDir, { recursive: true, force: true });
}

const manifest = {
  schema: 1,
  upstreamVersion: originVersion,
  originFile: basename(originPath),
  modifiedFile: basename(modifiedPath),
  patchFile: basename(patchPath),
  patchTargetPath: replayName,
  originSha256: sha256(originPath),
  modifiedSha256: sha256(modifiedPath),
  patchSha256: sha256(patchPath),
  generator: 'scripts/generate-fsu-patch.mjs',
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Generated ${patchPath}`);
console.log(`Verified replay SHA256 ${manifest.modifiedSha256}`);
console.log(`Wrote ${manifestPath}`);
