# Changelog

All notable user-facing changes are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.8.2] - 2026-08-18

### Fixed

- Continued the Rolling Loop through an enabled Storage-pressure SBC when a
  pending Required Special reward cannot open because primary-pack duplicates
  exceed the available SBC Storage slots.
- Preserved the existing fail-closed behavior when Storage-pressure recovery is
  disabled, unavailable, or does not make independently verified progress.

## [0.8.1] - 2026-08-18

### Added

- Configurable Storage-pressure recovery with `Off`, `Automatic`, and
  `Selected SBC` modes for dynamically discovered high-rating Player Pick or
  direct Player SBCs.
- A lightweight Storage-pressure SBC catalog that preserves stable Set
  selection and deep-validates only the selected direct Player contract.
- Base-player `databaseId` snapshots and validation across EA inventory,
  deterministic rating selection, and final saved-squad inspection.

### Changed

- Generic Storage-pressure recovery submits one supported 87+ squad at a time,
  prioritizes Unassigned and Storage materials, and defers remaining squads to
  a later pressure event.
- Dynamic SBC discovery now recognizes direct Player rewards while excluding
  unvalidated Picks and scanned contracts without a supported 87+ squad.
- Rolling Selection Policy and documentation now distinguish automatic legacy
  recovery from an explicitly selected Storage-pressure SBC.

### Fixed

- Prevented two different card versions of the same base player from entering
  one rating SBC squad; conflicts are replanned without discarding required
  special-card roles.
- Reused and synchronized preloaded multi-Challenge squads after the first
  Storage-pressure submission, avoiding stale second-squad `466` failures.
- Prevented low-cost 83+/84+/87+ Pick contracts from remaining in the Selected
  SBC list after their Challenge metadata was rejected.
- Replaced the legacy `[BronzeLoop]` console prefix with `[DailyLoopRunner]`.

## [0.8.0] - 2026-08-17

### Added

- Dynamic `10x 85+ Upgrade Rolling Loop` discovery with live Challenge
  requirements, inventory bootstrap, one-pack-at-a-time processing, and
  configurable completion limits.
- Inventory Ledger, confirmed mutation deltas, low-cost runtime resource
  telemetry, and bounded Rolling Recap retention for long-running sessions.
- Role-aware exact-rating squad planning that reserves exactly one live
  Required Special and scales to large Club inventories without enumerating
  card combinations.
- Recovery workflows for existing or crafted TOTW rewards, bounded Provisions
  batches, immediate 85+ Pick and 5x80+ duplicate drains, and an optional
  sequential 89/88 95+ Storage-pressure Pick.
- Rolling Selection Policy controls for the automatic-use rating, Provisions
  reserve, shortage pack batch size, proactive surplus crafting, reward timing,
  and the optional Storage sink.
- A user-facing Rolling Loop guide with workflow and material-circulation
  diagrams, pack-opening rules, recovery behavior, and Stop/Resume guidance.

### Changed

- Dynamic SBC scanning uses incremental multi-pass recovery and only exposes
  Rolling when the current 10x85+ reward and single Required Special contract
  are fully supported.
- Rating planning now builds deterministic recipes from rating histograms and
  reuses bounded cache entries instead of searching card-instance combinations.
- Provisions made for Storage pressure remain unopened; historical Provisions
  are opened only after a real fodder shortage, in configurable batches that
  replan before continuing.
- Main-pack duplicates at or below the automatic-use threshold now feed the
  next primary squad first. Cards released to normalize the target rating are
  routed to Storage after submission.
- Player Pick tie handling automatically resolves safe equal-rating choices and
  only requests review when protected top choices exceed the available slots.

### Fixed

- Reconciled successful pack opens whose transport wrapper reports `471` or
  `500`, while retaining fail-closed checks for missing or ambiguous item
  materialization.
- Prevented stale Store catalog entries from being reopened as My Packs
  rewards and made retry decisions depend on repository and inventory evidence.
- Kept same-definition cards with different ratings, rarity flags, or Evolution
  versions from being misclassified as duplicate cleanup targets.
- Resumed pending Unassigned cards and partially completed 95+ Storage Picks
  before opening another primary reward.
- Prevented Storage-pressure recovery from repeatedly crafting Provisions that
  do not consume enough Storage cards to release the required slots.

### Safety Boundaries

- Club TOTS, FOF, FUTTIES, protected high-rated cards, FSU-locked cards, and
  uncertain item identities remain unavailable to automatic Rolling recovery.
- Club contributes only TOTW to the primary Required Special role; each primary
  squad is validated to contain exactly one matching special card.
- `Craft surplus Provisions/TOTW` and `Use 95+ Storage pressure Pick` remain
  opt-in. Disabling them does not disable recovery required by a real shortage.
- A Stop request waits for the current committed pack, submission, routing, and
  ledger reconciliation boundary before ending the session.

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
