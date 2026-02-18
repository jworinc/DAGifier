# PURPOSE

## Owner Notes (Manual)
- Keep stable purpose narrative and context here.
- This section is never auto-overwritten by lifecycle refresh.

## Auto-Managed Snapshot

<!-- CODEX:PURPOSE:BEGIN -->
### Current Situation
- repo: `Dagifier` [FS]
- generated_utc: `2026-02-18T03:43:54.998146+00:00` [FS]
- snapshot_id: `2026-02-18T03:43:54.998146+00:00` [FS]
- sources: lifecycle_generated_utc=2026-02-18T03:43:50.991119+00:00 health_last_attempt=2026-02-18T03:39:44.116746+00:00 hitl_latest_updated_utc=2026-02-17T19:39:04.807037+00:00 [LCS+HST+HIT]

- lifecycle: `undeclared` (candidate: `active_dev`) [LCS]
- archetype: `spa` (inferred/medium) [LCS]
- governance: manifest=False valid=False declared_by=-, declared_at=- [LCS]
- execution snapshot: deps=skip build=- test=- run=- check=fail [HST]
- hitl: open=1 high_open=1 decided=0/1 [HIT]
- inference: proposed=active_dev confidence=high [INF]
- readme_signal: title=DAGifier 🦞 summary=CLI-first, low-bandwidth ASCII page viewer.** [RSP]
- stack_signal: languages=js/ts frameworks=playwright,vitest managers=npm [RSP]
- execution_signal: run_cmds=start test_cmds=test,test:record,test:verify check_cmds=- entrypoints=npm:start,src/index.ts [RSP]

### Outcome Contract (Owner-Adjudicated)
- [ ] Define the one-sentence outcome this repo must deliver. [OWN]
- [ ] Define the primary user/stakeholder for this repo. [OWN]
- [ ] Define one acceptance signal that proves value delivered. [OWN]
- [ ] Confirm lifecycle declaration matches intent and reality. [OWN+LCS]

### Checklist Areas
- [ ] governance.declaration: manifest state/archetype/ownership are explicit and valid. [LCS+OWN]
- [ ] lifecycle.evidence: domain/scope/architecture/core-test evidence is present for current state. [LCS]
- [ ] execution.baseline: run/check/test paths are discoverable and not failing. [HST+RSP]
- [ ] review.adjudication: open HITL findings are owned and progressing. [HIT+OWN]

### Evidence Paths
- `.codex/lifecycle/active_dev/dashboard.md` [FS]
- `.codex/lifecycle/active_dev/evidence/current_situation.json` [FS]
- `.codex/lifecycle/active_dev/evidence/hitl_open.csv` [FS]
- `Me/Codex/garden/my-codex/lifecycle/PROJECT_LIFECYCLE.csv` [LCS]
- `Me/Codex/garden/my-codex/_generated/PROJECT_HEALTH.csv` [HST]
- `Me/Codex/garden/my-codex/lifecycle/HITL_REVIEW_QUEUE.csv` [HIT]
- `Me/Codex/garden/my-codex/lifecycle/LIFECYCLE_INFERENCE_PROPOSALS.csv` [INF]
- `<repo>/README*`, manifests, workflows, and key paths [RSP]

### Provenance Mnemonics
- `LCS`: lifecycle portfolio snapshot (`PROJECT_LIFECYCLE.csv`)
- `HST`: core execution health snapshot (`_generated/PROJECT_HEALTH.csv`)
- `HIT`: lifecycle HITL queue (`HITL_REVIEW_QUEUE.csv`)
- `INF`: lifecycle inference proposals (`LIFECYCLE_INFERENCE_PROPOSALS.csv`)
- `RSP`: repo signal parser (README/manifests/workflows/paths)
- `FS`: repository-local file/path existence checks
- `OWN`: owner/human adjudication required
<!-- CODEX:PURPOSE:END -->
