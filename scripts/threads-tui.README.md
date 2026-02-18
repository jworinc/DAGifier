# Threads Browser TUI with Filters

## Quick Start

```bash
# All threads, newest first
threads

# Today only
threads -d today

# Last 7 days
threads -d last7

# Project P005 only
threads -p P005

# Grade A only, oldest first
threads -g A -r

# Combined filters
threads -d today -p P006 -l 10
```

---

## Command Line Options

| Option | Short | Description | Example |
|--------|--------|-------------|---------|
| `--date` | `-d` | Filter by date | `-d today`, `-d 2026-02-17`, `-d last7`, `-d last30` |
| `--project` | `-p` | Filter by project | `-p P005`, `-p P006` |
| `--agent` | `-a` | Filter by agent | `-a Main`, `-a AI` |
| `--grade` | `-g` | Filter by grade | `-g A`, `-g B`, `-g graded`, `-g ungraded` |
| `--type` | `-t` | Filter by type | `-t task`, `-t thread`, `-t all` |
| `--reverse` | `-r` | Reverse sort (oldest first) | `-r` |
| `--limit` | `-l` | Limit results | `-l 10`, `-l 20` |
| `--help` | `-h` | Show help | `-h` |

---

## Date Filters

| Value | Description |
|-------|-------------|
| `today` | Today's date |
| `yesterday` | Yesterday's date |
| `last7` | Last 7 days (not implemented yet) |
| `last30` | Last 30 days (not implemented yet) |
| `YYYY-MM-DD` | Specific date |

---

## Grade Filters

| Value | Description |
|-------|-------------|
| `A`, `B`, `C` | Specific grade |
| `graded` | Has a grade (A, B, C) |
| `ungraded` | No grade set (`null`) |

---

## Type Filters

| Value | Description |
|-------|-------------|
| `task` | Only K### files |
| `thread` | Only T### files |
| `all` | Both (default) |

---

## Interactive Filter Mode

Press **Ctrl+F** while browsing to add filters:

```
Add Filter
  [d] Date (YYYY-MM-DD, today, yesterday, last7, last30)
  [p] Project (P005, P006, ...)
  [a] Agent (Main, AI, ...)
  [g] Grade (A, B, C, graded, ungraded)
  [t] Type (task, thread, all)
  [r] Toggle reverse
  [l] Limit (number)
  [q] Cancel
Filter: 
```

---

## Examples

### Common Use Cases

**Recent high-quality threads:**
```bash
threads -g A
```

**Today's AI sessions:**
```bash
threads -d today -a AI
```

**P005 tasks only, last 10:**
```bash
threads -p P005 -t task -l 10
```

**Ungraded threads, oldest first:**
```bash
threads -g ungraded -r
```

**Multiple filters:**
```bash
threads -d today -p P005 -g A
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Select current item |
| `Ctrl+O` | Open in Obsidian |
| `Ctrl+Y` | Copy to clipboard |
| `Alt+Enter` | Open in VS Code |
| `Ctrl+R` | Reload browser (applies all filters) |
| `Ctrl+F` | Add filter (interactive) |
| `Esc` | Quit |

---

## Post-Selection Actions

After selecting a thread:

```
Selected: T014
  [o] Open in Obsidian  [c] Copy to clipboard  [v] Open in VS Code  [r] Re-open browser  [q] Quit
Action: o
```

---

## Aliases for Common Filters

Add to `~/.zshrc`:

```bash
# Today only
alias threads-today='threads -d today'

# Last 7 days
alias threads-week='threads -d last7'

# Ungraded only
alias threads-ungraded='threads -g ungraded'

# Grade A only
alias threads-grade-a='threads -g A'

# Project P005 only
alias threads-p005='threads -p P005'
```

---

## Dependencies

```bash
brew install fzf bat
```

**`bat` is optional** — falls back to `cat` if not installed
