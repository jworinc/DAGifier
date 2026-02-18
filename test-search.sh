#!/usr/bin/env zsh
# Test script to debug semsearch

QUERY="LobsterBoard"
FOLDER="memory/"
FORMAT="cli"
LIMIT=20
INTERACTIVE=false
OPEN_EDITOR=""

echo "Testing search..."
echo "QUERY: $QUERY"
echo "FOLDER: $FOLDER"

# Source the main script
source /Users/anton/.openclaw/workspace/semsearch.sh

# Run search
echo ""
echo "Calling run_search..."
results=$(qmd_search "$QUERY" "$FOLDER")
echo "QMD results: $?"

if [[ $? -ne 0 ]]; then
  echo "QMD failed, trying RG..."
  results=$(rg_search "$QUERY" "$FOLDER")
  echo "RG results: $?"
fi

echo ""
echo "Final results:"
echo "$results"
echo ""
echo "Results check: [[ -z \"$results\" ]] returns $( [[ -z "$results" ]] && echo "true (empty)" || echo "false (not empty)" )"
echo "WC test: $(echo "$results" | wc -w | tr -d ' ')"
