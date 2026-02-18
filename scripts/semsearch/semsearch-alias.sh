#!/usr/bin/env zsh
# semsearch-alias.sh - Add semantic search to your shell
# Source this in .zshrc: source ~/.openclaw/workspace/scripts/semsearch/semsearch-alias.sh

# Add to PATH if not already there
case ":$PATH:" in
  *:$HOME/.openclaw/workspace/scripts/semsearch:*) ;;
  *) export PATH="$HOME/.openclaw/workspace/scripts/semsearch:$PATH" ;;
esac

# Alias for shorter command
alias semsearch='semsearch.sh'

# Usage: semsearch "query" [folder]
# Example: semsearch "state transitions" projects/
