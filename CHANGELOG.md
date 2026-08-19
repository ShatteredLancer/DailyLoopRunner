# Changelog

All notable user-facing changes are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.8.13] - 2026-08-19

### Fixed

- Routed non-required duplicate specials to SBC Storage whenever the live
  primary Challenge reserves every special slot for its exact Required Special
  condition. This prevents unrelated opened specials from becoming impossible
  required items in the no-special TOTW recovery squad and falsely stopping
  the Rolling Loop with `REQUIRED_ITEM_UNAVAILABLE`.

## [0.8.12] - 2026-08-19

### Fixed

- Preserved the exact Club or Storage pile while checking a newly opened
  duplicate's submission target, so protected Club non-TOTW specials are
  routed to SBC Storage before primary or Required Special recovery planning
  instead of causing a false `REQUIRED_ITEM_UNAVAILABLE` stop.

## [0.8.11] - 2026-08-19

### Added

- Added an opt-in Rolling policy that hard-protects every Club non-TOTW
  special card across primary, recovery, and Storage-pressure SBC squads.
- Added a shared pre-open capacity gate for existing and newly crafted
  Provisions, 5x80+, and Required Special recovery rewards.

### Changed

- Recovery reward opening now resolves full Storage through the configured
  Storage-pressure SBC, reconciles inventory, and retries the same pack rather
  than opening another reward into blocked Unassigned items.
- Club Other Specials retain their existing last-resort fallback when strict
  protection is disabled; Storage, Transfer, and Unassigned specials remain
  governed by the existing rating and role rules.

### Fixed

- Preserved the actual submission pile while resolving Unassigned and Transfer
  duplicate signals, preventing a signal from disguising a protected Club
  non-TOTW special as a non-Club candidate.
- Kept blocked recovery rewards unopened when Storage-pressure recovery is
  disabled or cannot release independently verified capacity.

## [0.8.10] - 2026-08-18

### Added

- Added dynamic Storage Sink challenge selection for supported high-rating
  Player Picks and direct Player SBCs, including live Required Special role
  parsing and source-aware Club fallback.
- Added bounded Storage Sink admission diagnostics covering candidate
  eligibility, duplicate targets, protection decisions, live EA entity
  resolution, and failure reasons.

### Changed

- Reused the primary Rolling challenge after Storage Sink and Required Special
  recovery instead of reloading an already active squad.
- Preserved protected primary duplicates while allowing explicitly required
  special cards to be consumed by the selected Storage Sink challenge.
- Added deterministic multi-squad rating selection and regression coverage for
  Unassigned, Storage, Transfer, Club, and live EA requirement entities.

## [0.8.5] - 2026-08-18

### Fixed

- Routed newly opened duplicate signals to SBC Storage when their exact EA
  `duplicateId` submission target is unavailable or protected, instead of
  reserving an impossible mandatory primary-squad item and stopping with
  `REQUIRED_ITEM_UNAVAILABLE`.
- Applied the same exact-target safety check when resuming a Rolling session
  with existing Unassigned duplicates.

## [0.8.4] - 2026-08-18

### Fixed

- Preserved exact Rolling primary duplicate items as their player-version
  candidate representatives after they move into SBC Storage, preventing
  same-definition inventory copies from causing a false
  `REQUIRED_ITEM_UNAVAILABLE` stop after Required Special recovery.

## [0.8.3] - 2026-08-18

### Fixed

- Reused and synchronized the already-loaded Rolling primary Challenge squad
  after Provisions or Required Special recovery submissions, avoiding EA `466`
  failures caused by immediately loading the same Challenge squad again.

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
