---
name: dagifier
description: Convert any URL into clean, llm-optimized markdown content using smart extraction patterns.
---

# Dagifier Skill

The `dagifier` skill allows you to fetch, render, and distill web content into clean Markdown, optimized for LLM consumption. It handles dynamic content (via Playwright), extracts main article/thread content while removing clutter, and ensures constant-memory streaming for batch tasks.

## Capabilities
- **Read**: Fetch a URL and return clean Markdown (or text).
- **Batch Processing**: Stream a list of URLs from stdin via `--ndjson`.
- **Skim**: Fetch a URL and return a truncated summary.
- **Filter**: Narrow down content by section (`--section`) or author (`--author`).
- **Stats**: Get structural metadata and metrics (`--stats`).
- **Explain**: diagnostic trace for extraction decisions.
- **Tree**: Visualize JSON/API responses as a directory tree.
- **Query**: Extract specific elements using CSS selectors.

## Usage

### 1. Read & Format
Get the full content. Supports Markdown and ASCII-only modes.
```bash
dagifier read <url> --format md
dagifier read <url> --ascii-only
```

### 2. Batch Streaming (Unix Composability)
Process hundreds of URLs with constant memory usage.
```bash
cat urls.txt | dagifier - --ndjson > output.ndjson
```

### 3. Stats & Insights
Get block counts, author count, and structural signature.
```bash
dagifier <url> --stats
```

### 4. Filtering
Extract only specific parts of the conversation or document.
```bash
dagifier <url> --section "Methods"
dagifier <url> --author "JaneDoe"
dagifier <url> --internal-only
```

### 5. Highlighting & Sorting
Spot keywords or sort by time.
```bash
dagifier <url> --highlight "important term"
dagifier <url> --sort newest
```

## Examples

**Read a thread and highlight keywords:**
```bash
dagifier https://reddit.com/r/webdev/... --highlight "Playwright"
```

**Get stats for a documentation page:**
```bash
dagifier https://example.com/docs --stats
```

**Extract only replies by a specific user:**
```bash
dagifier https://news.ycombinator.com/item?id=... --author "pg"
```

**Process a filtered list of Reddit threads:**
```bash
grep "/r/rust" urls.txt | dagifier - --ndjson
```
