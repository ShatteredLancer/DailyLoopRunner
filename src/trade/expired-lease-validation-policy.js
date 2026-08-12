export function requireExpiredLeaseValidationJob(snapshot = {}) {
  const armed = (snapshot.jobs || []).filter((job) => (
    job.enabled === true && job.armed === true && job.schedule?.type !== 'manual'
  ));
  if (armed.length !== 1) throw new Error('Exactly one armed Trade Job is required');
  const job = armed[0];
  if (job.type !== 'listing') throw new Error('Expired Lease validation requires a Listing Job');
  if (job.schedule?.type !== 'once') throw new Error('Expired Lease validation requires a once Job');
  if (!Array.isArray(job.policy?.sources)
    || job.policy.sources.length !== 1
    || job.policy.sources[0] !== 'club') {
    throw new Error('Expired Lease validation requires a Club-only Job');
  }
  if (Number(job.policy?.maxListings) !== 1) {
    throw new Error('Expired Lease validation requires maxListings=1');
  }
  if (job.policy?.expiredPolicy !== 'skip') {
    throw new Error('Expired Lease validation requires expiredPolicy=skip');
  }
  return job;
}
