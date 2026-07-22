import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fsuDir = join(repoRoot, 'FSU_mod');
const manifestPath = join(fsuDir, 'fsu-mod-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const originPath = join(fsuDir, manifest.originFile);
const modifiedPath = join(fsuDir, manifest.modifiedFile);
const patchPath = join(fsuDir, manifest.patchFile);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}${output ? `\n${output}` : ''}`);
  }
}

const actual = {
  originSha256: sha256(originPath),
  modifiedSha256: sha256(modifiedPath),
  patchSha256: sha256(patchPath),
};
for (const [key, value] of Object.entries(actual)) {
  if (value !== manifest[key]) {
    throw new Error(`${key} mismatch: manifest ${manifest[key]}, actual ${value}. Run npm run build:fsu-patch.`);
  }
}

const replayDir = mkdtempSync(join(tmpdir(), 'fsu-patch-check-'));
try {
  const replayPath = join(replayDir, manifest.patchTargetPath);
  copyFileSync(originPath, replayPath);
  const prefix = ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'apply'];
  run('git', [...prefix, '--check', '--whitespace=nowarn', patchPath], replayDir);
  run('git', [...prefix, '--whitespace=nowarn', patchPath], replayDir);
  run(process.execPath, ['--check', replayPath], replayDir);
  const replayHash = sha256(replayPath);
  if (replayHash !== manifest.modifiedSha256) {
    throw new Error(`Replayed FSU hash ${replayHash} does not match ${manifest.modifiedSha256}`);
  }
} finally {
  rmSync(replayDir, { recursive: true, force: true });
}

console.log(`Verified FSU ${manifest.upstreamVersion} patch replay ${manifest.modifiedSha256}`);
