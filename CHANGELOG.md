# Changelog

All notable user-facing changes are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.7.91] - 2026-08-12

### Added

- Guarded scheduling for up to three independently authorized Buy, Club
  Listing, or Transfer Reprice Jobs.
- Persistent run correlation across Scheduler history, authorization, Lease,
  Listing/Buy Journal, request-budget waits, and page reloads.
- Fail-closed Recovery review with evidence hashes, bounded audit history, and
  explicit acknowledgement for unknown Journals or expired Leases.
- Deterministic multi-Job soak, overlapping-tick, recovery-boundary, and
  cross-tab locking coverage.

### Changed

- Daily and Interval Jobs can consume two explicitly authorized occurrences;
  Once and Window Jobs remain limited to one.
- Scheduler preflight, Recovery checks, authorization consumption, Job
  selection, and execution-result handling now run inside the shared Scheduler
  lock and persistent Trade Lease boundary.
- Scheduler dialogs refresh external state without retaining stale local action
  messages.

### Fixed

- Prevented an overlapping Scheduler tick from treating the active Job's
  matching in-flight Journal as an unknown mutation and globally relocking
  unrelated Jobs.
- Preserved remaining recurring authorization and next-run timing across F5
  reloads while preventing duplicate run IDs or scheduled occurrences.
- Ensured expired Lease takeover remains two-phase and cannot clear uncertain
  mutation evidence before an audited terminal result exists.

### Safety Boundaries

- Trade mutations still require an authenticated EA page and explicit guarded
  authorization. Closing the page or browser does not provide background
  trading.
- Rare Gold Buy remains capped at four cards and four contiguous ratings;
  Listing/Reprice remains capped at four cards, and only three Jobs may be
  armed.
- Automatic bidding, Quick Sell, mixed Listing sources, bulk relist,
  server-side trading, and automatic unknown-Journal acknowledgement remain
  unsupported.
- Rollback point: `0.7.84`.

## [0.7.0] - Unreleased

### Added

- Production Tampermonkey identity and GitHub Release update endpoints.
- Lightweight `.meta.js` update assets for DailyLoopRunner and FSU Local.
- Immutable tag-driven Releases with SHA256 checksums.
- FSU Local `26.09.1`, maintained from the immutable FSU `26.09` baseline.
- MIT licensing, third-party notices, security guidance, and issue templates.

### Changed

- Simplified the root README and moved detailed usage, troubleshooting, and
  development guidance into `docs/`.
- Restricted remote ntfy notifications to the metadata-authorized ntfy.sh
  service.
- Removed localhost network permissions from the production Runner; the
  dedicated Hot Reload userscript retains local development access.

### Migration

- The production script has a new Tampermonkey name and namespace. Treat it as
  a new installation and disable or remove the old Validation script.
