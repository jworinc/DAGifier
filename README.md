# Dagifier Tool Suite 🦞

**The composable architecture for knowledge work.**

Dagifier is a suite of high-performance tools designed to bridge the gap between the chaotic web and structured, local knowledge bases. It adheres to the Unix philosophy: do one thing well, and pipe everything.

> [!NOTE]
> Designed for Unix pipes, AI agent consumption, and minimal terminal environments.

---

## The Suite

### 1. `dagifier` (Content Engine)
The core engine. Ingests raw URLs, extracts meaningful content, and renders it as structured ASCII, Markdown, or JSON.
- **Smart Extraction**: Heuristic-based main content detection.
- **Thread Rendering**: ASCII visualization of nested discussions (Reddit, HN).
- **Structure-First**: Isolates content blocks for deterministic processing.

### 2. `cri` (Configuration Reliability)
**"Configuration is critical infrastructure."**
A tool for managing local configuration files (JSON/YAML) with atomic safety.
- **Atomic Apply**: Parse, validate, back up, and write in one transaction.
- **Instant Rollback**: Undo changes with a single command.
- **Audit Logging**: Track every change to your environment.

### 3. `nav` (Knowledge Navigator)
A lightning-fast navigator for your local knowledge base (Markdown/Obsidian vaults).
- **Sub-millisecond Search**: Optimized for large local corpora.
- **Frontmatter Querying**: Filter by `status`, `project`, or `energy`.
- **Terminal UI**: Browse and read files without leaving the keyboard.

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/jworinc/DAGifier.git
cd DAGifier
npm install
npm run build
npm link # Links 'dagifier', 'cri', and 'nav' to your path
```

### Usage Examples

**Read a thread:**
```bash
dagifier read https://news.ycombinator.com/item?id=12345
```

**Safely edit a config:**
```bash
cri apply config.json --set "theme=dark"
```

**Find valid tasks:**
```bash
nav list --status next --project P001
```

---

## 📚 Documentation

- [**CLI Reference**](docs/CLI.md): Detailed guide for `dagifier`, `cri`, and `nav`.
- [**Maximal Goals**](docs/Maximal-Goals.md): The technical philosophy.
- [**Pattern Packs**](docs/PATTERNS.md): Extending extraction with custom rules.

---

## 🧪 Development

Run the comprehensive test suite:
```bash
npm test
```
