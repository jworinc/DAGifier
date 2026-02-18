# Architecture v2.0

> Last updated: 2026-02-18

## Overview

Dagifier v2.0 is a **composable suite of Unix-style tools** for knowledge work. Instead of a single monolithic binary, it is composed of three independent pillars, each doing one thing well, connected by shell pipes.

---

## 1. The Three Pillars

### A. content-engine (`dagifier`)
**Role**: The "Ingestor". Turns chaotic web content into structured data.
- **Input**: URLs, HTML files, stdin.
- **Output**: JSON (PageDoc), Markdown, or ASCII.
- **Core Components**:
    - `Coordinator`: Orchestrates the fetch -> parse -> render pipeline.
    - `PatternEngine`: Loads YAML rules for site-specific extraction.
    - `Renderer`: Converts data into human-readable ASCII/Markdown.
- **Design Philosophy**: Deterministic, stateless, and computationally efficiently.

### B. config-reliability (`cri`)
**Role**: The "Governor". Manages local configuration state with ACID-like properties.
- **Input**: JSON/YAML config files.
- **Output**: Writes files, stdout status.
- **Core Components**:
    - `AtomicWriter`: Ensures writes happen via temp files + rename.
    - `BackupManager`: Rotates backups (`config.json.iso8601`).
    - `AuditLogger`: Appends operations to `audit.jsonl`.
- **Design Philosophy**: "Configuration is critical infrastructure." Never overwrite without a backup.

### C. knowledge-navigator (`nav`)
**Role**: The "Interface". Fast, read-only view into the knowledge base.
- **Input**: Local file system (Markdown, Code).
- **Output**: JSON lists, TUI views, filtered search results.
- **Core Components**:
    - `Scanner`: Wraps `fd` / `find` for sub-ms file listing.
    - `FrontmatterParser`: Fast implementation of frontmatter extraction (awk/sed optimized).
    - `SearchBackend`: Abstract interface over `rg`, `ug`, and `grep`.
- **Design Philosophy**: Human-speed latency (<50ms). Read-only by default.

---

## 2. The Shell Layer (`workflow/`)

Surrounding the strict Node.js binaries is a flexible shell layer that glues them together into "Killer Workflows".

```mermaid
graph TD
    User[User] --> Flow[flow.sh]
    
    subgraph Shell Layer
        Flow --> NavSh[nav.sh]
        Flow --> CtxSh[ctx.sh]
    end
    
    subgraph Core Binaries
        NavSh --> Nav[nav (binary)]
        Flow --> Cri[cri (binary)]
        Flow --> Dag[dagifier (binary)]
    end
    
    subgraph System
        Nav --> FS[File System]
        Cri --> Config[Configs]
        Dag --> Web[Internet]
    end
```

- **`workflow/ctx.sh`**: Manages environment variables context (stack-based).
- **`workflow/flow.sh`**: Interactive "Wizard" using `gum` to guide users through tasks.
- **`workflow/nav.sh`**: Enhanced wrapper around `nav` for complex pipelining.

---

## 3. Data Flow

### Ingestion Flow
```bash
# 1. Fetch -> 2. Extract -> 3. Save
dagifier read "https://example.com" --json | cri apply "inbox/article.json"
```

### Triaging Flow
```bash
# 1. List -> 2. Filter -> 3. View
nav list --json | jq 'select(.project=="P1")' | nav view
```

### Configuration Flow
```bash
# 1. Read -> 2. Edit -> 3. Backup -> 4. Write
cri apply config.json --set "theme=dark"
```
