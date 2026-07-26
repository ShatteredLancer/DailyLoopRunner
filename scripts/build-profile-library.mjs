import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuilderStarterProfiles } from '../src/config/builder-profile.js';
import { validateLoopConfig } from '../src/config/loop-schema.js';
import { LOOP_DEFS } from '../src/config/loops.js';
import {
  DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
  RECOVERY_RECIPES,
  UNASSIGNED_RECOVERY_POLICIES,
} from '../src/config/recovery.js';

const PROFILE_SCHEMA_VERSION = 1;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'profiles');
const outputDir = path.join(root, 'dist', 'profiles');
const checkOnly = process.argv.includes('--check');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const builtInConfig = validateLoopConfig({
  loops: LOOP_DEFS,
  recoveryRecipes: RECOVERY_RECIPES,
  unassignedRecoveryPolicies: UNASSIGNED_RECOVERY_POLICIES,
  defaultUnassignedRecoveryPolicyIds: DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS,
}, 'Profile library built-in config');
const starterProfiles = createBuilderStarterProfiles(builtInConfig);
const starterByPreset = new Map(starterProfiles.map((profile) => [profile.preset, profile]));

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function validateDescriptor(descriptor, filename) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new Error(`${filename}: Profile descriptor must be an object`);
  }
  if (Number(descriptor.schemaVersion) !== PROFILE_SCHEMA_VERSION) {
    throw new Error(`${filename}: schemaVersion must be ${PROFILE_SCHEMA_VERSION}`);
  }
  const id = requireText(descriptor.id, `${filename}: id`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`${filename}: id must use lower-case kebab-case`);
  }
  if (filename !== `${id}.profile.json`) {
    throw new Error(`${filename}: filename must be ${id}.profile.json`);
  }
  const name = requireText(descriptor.name, `${filename}: name`);
  const description = requireText(descriptor.description, `${filename}: description`);
  const hasPreset = descriptor.preset !== undefined;
  const hasConfig = descriptor.config !== undefined;
  if (hasPreset === hasConfig) {
    throw new Error(`${filename}: exactly one of preset or config is required`);
  }
  const minimumRunnerVersion = requireText(
    descriptor.minimumRunnerVersion || packageJson.version,
    `${filename}: minimumRunnerVersion`,
  );
  const tags = descriptor.tags === undefined ? [] : descriptor.tags;
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
    throw new Error(`${filename}: tags must be an array of non-empty strings`);
  }

  let config;
  let preset = null;
  if (hasPreset) {
    preset = requireText(descriptor.preset, `${filename}: preset`);
    const starter = starterByPreset.get(preset);
    if (!starter) throw new Error(`${filename}: unknown preset ${preset}`);
    config = starter.lastKnownGood;
  } else {
    config = descriptor.config;
  }
  const validatedConfig = validateLoopConfig(config, `Profile ${id}`);
  const dynamicSnapshots = validatedConfig.loops.filter((loop) => (
    loop.discovered === true
    || loop.discoveryIdentity !== undefined
    || String(loop.id || '').startsWith('discovered-player-pick-')
  ));
  if (dynamicSnapshots.length) {
    throw new Error(`${filename}: reusable Profiles cannot contain dynamic Pick snapshots: ${dynamicSnapshots.map((loop) => loop.id).join(', ')}`);
  }
  return {
    descriptor: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      id,
      name,
      description,
      minimumRunnerVersion,
      tags: [...new Set(tags.map((tag) => tag.trim()))],
      ...(preset ? { preset } : {}),
    },
    config: validatedConfig,
  };
}

const filenames = (await readdir(sourceDir))
  .filter((filename) => filename.endsWith('.profile.json'))
  .sort((left, right) => left.localeCompare(right));
if (!filenames.length) throw new Error('Profile library contains no *.profile.json files');

const ids = new Set();
const profiles = [];
for (const filename of filenames) {
  const raw = JSON.parse(await readFile(path.join(sourceDir, filename), 'utf8'));
  const profile = validateDescriptor(raw, filename);
  if (ids.has(profile.descriptor.id)) throw new Error(`Duplicate Profile id: ${profile.descriptor.id}`);
  ids.add(profile.descriptor.id);
  profiles.push(profile);
}

const manifest = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  runnerVersion: packageJson.version,
  profiles: profiles.map(({ descriptor }) => ({
    ...descriptor,
    file: `${descriptor.id}.loops.json`,
  })),
};

if (!checkOnly) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  for (const { descriptor, config } of profiles) {
    await writeFile(
      path.join(outputDir, `${descriptor.id}.loops.json`),
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8',
    );
  }
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const lines = [
    '# DailyLoopRunner Profiles',
    '',
    `Built for DailyLoopRunner ${packageJson.version}.`,
    '',
    'Import a `.loops.json` file through Builder -> JSON validation, then Save and Activate the Profile.',
    '',
    ...manifest.profiles.map((profile) => `- **${profile.name}** (\`${profile.file}\`): ${profile.description}`),
    '',
  ];
  await writeFile(path.join(outputDir, 'README.md'), lines.join('\n'), 'utf8');
}

console.log(`${checkOnly ? 'Validated' : 'Built'} ${profiles.length} Profile(s) for DailyLoopRunner ${packageJson.version}`);
