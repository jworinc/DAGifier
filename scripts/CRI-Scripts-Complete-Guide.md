# CRI Scripts - Complete Package

## Files Generated

### Core Scripts (4 files)
1. **cri-common.sh** - Shared library with workspace detection
2. **CRI-ACTION.sh** - Safe config modification workflow
3. **CRI-TRACE.sh** - Provenance tracking
4. **CRI-VALIDATE.sh** - Pre-flight validation

### Test Suite (1 file)
5. **test-cri-scripts.sh** - Comprehensive test suite

## Key Features

### Workspace-Aware Architecture
- Detects workspace root by finding `.meta/` directory
- Creates `.meta/cri/` subdirectory for all CRI data
- Full isolation between workspaces
- No environment variables needed (optional overrides available)

### Directory Structure
```
workspace/
├── .meta/
│   ├── cri/                    # Auto-created by CRI scripts
│   │   ├── config.json        # CRI metadata
│   │   ├── backups/           # CRI-ACTION backups
│   │   ├── audit.jsonl        # CRI-TRACE logs
│   │   └── watch.log          # CRI-WATCH logs
│   └── ... (your other meta files)
└── config/
    └── openclaw.json
```

## Installation

```bash
# 1. Copy all scripts to OpenClaw scripts directory
cp cri-common.sh CRI-*.sh ~/.openclaw/scripts/
chmod +x ~/.openclaw/scripts/CRI-*.sh

# 2. Add to PATH (optional)
echo 'export PATH="$HOME/.openclaw/scripts:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 3. Run tests to verify
cd ~/.openclaw/scripts
./test-cri-scripts.sh
```

## Quick Start

### Test in your workspace
```bash
cd ~/.openclaw/workspace/my-project/config

# Check status
CRI-ACTION.sh status

# Validate config
CRI-VALIDATE.sh openclaw.json

# Make traced change
CRI-TRACE.sh CRI-ACTION.sh apply

# View traces
CRI-TRACE.sh --query list
```

## Test Suite

The test suite verifies:

1. ✅ Workspace detection (finds .meta/ correctly)
2. ✅ CRI directory creation (.meta/cri/ auto-created)
3. ✅ CRI-ACTION basic operations
4. ✅ CRI-VALIDATE validation logic
5. ✅ CRI-TRACE command wrapping
6. ✅ Workspace isolation (alpha/beta don't cross-contaminate)
7. ✅ Directory structure correctness

### Run Tests
```bash
./test-cri-scripts.sh           # Standard output
./test-cri-scripts.sh --verbose # Debug output
```

## Workspace Isolation Example

```bash
# Terminal 1: workspace-alpha
cd ~/.openclaw/workspace/alpha/config
CRI-ACTION.sh apply              # → .meta/cri/backups/
CRI-TRACE.sh --query list        # → Shows only alpha traces

# Terminal 2: workspace-beta
cd ~/.openclaw/workspace/beta/config
CRI-ACTION.sh apply              # → .meta/cri/backups/
CRI-TRACE.sh --query list        # → Shows only beta traces
```

Fully isolated! No cross-contamination.

## .gitignore Recommendation

```gitignore
# CRI runtime data (don't commit)
.meta/cri/backups/
.meta/cri/audit.jsonl
.meta/cri/watch.log

# Optionally track schemas/config
# .meta/cri/config.json
# .meta/cri/schemas/
```

## Script Details

### cri-common.sh (shared library)
- `find_workspace_root()` - Walk up tree to find .meta/
- `get_cri_dir()` - Get .meta/cri/ path (creates if needed)
- `get_workspace_name()` - For display/logging
- `log_*()` - Colorized logging
- `validate_file_safety()` - File safety checks

### CRI-ACTION.sh (663 lines)
Modes: apply, rollback, list, diff, test, status, prune

Workspace-aware:
- Backups to `.meta/cri/backups/`
- Scoped to current workspace
- Safe concurrent use across workspaces

### CRI-TRACE.sh (226 lines)
Commands: wrap any command, query traces

Workspace-aware:
- Logs to `.meta/cri/audit.jsonl`
- Queries scoped to current workspace
- Stats per workspace

### CRI-VALIDATE.sh (326 lines)
Validations: syntax, schema, OpenClaw rules, doctor

Workspace-aware:
- Schemas in `.meta/cri/schemas/`
- Results scoped to current workspace

### test-cri-scripts.sh (comprehensive)
Tests all workspace detection and isolation logic

## Environment Variables (Optional Overrides)

```bash
# Override CRI directory (testing)
CRI_DIR=/tmp/test-cri CRI-ACTION.sh apply

# Override specific paths
CRI_BACKUP_DIR=/mnt/backups CRI-ACTION.sh apply
CRI_AUDIT_DIR=/var/log/audit CRI-TRACE.sh command
```

Priority: 1. Env var, 2. Workspace .meta/cri/, 3. Global fallback

## Migration from Global CRI

If you were using environment variables:

```bash
# Old (global)
export CRI_BACKUP_DIR="~/.openclaw/backups"

# New (automatic per workspace)
cd workspace/project
CRI-ACTION.sh apply
# → Uses workspace/.meta/cri/backups/ automatically
```

No migration needed - scripts auto-detect and adapt!
