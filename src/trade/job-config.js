import { isPlainObject } from '../domain/objects.js';
import { normalizeTradeJob } from './contracts.js';

export const TRADE_JOB_CONFIG_KIND = 'daily-loop-runner-trade-jobs';
export const TRADE_JOB_CONFIG_SCHEMA_VERSION = 1;
export const TRADE_JOB_CONFIG_MAX_JOBS = 100;
export const TRADE_JOB_CONFIG_MAX_TEXT_LENGTH = 1_000_000;

const CONFIG_FIELDS = new Set(['kind', 'schemaVersion', 'exportedAt', 'runnerVersion', 'jobs']);
const JOB_FIELDS = new Set(['schemaVersion', 'id', 'name', 'type', 'enabled', 'schedule', 'misfirePolicy', 'policy']);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
}

function assertOnlyFields(value, fields, label) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new Error(`${label}.${key} is not supported`);
  }
}

function exportJob(input, now) {
  const job = normalizeTradeJob(input, { now });
  const policy = clone(job.policy);
  if (job.type === 'buy') delete policy.minimumRetainedCoins;
  return clone({
    schemaVersion: job.schemaVersion,
    id: job.id,
    name: job.name,
    type: job.type,
    enabled: job.enabled,
    schedule: job.schedule,
    misfirePolicy: job.misfirePolicy,
    policy,
  });
}

export function createTradeJobConfig(snapshot = {}, options = {}) {
  const exportedAt = Math.max(0, Number(options.exportedAt ?? Date.now()) || 0);
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
  if (jobs.length > TRADE_JOB_CONFIG_MAX_JOBS) {
    throw new Error(`Trade Job configuration exceeds ${TRADE_JOB_CONFIG_MAX_JOBS} Jobs`);
  }
  return {
    kind: TRADE_JOB_CONFIG_KIND,
    schemaVersion: TRADE_JOB_CONFIG_SCHEMA_VERSION,
    exportedAt,
    runnerVersion: String(options.runnerVersion || 'unknown'),
    jobs: jobs.map((job) => exportJob(job, exportedAt)),
  };
}

export function exportTradeJobConfigJson(snapshot = {}, options = {}) {
  return JSON.stringify(createTradeJobConfig(snapshot, options), null, 2);
}

function parseInput(input) {
  if (typeof input !== 'string') return clone(input);
  if (input.length > TRADE_JOB_CONFIG_MAX_TEXT_LENGTH) {
    throw new Error(`Trade Job configuration exceeds ${TRADE_JOB_CONFIG_MAX_TEXT_LENGTH} characters`);
  }
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Trade Job configuration JSON is invalid: ${error?.message || error}`);
  }
}

export function parseTradeJobConfig(input, options = {}) {
  const value = parseInput(input);
  assertPlainObject(value, 'Trade Job configuration');
  assertOnlyFields(value, CONFIG_FIELDS, 'Trade Job configuration');
  if (value.kind !== TRADE_JOB_CONFIG_KIND) throw new Error(`Trade Job configuration kind must be ${TRADE_JOB_CONFIG_KIND}`);
  if (Number(value.schemaVersion) !== TRADE_JOB_CONFIG_SCHEMA_VERSION) {
    throw new Error(`Trade Job configuration schemaVersion must be ${TRADE_JOB_CONFIG_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(value.jobs)) throw new Error('Trade Job configuration.jobs must be an array');
  if (value.jobs.length > TRADE_JOB_CONFIG_MAX_JOBS) {
    throw new Error(`Trade Job configuration exceeds ${TRADE_JOB_CONFIG_MAX_JOBS} Jobs`);
  }

  const now = Math.max(0, Number(options.now ?? Date.now()) || 0);
  const ids = new Set();
  const jobs = value.jobs.map((raw, index) => {
    const label = `Trade Job configuration.jobs[${index}]`;
    assertPlainObject(raw, label);
    assertOnlyFields(raw, JOB_FIELDS, label);
    if (raw.type === 'buy' && Object.prototype.hasOwnProperty.call(raw.policy || {}, 'minimumRetainedCoins')) {
      throw new Error(`${label}.policy.minimumRetainedCoins is account-specific and is not supported`);
    }
    const job = normalizeTradeJob({ ...raw, armed: false, createdAt: now, updatedAt: now }, { imported: true, now });
    if (ids.has(job.id)) throw new Error(`Trade Job configuration contains duplicate id: ${job.id}`);
    ids.add(job.id);
    return job;
  });
  return {
    kind: TRADE_JOB_CONFIG_KIND,
    schemaVersion: TRADE_JOB_CONFIG_SCHEMA_VERSION,
    exportedAt: Math.max(0, Number(value.exportedAt) || 0),
    runnerVersion: String(value.runnerVersion || 'unknown'),
    jobs,
  };
}
