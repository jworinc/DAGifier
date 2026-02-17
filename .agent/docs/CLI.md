# DAGifier CLI Command Reference

The command-line interface is designed to be Unix-first, allowing for easy composition with other tools.

## Global Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--json` | `-j` | Output as a structured JSON object. | `false` |
| `--extract` | | Output only the text content (no frames). | `false` |
| `--verbose` | `-v` | Log diagnostic info to stderr. | `false` |
| `--explain` | `-e` | Show extraction trace to stderr. | `false` |
| `--pack` | | Force usage of a specific pattern pack. | `auto` |

## Rendering Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--mode` | `-m` | `auto`, `thread`, or `article`. | `auto` |
| `--full` | `-f` | Disable all text truncation. | `false` |
| `--limit` | `-l` | Block character limit before truncation. | `300` |
| `--wikilinks`| `-w` | Use Obsidian-style `[[link]]` formatting. | `false` |

## Subcommands

### `record <url> <name>`
Records a live page and saves it as a fixture for snapshot testing.
- **Fixture**: `tests/fixtures/<name>.html`
- **Golden**: `tests/goldens/<name>.txt` (Force-rendered with `--full`)

### `verify` (Standard Action)
Running `dagifier <path_to_fixture>` will render the fixture. This is used by the test suite to ensure regressions are caught.

## Pipe Composition
DAGifier follows the rule of "Silent on Success, Loud on Error" (regarding stdout).
```bash
# MAIN CONTENT -> output.txt
# LOGS -> terminal (stderr)
dagifier -v https://news.ycombinator.com > hn.txt
```

## Exit Codes
- **0**: Perfect execution.
- **1**: Internal error (e.g., fetch failure).
- **2**: CLI argument error.
