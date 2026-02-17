#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACTION="${1:-all}"
DOMAIN="${2:-core}"

if [ "$ACTION" = "clean" ] || [ "$ACTION" = "tidy" ]; then
  echo "alias=$ACTION canonical=cleanup"
  ACTION="cleanup"
fi

CODE_ROOT="${CODE_ROOT:-$(cd "$REPO_ROOT/.." && pwd)}"
CODEX_ROOT="${CODEX_ROOT:-$CODE_ROOT/Me/Codex}"
RUNNER="$CODEX_ROOT/scripts/repo_ci_runner.py"
CTL="$CODEX_ROOT/scripts/ci_ctl.py"

if [ ! -f "$CTL" ]; then
  echo "orchestrator control not found: $CTL" >&2
  echo "set CODEX_ROOT to your orchestrator path (example: /Users/anton/Code/Me/Codex)" >&2
  exit 2
fi

case "$ACTION" in
  all|deps|build|test|run|check)
    ;;
  *)
    exec python3 "$CTL" "$ACTION" "$DOMAIN" --mode repo --repo-path "$REPO_ROOT"
    ;;
esac

if [ ! -f "$RUNNER" ]; then
  echo "orchestrator runner not found: $RUNNER" >&2
  echo "set CODEX_ROOT to your orchestrator path (example: /Users/anton/Code/Me/Codex)" >&2
  exit 2
fi

exec python3 "$RUNNER" --repo "$REPO_ROOT" --feature "$ACTION"
