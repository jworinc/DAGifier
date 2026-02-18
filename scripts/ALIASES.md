# OpenClaw Workspace Scripts

Add to your shell for quick access:

```bash
# Thread browser TUI
alias threads='~/.openclaw/workspace/scripts/threads-tui.sh'

# Quick list only
alias threads-ls='cd ~/.openclaw/workspace/threads && ls -lt T*.md | head -20'

# Quick search
alias threads-grep='cd ~/.openclaw/workspace/threads && rg --markdown'
```

**Reload shell:**
```bash
source ~/.zshrc
```

**Usage:**
```bash
threads       # Full TUI browser
threads-ls     # Quick list (most recent first)
threads-grep   # Search threads
```
