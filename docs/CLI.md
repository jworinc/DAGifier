# CLI Documentation

> Last updated: 2026-02-17

## Overview

Dagifier provides a rich CLI with multiple operating modes and output formats.

```bash
dagifier [command] [options] <input>
```

---

## Global Options

These flags apply to all commands:

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-v, --verbose` | Enable verbose logging to stderr. Useful for debugging. | `false` |
| `-p, --pack <domain>` | Manually specify a pattern pack domain (e.g., `reddit.com`). | Auto-detected |
| `-r, --rendered` | Force headless browser rendering (Playwright). | `false` |
| `-o, --outline` | Only extract headings and metadata. | `false` |
| `--modality <name>` | Select interface modality: `text`, `html`, `tui`. | `text` (or implied) |

---

## Output Options

Control the format of the output:

| Flag | Description |
| :--- | :--- |
| `-j, --json` | Emit the full `PageDoc` and `Trace` as JSON. |
| `-e, --explain` | Print human-readable extraction diagnostics (trace) to stderr. |
| `-x, --extract` | Emit only cleaned text blocks (no metadata/structure). |
| `-w, --wikilinks` | Format links as `[[Style]]` for Obsidian compatibility. |

---

## Output Features

### Auto-Paging
When outputting to a terminal (TTY), if the content exceeds the screen height, Dagifier automatically pipes it through `less -R`. This allows for easy scrolling without flooding your buffer.

To disable this (e.g., for scripting), simply pipe the output:
```bash
dagifier read https://example.com | cat
```

### Syntax Highlighting
JSON output (`-j`) is automatically syntax-highlighted when printed to a terminal.

### External Viewers (`--viewer`)
Pipe the output directly to a custom viewer or tool.
```bash
dagifier read https://example.com --viewer "glow -"
dagifier read https://example.com --viewer "bat -l md"
```

### JQ Filtering (`--filter`)
Filter JSON output on the fly without needing to pipe manually.
```bash
# Extract just the title
dagifier read https://example.com --json --filter ".doc.title"
```

## Commands

### `read` (Default)
Standard reading mode. Auto-detects structure and outputs full detail.

```bash
dagifier read https://example.com/article
```

### `edit`
Fetches content and opens it in your configured `$EDITOR` (or `vi` by default). Useful for quick "scrape and refine" workflows.

```bash
dagifier edit https://example.com/article
```

### `diff`
Compares the current live output of a URL against a saved golden file.
If you have configured a `differ` in `~/.dagifierrc` (e.g., `delta` or `code --diff`), it will use that tool instead of the internal simple diff.

```bash
dagifier diff https://example.com/article my-saved-snapshot
```

### `view` (Alias)
Launches the interactive Terminal UI (TUI). Equivalent to `dagifier read --modality tui`.

### `doctor`
Checks your system for recommended external tools (`jless`, `fx`, `glow`, `bat`, `delta`) and reports their status.

```bash
dagifier doctor
```

**Auto-fix:**
Use `--fix` to attempt to install missing tools using `brew` (macOS) or `npm`.

```bash
dagifier doctor --fix
```

### `tree`
Visualizes the scraped content as a navigable filesystem tree using `lstr`.
This explodes the extraction result (JSON) into a temporary directory structure where every object is a folder and every scalar is a file, allowing for intuitive exploration of complex data.

```bash
dagifier tree https://github.com/example/repo
```

```bash
dagifier view https://example.com
```

### `skim`
Compact mode. Truncates text blocks and limits depth to give a quick overview.

```bash
dagifier skim https://example.com/long-read -l 150
```
*`-l` sets the per-block character limit (default: 300).*

### `outline`
Structure only. Shows the hierarchy of headings and metadata.

```bash
dagifier outline https://example.com/complex-page
```

### `thread`
Forces a threaded view (indented tree). Best for forums like Reddit/HN.

```bash
dagifier thread https://news.ycombinator.com/item?id=12345
```

### `links`
Extracts and lists all links found in the content with reference IDs.

```bash
dagifier links https://example.com
```

### `record`
**Developer Tool.** Records the HTML fixture and ASCII golden for a URL to `tests/`.

```bash
dagifier record https://example.com/page my-test-case
```

### `query`
**Developer Tool.** Tests a CSS selector against a live URL.

```bash
dagifier query https://example.com ".content p"
```

### `diff`
**Developer Tool.** Compares current output against a saved golden.

```bash
dagifier diff https://example.com my-test-case
```

---

## Modalities

### Text (Default)
Standard ASCII output to stdout.

### HTML
Generates a standalone HTML file with minimal styling.

```bash
dagifier read https://example.com --modality html > article.html
```

### TUI
Launches an interactive Terminal UI for browsing the content.

```bash
dagifier read https://example.com --modality tui
```
*Controls: `v` (view), `h` (html preview), `o` (open original), `q` (quit)*
