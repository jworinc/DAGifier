# Configuration Reliability Engineering (CRI)

> "Treat your dotfiles like production infrastructure."

`cri` is a specialized tool designed to bring database-level reliability to flat-file configuration management. It prevents race conditions, corruption, and accidental data loss.

---

## Core Concepts

### 1. Atomic Writes
`cri` never modifies a file in place. It follows a strict "Copy-Modify-Write" cycle:
1.  **Read**: Load target file into memory.
2.  **Backup**: Copy `target.json` to `target.json.<ISO8601>`.
3.  **Write Temp**: Write new content to `target.json.tmp`.
4.  **Rename**: Atomic rename `target.json.tmp` -> `target.json`.

This ensures that even if the process crashes mid-write, the original file is never corrupted.

### 2. Immutable Backups
Every modification triggers a backup. Backups are read-only artifacts of state at a point in time.
- Format: `<filename>.<YYYY-MM-DDTHH-mm-ss-SSSZ>`
- Rotation: `cri prune` keeps the last N backups (default: 5) to save space.

### 3. Audit Logging
Every mutable operation is appended to an immutable ledger: `audit.jsonl`.
This allows you to reconstruct the history of *who* changed *what* and *when*.

**Log Format:**
```json
{
  "timestamp": "2026-02-18T10:00:00.000Z",
  "operation": "apply",
  "file": "/path/to/config.json",
  "user": "anton",
  "tool": "cri",
  "diff_summary": "+2/-1 lines"
}
```

---

## Command Reference

### `cri apply`
Safely applies changes to a config file.

```bash
# Interactive edit (opens $EDITOR)
cri apply config.json

# Piped input (Machine/Script usage)
cat new_state.json | cri apply config.json

# Key-Value set (Quick edit)
cri apply config.json --set "theme=dark"
```

### `cri rollback`
Reverts to the immediate previous version.
*Note: A rollback is itself a new state change, so it creates a backup of the "bad" state before reverting.*

### `cri status`
Displays the health of a file.
- **Lock Status**: Checks if a generic `.lock` file exists.
- **Backup Count**: Number of available snapshots.
- **Integrity**: Verifies valid JSON/YAML syntax.

---

## Best Practices

1.  **Alias it**: `alias config=cri`
2.  **Scripting**: Always use `cri apply` in scripts instead of `sed -i` or `echo >`.
3.  **Git**: Add `*.json.*` to `.gitignore` to avoid committing backups, but commit the `audit.jsonl`.
