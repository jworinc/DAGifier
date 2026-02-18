#!/bin/bash
# ~/.openclaw/workspace/scripts/threads-tui.sh
# Simple thread browser with basic filters

cd ~/.openclaw/workspace/threads || exit 1

# Parse filters
DATE_FILTER=""
PROJECT_FILTER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--date)
      DATE_FILTER="$2"
      shift 2
      ;;
    -p|--project)
      PROJECT_FILTER="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Build list
FILES=()
for file in T*.md; do
  SKIP=false
  
  # Date filter
  if [[ -n "$DATE_FILTER" ]]; then
    FILE_DATE=$(grep "^date:" "$file" 2>/dev/null | cut -d' ' -f2)
    if [[ "$FILE_DATE" != "$DATE_FILTER" ]]; then
      SKIP=true
    fi
  fi
  
  # Project filter
  if [[ -n "$PROJECT_FILTER" && "$SKIP" == false ]]; then
    FILE_PROJ=$(grep "^project:" "$file" 2>/dev/null | cut -d' ' -f2 | tr -d '[]"' || echo "")
    if [[ "$FILE_PROJ" != "$PROJECT_FILTER" ]]; then
      SKIP=true
    fi
  fi
  
  [[ "$SKIP" == false ]] && FILES+=("$file")
done

# FZF selection
SELECTION=$(printf "%s\n" "${FILES[@]}" | fzf \
  --height=80% \
  --layout=reverse \
  --border=rounded \
  --border-label="🧵 Threads" \
  --prompt="🔍 " \
  --delimiter='\s+' \
  --with-nth=3 \
  --preview='grep "^title:" {} 2>/dev/null | cut -d"'"'"' '"'"' -f2 | xargs echo' \
  --preview-window=right:70%)

# Exit if no selection
[[ -z "$SELECTION" ]] && exit 0

# Open in Obsidian
TITLE=$(grep "^title:" "$SELECTION" 2>/dev/null | cut -d' ' -f2-)
echo -e "\n✓ Opening: $TITLE"
open "obsidian://open?vault=workspace&file=threads/${SELECTION%.md}"
