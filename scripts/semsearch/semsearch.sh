#!/bin/bash
# semsearch.sh - Enhanced search shim with scope, ugrep, multiple formats
# Usage: semsearch.sh "<query>" [folder] [options]

set -euo pipefail

# Default values
QUERY="${1:-}"
FOLDER="${2:-.}"
FORMAT="cli"
LIMIT=20
OPEN_EDITOR=""
INTERACTIVE=false
SCOPE=""
BACKEND="auto"
OUTPUT_FILE=""

# Parse additional arguments
shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --open)
      OPEN_EDITOR="$2"
      shift 2
      ;;
    --open-hx)
      OPEN_EDITOR="hx"
      shift
      ;;
    --open-vim)
      OPEN_EDITOR="vim"
      shift
      ;;
    -i|--interactive)
      INTERACTIVE=true
      shift
      ;;
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    --backend)
      BACKEND="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -h|--help)
      cat << 'EOF'
semsearch v2.1.0 - Enhanced search shim

USAGE:
    semsearch.sh "<query>" [folder] [options]

    # Pipe mode
    echo "state transitions" | semsearch.sh

EXAMPLES:
    # Basic search
    semsearch.sh "api" ~/Code/

    # Search with scope filter
    semsearch.sh "config" ~/Config/ --scope kn/memory

    # UG backend (unified grep)
    semsearch.sh "docs" ~/Code/ --backend ug

    # JSON output (for piping)
    semsearch.sh "docs" ~/Code/ --format json | jq '.[]'

    # HTML report
    semsearch.sh "test" projects/ --format html --output report.html

    # YAML output
    semsearch.sh "api" ~/Code/ --format yaml

    # Interactive mode
    semsearch.sh "feature" ~/Code/ -i

    # Open first result
    semsearch.sh "config" ~/Code/ --open hx

OPTIONS:
    Query:
      -                           Read query from stdin (pipe mode)

    Folders:
      [folder]                   Search folder (default: .)

    Scope:
      --scope <filter>           Filter by scope: kn/memory|kn/threads|kn/projects|code|docs|all

    Backend:
      --backend <tool>           Backend: auto, rg, ug, qmd (default: auto)

    Output:
      --format <fmt>            Format: cli, json, table, html, yaml (default: cli)
      --limit <num>             Max results (default: 20)
      --output <file>           Output file (for HTML/JSON/YAML)

    Actions:
      --open <editor>            Open first result in editor (hx, vim, code)
      --open-hx                  Open in helix
      --open-vim                 Open in vim
      -i, --interactive           Interactive mode with fzf

    Other:
      -h, --help                 Show this help

SCOPE FILTERS:
    kn/memory                Search only memory/ folder
    kn/threads              Search only threads/ folder
    kn/projects             Search only projects/ folder
    kn                      Search all KN folders
    code                    Search only code files (.js, .ts, .py, etc.)
    docs                    Search only docs files (.md, .pdf, etc.)
    all                     No filtering (default)

BACKENDS:
    auto    - Try QMD, then UG, then RG (default)
    qmd     - QMD vector search (requires collection)
    ug      - Unified grep with TUI, PDF support
    rg      - Ripgrep keyword search (fast)

OUTPUT FORMATS:
    cli     - Human-readable (default)
    json    - Machine-readable (for piping)
    table   - ASCII table
    html    - HTML report (opens in browser)
    yaml    - YAML format

PIPELINE EXAMPLES:
    # Pipe to jq for filtering
    semsearch.sh "api" ~/Code/ --format json | jq '.[] | select(contains("test"))'

    # Pipe to fzf
    semsearch.sh "docs" ~/Code/ --format json | \
      jq -r '.[]' | \
      fzf --preview 'bat --color=always {}'

    # Save to file
    semsearch.sh "config" ~/Code/ --format json > results.json
EOF
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# Check query
if [[ -z "$QUERY" ]] && ! tty -s; then
  QUERY=$(cat)
fi

if [[ -z "$QUERY" ]]; then
  echo "Error: No query provided"
  echo "Usage: semsearch.sh \"<query>\" [folder] [options]"
  exit 1
fi

# Check folder
if [[ ! -d "$FOLDER" ]]; then
  echo "Error: Folder not found: $FOLDER"
  exit 1
fi

echo "🔍 Searching for: \"$QUERY\""
echo "📁 Folder: $FOLDER"
[[ -n "$SCOPE" ]] && echo "🎯 Scope: $SCOPE"
echo "🔧 Backend: $BACKEND"
echo ""

# ============================================================================
# SCOPE DETECTION
# ============================================================================

get_scope() {
  local path="$1"
  local dirname

  if [[ -d "$path" ]]; then
    dirname=$(basename "$path")
  else
    dirname=$(basename "$(dirname "$path")")
  fi

  case "$dirname" in
    memory) echo "kn:memory" ;;
    threads) echo "kn:threads" ;;
    projects) echo "kn:projects" ;;
    docs|documentation) echo "kn:docs" ;;
    *)
      local ext="${path##*.}"
      case "$ext" in
        md|txt|pdf|docx|doc) echo "docs" ;;
        js|ts|py|go|rs|java|c|cpp|jsx|tsx) echo "code" ;;
        json|yaml|yml|toml|xml|ini|conf) echo "config" ;;
        sh|zsh|bash) echo "code" ;;
        *) echo "all" ;;
      esac
      ;;
  esac
}

check_scope_match() {
  local path="$1"

  # No filter = accept all
  if [[ -z "$SCOPE" ]]; then
    return 0
  fi

  local detected
  detected=$(get_scope "$path")

  # Parse requested scope
  local filter_scope="${SCOPE%%/*}"
  local filter_sub="${SCOPE#*/}"

  # Check main scope
  local detected_main="${detected%%/*}"
  if [[ "$detected_main" != "$filter_scope" ]]; then
    return 1
  fi

  # Check sub-scope if specified
  if [[ "$filter_sub" != "$SCOPE" ]]; then
    local detected_sub="${detected#*/}"
    if [[ "$detected_sub" != "$filter_sub" ]]; then
      return 1
    fi
  fi

  return 0
}

# ============================================================================
# SEARCH BACKENDS
# ============================================================================

search_qmd() {
  if ! command -v qmd >/dev/null 2>&1; then
    return 1
  fi

  echo "QMD: Searching..." >&2

  local collection_name
  collection_name=$(basename "$FOLDER" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-')

  # Try vector search
  if qmd vsearch -n "$LIMIT" "$QUERY" -c "$collection_name" 2>/dev/null | grep -q .; then
    echo "QMD: Using vector search" >&2
    qmd vsearch -n "$LIMIT" "$QUERY" -c "$collection_name"
    return 0
  fi

  # Fallback to combined search
  if qmd query -n "$LIMIT" "$QUERY" -c "$collection_name" 2>/dev/null | grep -q .; then
    echo "QMD: Using combined search" >&2
    qmd query -n "$LIMIT" "$QUERY" -c "$collection_name"
    return 0
  fi

  echo "QMD: No collection found" >&2
  return 1
}

search_ug() {
  if ! command -v ug >/dev/null 2>&1; then
    return 1
  fi

  echo "UG: Searching..." >&2

  local results
  results=$(ug -l --max-count "$LIMIT" -i "$QUERY" "$FOLDER" 2>/dev/null || true)

  if [[ -n "$results" ]]; then
    echo "$results"
    return 0
  fi

  return 1
}

search_rg() {
  if ! command -v rg >/dev/null 2>&1; then
    return 1
  fi

  echo "RG: Searching..." >&2

  local results
  results=$(rg -l --max-count "$LIMIT" -i "$QUERY" "$FOLDER" 2>/dev/null || true)

  if [[ -n "$results" ]]; then
    echo "$results"
    return 0
  fi

  return 1
}

# Filter results by scope
filter_by_scope() {
  local results="$1"

  # No filter = return all
  if [[ -z "$SCOPE" ]]; then
    echo "$results"
    return 0
  fi

  local filtered=""
  local OLD_IFS="$IFS"
  IFS=$'\n'
  for line in $results; do
    [[ -z "$line" ]] && continue
    if check_scope_match "$line"; then
      filtered="$filtered"$'\n'"$line"
    fi
  done
  IFS="$OLD_IFS"

  echo "$filtered"
}

# ============================================================================
# SEARCH
# ============================================================================

RESULTS=""
BACKEND_USED=""

# Try backends in order
case "$BACKEND" in
  qmd)
    if RESULTS=$(search_qmd); then
      BACKEND_USED="qmd"
    fi
    ;;
  ug)
    if RESULTS=$(search_ug); then
      BACKEND_USED="ug"
    fi
    ;;
  rg)
    if RESULTS=$(search_rg); then
      BACKEND_USED="rg"
    fi
    ;;
  auto)
    if RESULTS=$(search_qmd); then
      BACKEND_USED="qmd"
    elif RESULTS=$(search_ug); then
      BACKEND_USED="ug"
    elif RESULTS=$(search_rg); then
      BACKEND_USED="rg"
    fi
    ;;
esac

# Check if results found
if [[ -z "$RESULTS" ]] || [[ -z $(echo "$RESULTS" | wc -w) ]]; then
  echo "No results found"
  exit 0
fi

echo "📊 Backend: $BACKEND_USED"
echo ""

# Filter by scope
RESULTS=$(filter_by_scope "$RESULTS")

# Count results
COUNT=$(echo "$RESULTS" | wc -l | tr -d ' ')
echo "✅ Found $COUNT results"
echo ""

# ============================================================================
# INTERACTIVE MODE
# ============================================================================

if [[ "$INTERACTIVE" == "true" ]]; then
  if ! command -v fzf >/dev/null 2>&1; then
    echo "Error: fzf not found"
    exit 1
  fi

  SELECTED=$(echo "$RESULTS" | fzf --preview 'bat --color=always {} 2>/dev/null || head -50 {}')

  if [[ -n "$SELECTED" ]]; then
    echo "Selected: $SELECTED"
    "${OPEN_EDITOR:-hx}" "$SELECTED"
  else
    echo "No selection"
  fi

  exit 0
fi

# ============================================================================
# OUTPUT FORMATTING
# ============================================================================

case "$FORMAT" in
  json)
    echo "["
    FIRST=true
    OLD_IFS="$IFS"
    IFS=$'\n'
    for LINE in $RESULTS; do
      [[ -z "$LINE" ]] && continue
      [[ "$FIRST" == "false" ]] && echo ","
      echo "  \"$LINE\""
      FIRST=false
    done
    IFS="$OLD_IFS"
    echo "]"
    ;;

  table)
    printf "%-60s %-15s\n" "PATH" "SCOPE"
    printf "%-60s %-15s\n" "------------------------------------------------------------" "---------------"
    OLD_IFS="$IFS"
    IFS=$'\n'
    for LINE in $RESULTS; do
      [[ -z "$LINE" ]] && continue
      SCOPE=$(get_scope "$LINE")
      printf "%-60s %-15s\n" "$LINE" "$SCOPE"
    done
    IFS="$OLD_IFS"
    ;;

  html)
    OUTPUT_FILE="${OUTPUT_FILE:-semsearch-results.html}"

    cat > "$OUTPUT_FILE" << 'HTML_HEADER'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Search Results - semsearch</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; background: #f5f5f7; margin: 0; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { color: #1a1a2e; margin-bottom: 20px; }
    .hit { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    .badge { padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge-scope { background: #3b82f6; color: white; }
    .badge-backend { background: #f59e0b; color: white; }
    .path { font-size: 16px; font-weight: 600; color: #1e293b; margin: 8px 0; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Search Results</h1>
    <div id="results">
HTML_HEADER

    OLD_IFS="$IFS"
    IFS=$'\n'
    for LINE in $RESULTS; do
      [[ -z "$LINE" ]] && continue

      SCOPE=$(get_scope "$LINE")

      cat >> "$OUTPUT_FILE" << HTML_HIT
      <div class="hit">
        <div class="header">
          <span class="badge badge-scope">$SCOPE</span>
          <span class="badge badge-backend">$BACKEND_USED</span>
        </div>
        <div class="path">$LINE</div>
      </div>
HTML_HIT
    done
    IFS="$OLD_IFS"

    cat >> "$OUTPUT_FILE" << 'HTML_FOOTER'
    </div>
  </div>
</body>
</html>
HTML_FOOTER

    echo "✅ Results saved to: $OUTPUT_FILE"
    [[ "${BROWSER:-}" != "0" ]] && open "$OUTPUT_FILE"
    ;;

  yaml)
    OLD_IFS="$IFS"
    IFS=$'\n'
    for LINE in $RESULTS; do
      [[ -z "$LINE" ]] && continue

      SCOPE=$(get_scope "$LINE")

      echo "---"
      echo "scope: $SCOPE"
      echo "path: $LINE"
      echo "backend: $BACKEND_USED"
    done
    IFS="$OLD_IFS"
    ;;

  *)
    # Default CLI output
    OLD_IFS="$IFS"
    IFS=$'\n'
    for LINE in $RESULTS; do
      [[ -z "$LINE" ]] && continue
      echo "📄 $LINE"
    done
    IFS="$OLD_IFS"
    ;;
esac

# ============================================================================
# OPEN FIRST RESULT
# ============================================================================

if [[ -n "$OPEN_EDITOR" && "$FORMAT" == "cli" ]]; then
  FIRST=$(echo "$RESULTS" | head -1)

  if [[ -n "$FIRST" ]]; then
    echo ""
    echo "Opening: $FIRST"
    "$OPEN_EDITOR" "$FIRST"
  fi
fi
