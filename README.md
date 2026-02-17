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
*Note: If using ZSH, quote URLs with query parameters:*
```bash
./dagifier.sh 'https://example.com?id=123'
```

### Option 2: NPM Global Install
```bash
npm install -g .
dagifier read https://example.com
```

## Features

- **Smart Extraction**: Automatically identifies the main content (article body, forum thread, etc.).
- **Markdown-First**: Outputs clean, readable Markdown by default.
- **Pattern-Pack Engine**: Domain-specific YAML rules for high-fidelity extraction.
- **Threaded Rendering**: Specialized ASCII frames for nested comments and replies.
- **Readability Fallback**: Integrated Firefox `Readability` engine for generic articles.
- **Safe Wrapping**: Powered by `wrap-ansi` for stable, color-aware layouts.
- **Diagnostic Tracing**: Use `--explain` to see exactly how content was identified.
- **Unix Philosophy**: Silent on success, diagnostics to `stderr`, machine-readable `-j` output.

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

DAGifier provides a suite of task-oriented subcommands for different reading needs:

### 📖 Reading Modes
```bash
# Default (Auto): Detects best view, full detail
dagifier read https://news.ycombinator.com

# Skim: Truncated text, valid for quick scanning
dagifier skim https://news.ycombinator.com

# Outline: Headings and structure only
dagifier outline https://example.com/article

# Thread: Force threaded view (depth restricted)
dagifier thread https://news.ycombinator.com/item?id=...
```

### 🔍 Analysis & Tools
```bash
# Links: Extract deduped link index
dagifier links https://example.com

# Explain: Show extraction trace and signals
dagifier explain https://example.com

# Diff: Compare against a saved golden
dagifier diff https://example.com golden_name
```

### 🎭 Interface Modalities
Combine any command with `--modality` to change the output format:
```bash
# Render 'skim' mode as HTML
dagifier skim --modality web https://example.com > preview.html

# Interactive TUI for 'read' mode
dagifier read --modality tui https://example.com
```

## 🎭 Modalities (Interface Options)

DAGifier supports multiple interface modalities to suit your current environment:

- **`cli`** (Default): Fast, ASCII terminal output for quick glances.
- **`web`**: Simplified, reader-mode style HTML. High contrast and accessible.
- **`tui`**: Interactive terminal mode. Provides "operating options" to navigate, preview, or open sources.

```bash
# Example TUI mode
node dist/cli.js --modality tui https://news.ycombinator.com
```

---

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

- [**Architecture**](docs/ARCHITECTURE.md): System design, "Thin CLI, Fat Core" philosophy, and decision logs.
- [**CLI Reference**](docs/CLI.md): Comprehensive guide to commands, flags, and modalities.
- [**API Integration**](docs/API.md): How to use the `Coordinator` and `PageDoc` in your own Node.js tools.
- [**Pattern Packs**](docs/PATTERNS.md): Guide to creating custom extraction rules for specific sites.

---

## 🧪 Development

### Testing
DAGifier uses a robust fixture/golden system:

```bash
# Run all tests
npm test

# Update snapshots if logic changes
UPDATE_SNAPSHOTS=1 npm test
```

### Recording New Fixtures
```bash
dagifier record https://example.com/page my-test-case
```
