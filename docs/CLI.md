# CLI Reference

> Last updated: 2026-02-18

## Overview

The Dagifier suite consists of three core binaries, each designed for a specific phase of the knowledge workflow:

1.  **`dagifier`**: The Content Engine (Ingest, Parse, Render).
2.  **`cri`**: Configuration Reliability Engineering (Manage Configs).
3.  **`nav`**: Knowledge Navigator (Browse, Search, Filter).

---

## 1. `dagifier` (Content Engine)

The original tool for turning URLs into structured, composable ASCII/Markdown.

```bash
dagifier [command] [options] <input>
```

### Key Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `read` (default) | Fetch and render a URL. | `dagifier read https://example.com` |
| `skim` | Read with truncated text blocks (300 chars). | `dagifier skim https://example.com` |
| `outline` | Extract only structure (headings/metadata). | `dagifier outline https://example.com` |
| `thread` | Force threaded view for forums. | `dagifier thread https://reddit.com/r/...` |
| `links` | Extract all links as a reference list. | `dagifier links https://example.com` |
| `diff` | Compare live output vs golden file. | `dagifier diff https://example.com my-snapshot` |

### Key Flags

| Flag | Description |
| :--- | :--- |
| `--json` | Output machine-readable JSON (PageDoc). |
| `--ndjson` | Output newline-delimited JSON (for streaming). |
| `--format md` | Output clean Markdown. |
| `--section <name>` | Filter content by section heading. |
| `--author <name>` | Filter content by author. |
| `--stats` | Show structural statistics. |

---

## 2. `cri` (Configuration Reliability)

A tool for safe, atomic configuration management. It treats configuration files as critical infrastructure, enforcing backups and validation.

```bash
cri <command> [file] [options]
```

### Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `status` | Show file status and backup count. | `cri status config.json` |
| `apply` | Edit and apply changes safely. | `cri apply config.json` |
| `rollback` | Revert to the previous version. | `cri rollback config.json` |
| `diff` | Show diff between current and backup. | `cri diff config.json` |
| `prune` | Remove old backups (keep N). | `cri prune config.json --keep 5` |
| `audit` | View the audit log of changes. | `cat audit.jsonl` (Managed internally) |

---

## 3. `nav` (Knowledge Navigator)

A high-speed tool for browsing, searching, and filtering your local knowledge base (Markdown files).

```bash
nav <command> [options]
```

### Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `list` | List threads/tasks in the workspace. | `nav list` |
| `view` | Launch the interactive TUI. | `nav view` |
| `search` | Semantic/Regex search across threads. | `nav search "api key" --scope config` |

### Key Flags

| Flag | Description |
| :--- | :--- |
| `-C, --cwd <dir>` | Set working directory (default: current). |
| `--json` | Output results as JSON. |
| `--project <id>` | Filter by project ID (e.g., `P001`). |
| `--agent <name>` | Filter by agent name. |
| `--backend <tool>` | Select search backend (`rg`, `ug`, `grep`). |

### Search Scopes

`nav search` intelligently scopes queries based on folder structure heuristics:
- `config`: Searches `config/`, `setup/`, `dotfiles/`.
- `code`: Searches `src/`, `lib/`, `script/`.
- `docs`: Searches `docs/`, `man/`.
