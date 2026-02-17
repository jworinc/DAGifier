#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
  cat <<'HELP'
dagifier.sh - Node-first launcher for Dagifier

Usage:
  ./dagifier.sh [command] [args]
  ./dagifier.sh install-deps   # Force install dependencies & build

Behavior:
  - Checks for node/npm
  - Auto-installs dependencies if node_modules is missing
  - Auto-builds if dist/ is missing
  - Launches Dagifier CLI
HELP
}

resolve_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  echo "node interpreter not found" >&2
  return 2
}

ensure_setup() {
  if [[ ! -d "$SCRIPT_DIR/node_modules" ]] || [[ ! -d "$SCRIPT_DIR/dist" ]]; then
    echo "First run detected. Installing dependencies and building..." >&2
    (
      cd "$SCRIPT_DIR"
      npm install
      npm run build
    )
  else
    # Check if src is newer than dist (basic incremental build check)
    # Using find to check if any file in src is newer than dist/cli.js
    if [[ -n "$(find "$SCRIPT_DIR/src" -type f -newer "$SCRIPT_DIR/dist/cli.js" 2>/dev/null | head -n 1)" ]]; then
       # echo "Source change detected. Rebuilding..." >&2
       (
         cd "$SCRIPT_DIR"
         npm run build
       )
    fi
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help-sh" ]]; then
  show_help
  exit 0
fi

if [[ "${1:-}" == "install-deps" ]]; then
  (
    cd "$SCRIPT_DIR"
    npm install
    npm run build
  )
  echo "Dependencies installed and project built."
  exit 0
fi

NODE_BIN="$(resolve_node)"
ensure_setup

exec "$NODE_BIN" "$SCRIPT_DIR/dist/cli.js" "$@"
