---
name: dagifier
description: High-fidelity ASCII web page extraction and rendering skill. Optimized for low-bandwidth environments and AI agent consumption.
---

# DAGifier Skill

DAGifier is a high-performance content extraction and ASCII rendering engine. It converts complex web pages (threads, articles, blogs) into structured ASCII representations, maintaining hierarchical relationships while minimizing bandwidth.

## Core Capabilities

### 1. Structured Thread Extraction
- **Logic**: Detects nested comment structures (e.g., Reddit, Hacker News).
- **Output**: Rendered with Unicode box-drawing characters and hanging indents.
- **Indicators**: `[+]` (collapsed) and `[-]` (expanded) symbols for progressive disclosure.

### 2. High-Fidelity Article Fallback
- **Engine**: Integrated `@mozilla/readability` + `jsdom`.
- **Heuristic**: Triggered automatically when structured thread signals are low.
- **Forced Mode**: Use `-m article` to bypass heuristics and get a clean reader-view.

### 3. Smart Terminal Rendering
- **Wrapping**: Powered by `wrap-ansi` for stable, color-aware layouts.
- **Truncation**: Configurable `--limit` with `... (N more words)` indicators.
- **Wikilinks**: Optional `[[link]]` styling for Obsidian integration.

## Usage Patterns

### CLI Quickstart
```bash
# Basic usage
dagifier <url>

# Forced Article Mode with verbose tracing
dagifier -m article -e -v <url>

# Pipe to file (diagnostics go to stderr)
dagifier -f <url> > output.txt
```

### Automation / JSON Output
Use the `-j` flag to get a structured `PageDoc` object:
```json
{
  "doc": {
    "title": "Page Title",
    "content": [
      { "type": "heading", "level": 1, "text": "..." },
      { "type": "thread-item", "author": "Alice", "body": "...", "children": [] }
    ]
  },
  "trace": { "steps": [...] }
}
```

## Pattern Pack Development
DAGifier is extensible via YAML pattern packs in `patterns/`.

### Structure
```yaml
domain: example.com
selectors:
  root: ".main-content"
  item: ".comment-card"
  author: ".user-link"
  body: ".comment-body"
  depth: "attr:aria-level"
filters:
  - ".ad-banner"
  - ".sidebar-navigation"
```

## Maintenance & Testing
The system uses a "Golden Snapshot" approach located in `tests/`.
- `fixtures/`: Raw HTML snapshots.
- `goldens/`: Verified ASCII output references.
- `record` command: `dagifier record <url> <name>` to bootstrap new tests.
