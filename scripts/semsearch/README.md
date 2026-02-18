# Semantic Search Script (Enhanced)

Fast semantic search over any folder using QMD skill, LLM fallback, and file-search skill (fd/rg).

## New Features (v2.0)

- ✅ **QMD skill integration** - Uses installed qmd-search skill
- ✅ **file-search skill integration** - Uses fd + rg for fast searches
- ✅ **Open in editor** - Direct navigation to results
- ✅ **Interactive mode** - Gum-powered TUI selection
- ✅ **Multi-folder search** - Search across multiple folders at once
- ✅ **Export results** - MD, JSON, CSV, TXT formats
- ✅ **File type filtering** - md, code, config, all
- ✅ **Date filtering** - Only recently modified files
- ✅ **Result limiting** - Control result count

## Installation

```bash
# Skills already installed via clawhub:
# - qmd-search (v1.1.0)
# - file-search (v1.0.0)

# Add to PATH (one time)
echo 'export PATH="$HOME/.openclaw/workspace:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Create alias for shorter command
echo 'alias semsearch="~/.openclaw/workspace/semsearch.sh"' >> ~/.zshrc
source ~/.zshrc
```

## Quick Start

### Basic Search

```bash
# Search current folder
semsearch "state transitions"

# Search specific folder
semsearch "testing infrastructure" projects/

# Search multiple folders
semsearch "authentication" projects/ ~/Code/ memory/
```

### Open Results in Editor

```bash
# Open first result in helix
semsearch "config" ~/Code/ --open hx

# Open first result in vim
semsearch "api" ~/Code/ --open vim

# Open in VS Code
semsearch "test" ~/Code/ --open code

# Shorthand for helix
semsearch "docs" projects/ --open-hx
```

### Interactive Mode

```bash
# Gum-powered TUI selection
semsearch "api" ~/Code/ -i

# Shows ranked list, press to select and open
```

### Export Results

```bash
# Export as markdown
semsearch "docs" ~/Code/ --export results.md

# Export as JSON
semsearch "test" projects/ --export results.json

# Export as CSV
semsearch "config" ~/Code/ --export results.csv
```

### Filter by File Type

```bash
# Search only markdown files
semsearch "docs" ~/Code/ --type md

# Search only code files (.js, .ts, .py, .go, .rs, .java)
semsearch "api" ~/Code/ --type code

# Search only config files (.json, .yaml, .toml, .xml)
semsearch "proxy" ~/Config/ --type config
```

### Filter by Modified Time

```bash
# Only files modified in last 7 days
semsearch "feature" ~/Code/ --modified 7

# Only files modified in last 30 days
semsearch "bug" ~/Code/ --modified 30
```

### Limit Results

```bash
# Show top 5 results
semsearch "api" ~/Code/ -n 5

# Show top 50 results
semsearch "docs" projects/ -n 50
```

## Search Methods (Auto Fallback)

1. **QMD Vector Search** (fastest, semantic)
   - Uses qmd-search skill (installed via clawhub)
   - Requires QMD collection for folder
   - True semantic understanding

2. **LLM Semantic Search** (slower, accurate)
   - Uses Gemini CLI for relevance scoring
   - Scores 0-10, shows only >5 results
   - Works without QMD collection

3. **file-search Skill** (fast, keyword)
   - Uses fd (filename search) + rg (content search)
   - Installed via clawhub
   - Pattern matching only

4. **Grep Fallback** (slowest, keyword)
   - Uses system grep if fd/rg not available
   - Pattern matching only

## Output

```
🔍 Searching for: "state transitions"
📁 Folders: memory/
📝 Type: md
📅 Modified: last 7 days

Method: QMD vector search (semantic)

📄 [qmd] memory/2026-02-18.md
📄 [qmd] memory/2026-02-17.md
```

```
🔍 Searching for: "api"
📁 Folders: ~/Code/

Method: LLM semantic search

🧠 [llm] [9/10] /Users/anton/Code/api/auth.js
🧠 [llm] [8/10] /Users/anton/Code/api/routes.py
🧠 [llm] [7/10] /Users/anton/Code/api/config.yaml
```

```
🔍 Searching for: "test"
📁 Folders: projects/

Method: file-search (fd + rg)

🔍 [fd] projects/P008/tests/integration.js
🔍 [rg] projects/P008/src/test-utils.js
```

## Supported File Types

| Type | Extensions |
|------|------------|
| `md` | `.md` |
| `code` | `.js`, `.ts`, `.py`, `.go`, `.rs`, `.java` |
| `config` | `.json`, `.yaml`, `.toml`, `.xml` |
| `all` | All files (default) |

Excluded: `node_modules`, `.git`, `.DS_Store`, `dist`, `build`

## Requirements

### Required (pre-installed via clawhub)
- ✅ `qmd-search` skill - QMD CLI with vector search
- ✅ `file-search` skill - fd + rg

### Optional (for full features)
- `gemini` CLI - For LLM semantic search
- `gum` - For interactive mode
- `hx` / `vim` / `code` - For opening files

## QMD Collection Setup

For fastest semantic search, create QMD collections:

```bash
# List existing collections
qmd collection list

# Add collection for folder
qmd collection add /Users/anton/.openclaw/workspace/memory/ \
  --name memory \
  --mask "*.md"

# Add collection for code
qmd collection add ~/Code/ \
  --name code \
  --mask "*.md,*.js,*.ts,*.py"

# Enable vector search (one-time, takes a few minutes)
qmd embed

# Re-index after adding files
qmd update
```

## Export Formats

### Markdown (default for docs)
```markdown
- [qmd] `memory/2026-02-18.md`
- [qmd] `projects/P008/README.md`
```

### JSON (for scripts)
```json
{"method": "qmd", "score": 10, "file": "memory/2026-02-18.md"},
{"method": "qmd", "score": 9, "file": "projects/P008/README.md"}
```

### CSV (for spreadsheets)
```csv
qmd,10,"memory/2026-02-18.md"
qmd,9,"projects/P008/README.md"
```

### TXT (simple format)
```
[qmd] memory/2026-02-18.md
[qmd] projects/P008/README.md
```

## Advanced Usage

### Chain with other tools

```bash
# Open first 3 results in tabs
semsearch "config" ~/Code/ -n 3 | while read line; do
  file=$(echo "$line" | grep -oE '/[^"]+')
  hx "$file" &
done

# Count results by method
semsearch "api" ~/Code/ | grep -oE '\[(qmd|llm|fd|rg)\]' | sort | uniq -c

# Extract file paths only
semsearch "test" projects/ | grep -oE '/[^\)]+'
```

### Search in specific branches (git-aware)

```bash
# Search in current git branch only
git rev-parse --abbrev-ref HEAD | read branch
semsearch "feature" ~/Code/ --modified 1

# Search in multiple branches
for branch in main dev staging; do
  git checkout $branch
  semsearch "api" ~/Code/ --export "results-$branch.md"
done
```

### Watch mode (manual)

```bash
# Watch folder and re-run search on changes
fswatch -r ~/Code/ | while read; do
  semsearch "api" ~/Code/ --open-hx
done
```

## Troubleshooting

### "Command not found: semsearch"

```bash
# Add workspace to PATH
export PATH="$HOME/.openclaw/workspace:$PATH"

# Or run full path
~/.openclaw/workspace/semsearch.sh "query" folder/

# Or create alias
alias semsearch="~/.openclaw/workspace/semsearch.sh"
```

### "No QMD collection found"

Create collection for faster semantic search:
```bash
qmd collection add ~/Code/ --name code --mask "*.md,*.js,*.ts,*.py"
qmd embed
```

### Interactive mode not working

Install gum:
```bash
brew install gum
```

### LLM search is slow

The LLM fallback is slower because it calls model for each file.
For large folders, use QMD collections or fd/rg instead.

### No results found

Try:
1. Check folder path exists
2. Broader search terms
3. Remove file type filter
4. Increase modified days
5. Check file types (only md, txt, js, ts, py, sh by default)

## Files

- `semsearch.sh` - Main search script (enhanced v2.0)
- `SEMSEARCH-README.md` - This file (enhanced)
- `semsearch-alias.sh` - Alias setup (unchanged)

## Skills Used

### qmd-search (v1.1.0)
- **Installed via:** `clawhub install qmd-search`
- **Location:** `~/.openclaw/workspace/skills/qmd-search/SKILL.md`
- **Features:** BM25, vector search, LLM reranking

### file-search (v1.0.0)
- **Installed via:** `clawhub install file-search`
- **Location:** `~/.openclaw/workspace/skills/file-search/SKILL.md`
- **Features:** fd (filename search), rg (content search)

## Performance Comparison

| Method | Speed | Semantic | Setup | Best For |
|--------|-------|----------|-------|-----------|
| **QMD vector** | ⚡⚡⚡ | ✅✅ | ✅ Collection | Indexed folders, high precision |
| **LLM semantic** | ⚡ | ✅✅ | ✅ | Unindexed folders, true understanding |
| **fd + rg** | ⚡⚡⚡ | ❌ | ✅ Installed | Fast keyword search, code discovery |
| **grep** | ⚡ | ❌ | ❌ Installed | Fallback, pattern matching |

## Examples

### Search memory for LobsterBoard
```bash
semsearch "LobsterBoard" memory/
```

### Find all test files
```bash
semsearch "test" ~/Code/ --type code
```

### Recent config changes
```bash
semsearch "config" ~/Config/ --type config --modified 3
```

### Open first result in helix
```bash
semsearch "api" ~/Code/ --open-hx
```

### Interactive selection
```bash
semsearch "docs" ~/Code/ -i
```

### Export results for report
```bash
semsearch "documentation" ~/Code/ --export report.md
```

## Changelog

### v2.0 (2026-02-18)
- ✅ Added QMD skill integration
- ✅ Added file-search skill integration (fd + rg)
- ✅ Added open in editor support
- ✅ Added interactive mode with gum
- ✅ Added multi-folder search
- ✅ Added export formats (md, json, csv, txt)
- ✅ Added file type filtering
- ✅ Added date filtering
- ✅ Added result limiting

### v1.0 (2026-02-18)
- ✅ Initial version
- ✅ QMD fallback
- ✅ LLM semantic search
- ✅ Grep fallback
