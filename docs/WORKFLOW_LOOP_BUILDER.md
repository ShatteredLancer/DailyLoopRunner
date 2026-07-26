# Workflow and Loop Builder

User-facing illustrated Chinese guide: [WORKFLOW_LOOP_BUILDER_GUIDE_ZH.md](WORKFLOW_LOOP_BUILDER_GUIDE_ZH.md).

## 1. Purpose

The Builder replaces raw JSON as the primary way to create and maintain Loop Runner configurations. It must expose every behavior that the current loop JSON schema supports while preserving the existing runtime, validation, and dispatch contracts.

Raw JSON remains available for validation, import, export, and diagnostics. It is not a second configuration model and must not bypass validation before activation.

## 2. Non-goals

- Do not replace workflow runners, EA adapters, inventory selection, or pack transaction logic.
- Do not add nested workflows. `dailyRoutine` and `workflowRoutine` steps remain references to atomic Loops.
- Do not silently execute stale dynamic Player Pick snapshots.
- Keep the compact main panel limited to Profile selection, opening the Builder, cache refresh, and Pick scanning; JSON validation stays inside the Builder workspace.
- Do not make built-in definitions directly mutable.

## 3. Compatibility boundary

The effective configuration produced by the Builder must use the existing top-level shape:

```json
{
  "loops": [],
  "recoveryRecipes": [],
  "unassignedRecoveryPolicies": [],
  "defaultUnassignedRecoveryPolicyIds": []
}
```

Activation continues through the existing sequence:

1. Materialize the active Builder profile.
2. Parse and normalize it with `parseLoopConfig()`.
3. Validate it with `validateLoopConfig()`.
4. Apply it with `setLoopConfig()`.
5. Run selected definitions through the existing strategy dispatcher.

The first implementation must not require workflow runners to understand Builder profiles, sparse overrides, drafts, or UI state.

## 4. Configuration sources

Every object shown by the Builder has one source:

- **Built-in**: read-only definitions compiled into the userscript.
- **Custom**: definitions owned by a local Builder profile.
- **Override**: sparse changes applied to a built-in definition with the same stable ID.
- **Dynamic**: session Player Pick definitions produced by the existing scanner.
- **Imported**: custom definitions created by validated JSON import.

Built-in objects support View, Duplicate, and Override. They do not support direct mutation or deletion. A profile may hide a built-in object from its effective list, but the underlying built-in definition remains recoverable.

Dynamic objects are read-only snapshots. A Workflow may reference a dynamic Pick only when its stable identity can be recorded. The Builder stores Set IDs, Pick resource IDs, and the last valid definition. A later scan refreshes the effective definition. An unresolved or expired binding is marked unavailable and cannot be activated silently.

## 5. Profiles and persistence

Builder data is stored separately from runtime UI options under a versioned local-storage key. The persisted envelope contains:

```json
{
  "schemaVersion": 1,
  "activeProfileId": "default",
  "activeDynamicBindings": [],
  "profiles": [],
  "lastKnownGood": null
}
```

Each profile contains:

- Stable ID and display name.
- Custom definitions.
- Sparse built-in overrides.
- Hidden built-in IDs.
- Dynamic Pick bindings.
- Draft revision and saved revision.
- Built-in fingerprints used for update conflict detection.
- The last materialized and validated configuration.

Draft edits are auto-saved, but only an explicitly saved and validated revision can be activated. `lastKnownGood` and `activeDynamicBindings` are snapshots of the last explicit activation, so later Draft or Saved changes cannot leak into runtime during an automatic Pick rescan. Startup loads the active profile's last known good configuration. Corrupt or incompatible storage falls back to built-ins without partially applying a profile.

Every store includes two starter profiles:

- **Default**: follows the built-in configuration and inherits future built-in changes through rebase.
- **Bronze/Silver Inventory Only**: sets `inventoryMode: "inventory-only"` on configurable Loops whose target or requirements consume bronze/silver players, including Daily Bronze, Daily Silver, and Daily Common. Other configurable Loops and container Workflows are explicitly set to `normal`, so this profile remains scoped even when the main-panel global Inventory only checkbox is enabled.

Existing stores receive missing starter profiles during normalization. A user profile with the same stable ID is never overwritten.

## 6. Main panel integration

The main panel retains execution controls and common runtime options. Its Config section contains:

- **Profile**: selects Built-in, a starter profile, or a user-created profile. It applies only the profile's Saved/last-known-good revision; a dirty Draft cannot leak into runtime.
- **Open Builder**: opens the full-screen workspace.
- **Refresh caches**: retained as a recovery control after inventory changes made outside the Runner or when EA/FSU caches need explicit synchronization.
- **Scan Picks**: retained because dynamic Pick discovery, activity changes, and persisted dynamic binding recovery require a fresh session scan.

**Validate JSON**, **Import JSON**, **Built-in loops**, and **Preview Pick recap** are removed from the main panel. JSON validation/import/export remains available in the Builder. Selecting **Built-in** in the Profile control replaces the old reset button. Raw JSON cannot be started directly without successful validation and conversion into a Builder draft.

## 7. Full-screen workspace

Desktop layout uses three stable columns:

- A 260 px library containing Workflows, Loops, Recovery, and Dynamic Picks.
- A flexible central editor.
- A 340 px inspector for the selected object or Workflow step.

The top toolbar contains profile selection, dirty status, undo, redo, validate, preview, save, activate, import, export, and close commands. The bottom status bar displays source, validation state, conflict count, and active revision.

At narrow widths the workspace switches to Library, Editor, and Inspector tabs. It must not compress all three columns into an unusable layout.

## 8. Library behavior

The library is a compact searchable table, not a card grid. Each row shows:

- Name and stable ID.
- User-facing type and internal strategy.
- Built-in, Custom, Override, or Dynamic source.
- Number of Workflow references.
- Valid, Warning, Conflict, or Unavailable state.

Commands are Duplicate, Override, Reset, Delete, and Locate references. Delete is available only for custom objects and must show every affected Workflow reference before confirmation.

Renaming an object changes only its display name. Changing a stable ID is a separate migration command that updates every reference transactionally or does nothing.

## 9. Workflow editor

New user workflows use `workflowRoutine`. Duplicated compatibility workflows retain `dailyRoutine` when its daily-availability behavior is required.

The center editor renders an ordered step list. Users can:

- Add an atomic Loop from Built-in, Custom, or currently available Dynamic sources.
- Reorder steps with drag handles or move commands.
- Use the same Loop more than once.
- Rename the step display label.
- Remove a step without deleting its referenced Loop.
- Inspect the effective settings inherited by each step.

Workflow objects cannot be selected as child steps. The picker disables them and reports the existing no-nested-routine constraint.

The current step schema directly supports `loopId`, `name`, and `rewardFlow`. When a user customizes other settings for one step, the Builder creates a private Step Variant Loop and points that step at the variant. This makes per-step customization available without changing the runtime schema. Private variants remain visible under the owning Workflow and can be promoted to normal custom Loops.

Legacy `dailyRoutine.stepOverrides` are imported and preserved. New generic Workflows use Step Variants instead.

## 10. Loop editor

Every Loop editor begins with common fields:

- Name, stable ID, visibility, and MVP state.
- User-facing template and internal strategy.
- Runtime quantity policy.
- Reward flow.
- Inventory mode and pile restrictions.
- Player Pick options where supported.
- Unassigned recovery policies.
- Submission rating and special-card safety limits.

Strategy-specific editors cover the full current registry:

| Template | Strategies | Required editors |
| --- | --- | --- |
| Validation recycle | `validationBronzeUpgrade` | SBC aliases, target duplicate, validation runs |
| Single-card recycle | `dailySingleCardRecycle` | SBC aliases, reward packs, target duplicate, daily limit |
| Supply and craft | `supplyAndCraft`, `inventoryMixedUpgrade`, `commonGoldToRareUpgrade` | Requirements, pile order, shortage packs, reward packs |
| Fill SBC | `fillAndVerifySbc` | Requirements or rating solver, automatic fodder/TOTW recovery, limits |
| Player Pick | `playerPickSbc` | Scan binding, candidates, selected count, challenge requirements, Pick behavior |
| Provision crafting | `provisionPackCrafting`, `provisionPackDualCrafting` | Source packs, pre-craft Pick, ordered upgrades, rounds |
| Pack to upgrade | `rarePackTo84Upgrade` | Source packs, upgrade definition, fallback Loop, pack limits |
| Inventory exhaustion | `inventoryExhaustion` | Ordered upgrade stages and per-stage limits |
| Workflow | `dailyRoutine`, `workflowRoutine` | Ordered referenced steps and inherited settings |

Unsupported legacy fields are preserved in the draft and surfaced in Advanced diagnostics. Saving through the visual editor must not drop them.

## 11. Reusable editors

### 11.1 Card requirement

Requirements use a row editor with tier swatches, rarity segments, count steppers, minimum and maximum rating, allow-special, protect-high-gold, prefer-common, and ordered pile priority.

The editor is shared by `requirements`, `challengeRequirements`, crafting upgrades, exhaustion stages, shortage packs, and rating recovery helpers.

### 11.2 Inventory piles

Pile order is displayed explicitly as:

```text
Unassigned -> Storage -> Transfer -> Club
```

Users can reorder or disable piles. Validation prevents a required pile list from becoming empty. Effective disabled piles inherited from a parent Workflow are shown but cannot be re-enabled by a child.

### 11.3 SBC selector

The selector reads current scanned SBC metadata when available and retains manual aliases and IDs. It displays Set ID, challenge count, completion state, and whether the current strategy can interpret the challenge requirements safely.

### 11.4 Pack selector

The selector reads current My Packs metadata and supports manual ID/name aliases. Source, reward, shortage, and fallback pack roles are edited separately. Shortage sources expose their requirement, maximum opens, repeat behavior, and routing policy.

### 11.5 Runtime quantity

The UI supports fixed limits, user input at run time, current EA daily remaining, and all matching source packs where the existing strategy supports them. It serializes to `runtimeQuantity`, `dailyCompletionLimit`, `consumeAllSourcePacks`, and the strategy's established limit fields.

## 12. Inheritance and effective values

Inherited boolean settings use a three-state control:

```text
Inherit | Enabled | Disabled
```

The general precedence is Step Variant, Loop, Workflow, then Global. The inspector always shows the effective value and its source.

Existing runtime behavior remains authoritative:

- Reward opening resolves from global runtime state through Workflow, Loop reward mode, and Step reward flow.
- Pick options resolve from global options through Workflow and Player Pick Loop options.
- Inventory mode resolves from global options through Workflow and Loop settings.
- Parent disabled piles are unioned with child disabled piles.
- Parent dry run cannot be disabled by a child.
- A child recovery policy overrides inherited policy IDs; step reward flow may provide its own recovery policy IDs.
- Execution quantity belongs to the atomic Loop. A Workflow does not apply one numeric value to all child Loops.

## 13. Recovery editor

Recovery is an Advanced Builder section because it is part of the current full Workflow JSON contract. It supports:

- Recovery recipes with SBC aliases, requirements, and pile order.
- Recovery policies with match requirements and ordered recipe steps.
- Continue/stop handling for unavailable, insufficient, and blocked outcomes.
- Selection of default policy IDs.
- Reference navigation from Loop and reward-flow settings.

Built-in recipes and policies follow the same read-only, Duplicate, Override, and Reset rules as Loops.

## 14. JSON validation

The JSON tab has four modes:

- Generated JSON for the current structured draft.
- Draft versus Active diff.
- Active versus Built-in diff.
- Paste/import validation.

Validation errors are grouped by JSON path and link to the corresponding visual field. Imported JSON is parsed with the existing parser, converted to a structured draft, and activated only after complete validation. Unknown but valid fields are retained and shown as advanced fields.

Export always emits the existing top-level configuration shape so files remain compatible with the development server and older manual workflows.

Reusable repository Profiles live in `profiles/*.profile.json`. A descriptor references an official preset or embeds one complete validated `config`. `npm run check:profiles` rejects invalid configuration and dynamic Pick snapshots; `npm run build:profiles` emits importable `.loops.json` files plus a manifest under `dist/profiles/`. GitHub Actions packages these outputs into `DailyLoopRunner.profiles.zip` for Releases.

## 15. Built-in update conflicts

Sparse overrides record a fingerprint of their built-in base. On a userscript update:

- Unmodified fields inherit the new built-in value.
- Explicit user fields remain overridden.
- Fields changed by both sides are reported as conflicts.
- Users resolve each conflict with Use built-in or Keep mine.
- Removed built-in definitions keep a recoverable orphan snapshot until references are repaired.

An unresolved conflict blocks activation but does not discard the last known good active configuration.

## 16. Preview and diagnostics

Preview validates the materialized configuration and displays:

- Effective Workflow step order.
- Strategy and run-limit summary for each atomic Loop.
- Effective reward, Pick, inventory, and recovery settings.
- Missing SBC, Pack, Dynamic Pick, or Loop references.
- Built-in update conflicts.

Live Dry run remains a separate explicit command and continues to use the current runtime safety boundary. Builder preview itself performs no item moves, pack opens, SBC saves, submissions, or Pick claims.

## 17. Implementation phases

### Phase 1: Foundation

- Add versioned profile, draft, override, fingerprint, and materialization models.
- Add semantic JSON import/export and last-known-good persistence.
- Add round-trip tests against all built-in and external definitions.

### Phase 2: Workspace shell

- Add the full-screen responsive workspace, source library, toolbar, inspector, and status bar.
- Add profile selection and draft lifecycle commands.
- Add generated JSON and validation views.

### Phase 3: Workflow and common Loop editing

- Add ordered Workflow steps, reference checks, Step Variants, and inheritance display.
- Add common Loop settings, requirements, pile ordering, SBC aliases, and Pack aliases.

### Phase 4: Complete strategy coverage

- Add every strategy-specific editor listed in section 10.
- Add Recovery editors and Dynamic Pick bindings.
- Add a contract test requiring an editor descriptor for every registered strategy.

### Phase 5: Runtime activation

- Wire Builder open/close and JSON validation commands into the main panel.
- Restore the active profile on startup and retain Built-in reset behavior.
- Apply materialized configurations through the existing validated runtime boundary.

### Phase 6: Verification and migration

- Migrate existing inline JSON actions to the validation/import flow.
- Verify narrow and desktop layouts, long object lists, long validation paths, and conflict states.
- Rebuild the root and distribution userscripts and run the complete verification suite.

## 18. Acceptance criteria

- The current external configuration can be imported, visually inspected, exported, and re-imported without semantic change.
- Every registered strategy has a visual editor descriptor and validation coverage.
- Built-in definitions are recoverable and cannot be directly mutated.
- Custom profiles survive reload and activate only after validation.
- Workflow references remain valid after rename, duplicate, override, delete, import, and built-in update operations.
- Dynamic Pick bindings cannot silently run an expired snapshot.
- Builder edits preserve unknown supported fields.
- JSON validation links errors to visual fields and never bypasses runtime validation.
- The main panel remains compact and its log remains available when Options is open.
- Generated configurations pass existing schema, contract, workflow, and architecture tests.

## 19. Implementation status

The first Builder release is userscript `0.6.0`. The runtime contract remains unchanged.

| Phase | Status | Delivered |
| --- | --- | --- |
| 1. Foundation | Complete | Versioned profiles, Draft/Saved/Active revisions, last-known-good recovery, built-in rebase/conflicts, JSON round-trip, and persistence tests. |
| 2. Workspace shell | Complete for the first release | Full-screen library/editor/inspector workspace, profiles, Undo/Redo, validation, Preview, import/export, desktop and responsive layouts. |
| 3. Workflow/common editing | Complete | Ordered steps, Step Variants, transactional reference renames, runtime quantity, reward flow, Pick options, requirements, and pile ordering. |
| 4. Strategy coverage | Complete for the current schema | Descriptors and structured editors for all registered strategies, Recovery recipes/policies, and Dynamic Pick binding. A contract test fails when a strategy or built-in field has no descriptor. |
| 5. Runtime activation | Complete | Main-panel migration, draft-only development JSON import, Active Profile startup restore, Built-in reset, and post-scan dynamic reapplication through `validateLoopConfig()` and `setLoopConfig()`. |
| 6. Verification/migration | Automated coverage complete; live validation pending | Unit, contract, workflow, and architecture coverage plus generated userscript checks. Real EA-page interaction and layout sampling remain release validation work. |

The following enhancements are intentionally deferred and do not change the runtime schema:

- Populate SBC and Pack selectors from live scanned SBC/My Packs metadata instead of aliases and IDs only.
- Show field-level effective inheritance sources and disabled-pile provenance in the Inspector.
- Add Draft-versus-Active and Active-versus-Built-in visual diffs.
- Link normalized schema error paths directly to focused visual controls.
- Replace the current narrow responsive stack with dedicated Library, Editor, and Inspector mobile tabs.
- Surface preserved unknown valid fields in an Advanced diagnostics editor; the first release preserves them during structured edits and export but does not expose arbitrary raw-field mutation.

Release verification must explicitly cover startup with a valid Active Profile, an invalid autosaved Draft, an unavailable Dynamic Pick binding, a built-in update conflict, Built-in reset, and development-server JSON import. Until real EA-page validation is recorded, the Builder is considered implemented but not live-validated for SBC/Pack selector ergonomics.
