# MUST_HAVE

## Owner Notes (Manual)
- Add owner-specific tasks and local constraints here.
- This section is never auto-overwritten by lifecycle refresh.

## Auto-Managed Snapshot

<!-- CODEX:MUST_HAVE:BEGIN -->
### Checklist Snapshot
- repo: `Dagifier` [FS]
- generated_utc: `2026-02-17T20:03:12.167551+00:00` [FS]
- snapshot_id: `2026-02-17T20:03:12.167551+00:00` [FS]
- sources: lifecycle_generated_utc=2026-02-17T20:03:08.564640+00:00 health_last_attempt=- hitl_latest_updated_utc=2026-02-17T19:39:04.807037+00:00 hitl_oldest_open_updated_utc=2026-02-17T19:39:04.807037+00:00 [LCS+HST+HIT]

- lifecycle_state: `undeclared` (candidate: `active_dev`) [LCS]
- archetype: `spa` (inferred/medium) [LCS]
- hitl_open: `1` (high: `1`) [HIT]
- health_blockers: `-` [HST]
- top_open_rules: `inference.missing_manifest(1)` [HIT]
- stack: `js/ts` frameworks=`playwright,vitest` managers=`npm` [RSP]

### Checklist Areas
- governance.*: lifecycle declaration and ownership quality
- lifecycle.*: state evidence and contract completeness
- execution.*: run/build/test/check operational baseline
- review.*: HITL adjudication and confidence gating

### Governance Checklist
- [ ] [LCS] Declare lifecycle manifest (`.codex/lifecycle.yaml`).
- [ ] [LCS] Keep lifecycle manifest schema-valid.
- [ ] [LCS] Set `declared_by` governance ownership.
- [ ] [LCS] Set `declared_at` governance timestamp.
- [ ] [LCS] Declare archetype explicitly in manifest.
- [x] [LCS] Keep archetype confidence above low.
- [ ] [HIT] Resolve or adjudicate all open lifecycle findings.

### Lifecycle Evidence Checklist
- [ ] [LCS] Maintain interaction contract (`spec/ux.md`).
- [ ] [LCS] Maintain domain contract (`spec/domain.md`).
- [ ] [LCS] Maintain scope contract (`spec/mvp.md`).
- [ ] [LCS] Maintain architecture contract (`spec/architecture.md`).
- [ ] [LCS] Keep core tests present (`tests/core/*` or equivalent).
- [x] [LCS] Keep planning artifacts discoverable.
- [ ] [LCS] Keep structured plans/specs discoverable.
- [ ] [LCS] Track mockup/wireframe assets when relevant.

### Execution Baseline Checklist
- [x] [LCS] Keep `.codex/project.yaml` present.
- [x] [LCS] Keep `.codex/run-step.sh` present.
- [ ] [LCS] Keep CI workflow present when repo is runnable.
- [ ] [HST] Dependencies step not failing.
- [ ] [HST] Check/lint step not failing.
- [x] [HST] Build step not failing.
- [x] [HST] Test step not failing.
- [x] [HST] Run step not failing.
- [x] [HST] No unresolved core blockers.
- [x] [RSP] Keep a discoverable run path (script or entrypoint).
- [x] [RSP+LCS] Keep a discoverable test path.
- [ ] [RSP+HST] Keep a discoverable check/lint path.
- [x] [RSP] Keep a README title/intent signal.
- [ ] [RSP+LCS] Keep CI workflow when source is present.

### Review / Adjudication Checklist
- [ ] [HIT] High severity findings are fully adjudicated.
- [ ] [HIT] Every lifecycle finding has a decision.
- [x] [INF] Proposal confidence is high (otherwise review manually).
- [x] [LCS] Last commit recency is within 180 days.

### Commands
- `.codex/run-step.sh status lifecycle` [FS]
- `.codex/run-step.sh hitl lifecycle` [FS]
- `.codex/run-step.sh refresh lifecycle` [FS]
- `.codex/run-step.sh dashboard lifecycle` [FS]

### Provenance Mnemonics
- `LCS`: `Me/Codex/garden/my-codex/lifecycle/PROJECT_LIFECYCLE.csv`
- `HST`: `Me/Codex/garden/my-codex/_generated/PROJECT_HEALTH.csv`
- `HIT`: `Me/Codex/garden/my-codex/lifecycle/HITL_REVIEW_QUEUE.csv`
- `INF`: `Me/Codex/garden/my-codex/lifecycle/LIFECYCLE_INFERENCE_PROPOSALS.csv`
- `RSP`: repo signal parser (README/manifests/workflows/paths)
- `FS`: repository-local path existence
- `OWN`: explicit human adjudication
<!-- CODEX:MUST_HAVE:END -->
