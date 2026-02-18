# Workflows & Navigation

Dagifier isn't just about reading web pages; it's about integrating that knowledge into your daily terminal workflow.

---

## The Knowledge Navigator (`nav`)

`nav` is a search engine for your local filesystem, optimized for "knowledge repos" (Obsidian vaults, codebases, dotfiles).

### 1. Scope Detection
`nav` automatically categorizes files based on their path or extension. This allows for semantic filtering without rich metadata.

| Scope | Heuristic | Logic |
| :--- | :--- | :--- |
| `kn:docs` | `docs/`, `*.md`, `*.txt` | Documentation content |
| `kn:code` | `src/`, `*.ts`, `*.py` | Source code |
| `kn:config`| `*.json`, `*.yaml` | Configuration files |
| `kn:project`| `projects/` folder | Project-specific data |

**Usage:**
```bash
# Search only docs
nav search "getting started" --scope kn:docs

# List items from a specific project
nav list --project P001
```

### 2. Search Backends
`nav` is a meta-tool. It doesn't implement search algorithms itself; it wraps the best tool available on your system.

**Priority Order:**
1.  **`qmd`** (Quantum Markdown): Best for structural semantic search.
2.  **`ug`** (Universal Grep): Good unicode support.
3.  **`rg`** (Ripgrep): Fastest raw text search.
4.  **`grep`**: Fallback.

It auto-detects what you have installed.

---

## The Workflow Wizard (`flow.sh`)

`flow.sh` uses `gum` to create an interactive "Wizard" experience for common tasks.

### 1. Task Management
Instead of a complex Jira UI, `flow` uses a simple Markdown-based task system.

**Create a Task:**
```bash
./workflow/flow.sh task
# > Enter Task Name: [          ]
# > Select Status: ( ) Todo ( ) Next
```

**Complete a Task:**
```bash
./workflow/flow.sh done
# Shows a checklist of 'Next' tasks.
# Press Space to toggle, Enter to complete.
```

### 2. Context Switching
Stop `cd`-ing manually. `flow.sh switch` lets you jump between projects instantly.
It sets your `$cwd` and loads the project's specific `.env` or context.

**Usage:**
```bash
./workflow/flow.sh switch
# > Select Project:
#   P001 - Codex
#   P002 - Dagifier
```

---

## Customizing Workflows

You can define your own workflows by adding functions to `workflow/custom.sh` (sourced by `flow`) or simply piping `nav` output.

**Example: Triage Inbox**
```bash
nav list --json | jq 'select(.status=="inbox")' | xargs -I {} code {}
```
