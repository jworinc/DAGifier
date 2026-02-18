#!/bin/bash
# Unified Form Script
# Usage: scripts/form.sh <task|model|project|done>

cd ~/.openclaw/workspace
TYPE="$1"

case "$TYPE" in
  task)
    PROJECTS=$(find projects -maxdepth 1 -type d -name "P*-*" ! -name "P000-*" | sed 's|projects/||' | cut -d- -f1 | sort)
    LAST_K=$(find projects/*/tasks -name "K*.md" -type f 2>/dev/null | sort | tail -1 | grep -o 'K[0-9]*' | tr -d 'K')
    NEXT_ID=$(printf "K%03d" $((${LAST_K:-0} + 1)))
    TITLE=$(gum input --placeholder "Task title" --title "Create Task ($NEXT_ID)")
    [ -z "$TITLE" ] && exit 0
    PROJECT=$(echo "$PROJECTS" | gum choose --header "Project")
    [ -z "$PROJECT" ] && exit 0
    STATUS=$(echo -e "next\ninbox\nwaiting\nlater" | gum choose --header "Status")
    ENERGY=$(echo -e "low\nmedium\nhigh" | gum choose --header "Energy")
    DUE=$(gum input --placeholder "Due date" --value "$(date +%Y-%m-%d)")
    echo "TASK: $TITLE | $PROJECT | $STATUS | $ENERGY | $DUE"
    ;;
  model)
    CHOICE=$(echo -e "Sonnet\nOpus\nOpus-Think\nSonnet-Think\nGPT-5.1\nGPT-5.2\nGemini-Pro\nFlash\nGLM" | gum choose --header "Switch Model")
    [ -z "$CHOICE" ] && exit 0
    echo "MODEL: $CHOICE"
    ;;
  project)
    PROJECTS=$(find projects -maxdepth 1 -type d -name "P*-*" ! -name "P000-*" | while read dir; do
      ID=$(basename "$dir" | cut -d- -f1)
      NAME=$(grep "^title:" "$dir/README.md" 2>/dev/null | sed 's/title: //')
      echo "$ID: $NAME"
    done | sort)
    CHOICE=$(echo "$PROJECTS" | gum choose --header "Switch to Project")
    [ -z "$CHOICE" ] && exit 0
    echo "PROJECT: $(echo "$CHOICE" | cut -d: -f1)"
    ;;
  done)
    TASKS=$(find projects/*/tasks -name "K*.md" -type f -exec grep -l "status: \(next\|waiting\)" {} \; 2>/dev/null | while read f; do
      ID=$(basename "$f" | cut -d- -f1)
      TITLE=$(grep "^title:" "$f" | sed 's/title: //')
      echo "$ID: $TITLE"
    done | sort)
    [ -z "$TASKS" ] && echo "No tasks to complete" && exit 0
    CHOICE=$(echo "$TASKS" | gum choose --header "Mark Task Done")
    [ -z "$CHOICE" ] && exit 0
    echo "DONE: $(echo "$CHOICE" | cut -d: -f1)"
    ;;
  *)
    echo "Usage: form.sh <task|model|project|done>"
    exit 1
    ;;
esac
