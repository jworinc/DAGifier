# DAGifier 🦞

**CLI-first, low-bandwidth ASCII page viewer.**

DAGifier is a high-performance content extraction and ASCII rendering engine. It converts complex web pages (threads, articles, blogs) into structured ASCII representations, maintaining hierarchical relationships while minimizing bandwidth. 

> [!NOTE]
> Designed for Unix pipes, AI agent consumption, and minimal terminal environments.

---

## Quick Start

### Option 1: Zero-Install (Recommended)
Use the included launcher script to auto-build and run:
```bash
./dagifier.sh read https://example.com
```

### Option 2: NPM Global Install
```bash
npm install -g .
dagifier read https://example.com
```

---

## 🚀 Key Features

- **Smart Extraction**: Automatically identifies the main content (article body, forum thread, etc.).
- **NDJSON Streaming**: Pipe a list of URLs to `dagifier - --ndjson` for sequential, constant-memory processing.
- **Advanced Filtering**: Use `--section`, `--author`, or `--filter` (jq syntax) to slice data.
- **Threaded Rendering**: Specialized ASCII frames for nested comments and replies with dynamic terminal width support.
- **Diagnostic Tracing**: Use `--explain` for deep visibility into extraction decisions.
- **Performance Fast-Paths**: `--metadata-only`, `--no-fallback`, and `--silent` for optimized automation.
- **Terminal Correctness**: Safe line wrapping via `wrap-ansi` and full Unicode NFC normalization.

---

## 📦 Installation

```bash
git clone https://github.com/jworinc/DAGifier.git
cd DAGifier
npm install
npm run build
```

---

## 🛠 Usage (Pageview CLI)

### 📖 Reading Modes
```bash
# Default: Detects best view, full detail
dagifier read https://news.ycombinator.com

# Skim: Truncated text, 150 char limit
dagifier skim https://example.com

# Outline: Headings and structure only
dagifier outline https://example.com

# Thread: Force threaded view with depth limits
dagifier thread https://reddit.com/r/...
```

### 🔗 Composability & Pipes
```bash
# Batch process a list of URLs
cat urls.txt | dagifier - --ndjson > results.ndjson

# Extract only links from a page
dagifier links https://example.com

# Structural Diffing
dagifier diff URL1 URL2
```

### 🔍 Analysis & Filtering
```bash
# Show structural statistics
dagifier https://example.com --stats

# Filter by section heading
dagifier https://example.com --section "Methods"

# Filter thread by author
dagifier https://reddit.com/r/... --author "automoderator"
```

---

## 📚 Documentation

- [**Maximal Goals (Manifesto)**](docs/Maximal-Goals.md): The technical philosophy behind DAGifier.
- [**CLI Reference**](docs/CLI.md): Comprehensive guide to all flags and commands.
- [**Pattern Packs**](docs/PATTERNS.md): Creating custom rules for high-fidelity extraction.

---

## 🧪 Development & Testing

```bash
# Run full test suite
npm test

# Verify Terminal Correctness
npx tsx tests/terminal_correctness.ts

# Verify Batch Streaming
bash tests/verify_streaming.sh

# Self-Test (System Health)
dagifier self-test
```
