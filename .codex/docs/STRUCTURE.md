# STRUCTURE

## Owner Notes (Manual)
- Keep architecture rationale and repository-specific conventions here.
- This section is never auto-overwritten by lifecycle refresh.

## Auto-Managed Snapshot

<!-- CODEX:STRUCTURE:BEGIN -->
### Structure Snapshot
- repo: `Dagifier` [FS]
- generated_utc: `2026-02-18T17:58:42.826894+00:00` [FS]
- snapshot_id: `2026-02-18T17:58:42.826894+00:00` [FS]
- sources: lifecycle_generated_utc=2026-02-18T17:58:40.432619+00:00 health_last_attempt=- [LCS+HST]

### Control Surface
- `.codex/run-step.sh <action> <domain>` [FS]
- `Me/Codex/ci <action> <domain>` [FS]
- `.codex/project.yaml` (core execution contract) [LCS]
- `.codex/lifecycle.yaml` (lifecycle declaration) [LCS]
- `.codex/lifecycle/active_dev/` (repo lifecycle state artifacts) [FS]

### Layering Rules
- lifecycle metadata/evidence stays under `.codex/lifecycle/` [FS]
- core CI/execution contract stays in `.codex/project.yaml` and `CI/` [LCS+HST]
- implementation code and tests stay outside lifecycle folders [FS]
- repo-local docs live under `.codex/docs/` and are derived from signals [FS]

### Structure Checklist Areas
- [x] core.contracts: `.codex/project.yaml` is present. [LCS]
- [x] core.control_surface: `.codex/run-step.sh` is present. [LCS]
- [ ] core.automation: CI workflow is present when needed. [LCS]
- [x] core.tests: tests path/command is discoverable. [RSP]
- [x] docs.quality: docs/readme structure signal exists. [RSP]

### Signals Used
- lifecycle flags: source=True markers=True project_yaml=True run_step=True ci_workflow=False [LCS]
- contract flags: interaction=False domain=False scope=False architecture=False core_tests=False [LCS]
- artifact counts: planning=5 structured=0 mockups=0 tests=56 [LCS]
- execution statuses: deps=- build=- test=- run=- check=- [HST]
- repo-stack: languages=js/ts frameworks=playwright,vitest package_managers=npm [RSP]
- repo-commands: run=start test=test,test:record,test:verify check=- [RSP]
- repo-paths: src=True app=False lib=False tests=True spec=False docs=True ci=True dockerfile=True [RSP]
- ci-workflows: - [RSP]

### Navigation
- lifecycle dashboard: `.codex/lifecycle/active_dev/dashboard.md` [FS]
- lifecycle evidence: `.codex/lifecycle/active_dev/evidence/` [FS]
- lifecycle portfolio row: `Me/Codex/garden/my-codex/lifecycle/PROJECT_LIFECYCLE.csv` [LCS]
- core health row: `Me/Codex/garden/my-codex/_generated/PROJECT_HEALTH.csv` [HST]
- lifecycle HITL queue: `Me/Codex/garden/my-codex/lifecycle/HITL_REVIEW_QUEUE.csv` [HIT]
<!-- CODEX:STRUCTURE:END -->
