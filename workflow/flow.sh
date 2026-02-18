#!/bin/bash
# flow.sh - Workflow Wizard (Shell Pillar)
# Orchestrates 'nav' (Node), 'gum' (UI), and 'ctx' (Shell)
# Replaces form.sh with enhanced capabilities.

# Tools
check_tool() {
    if ! command -v "$1" &> /dev/null; then echo "Error: '$1' required."; exit 1; fi
}

CMD="$1"

# Helpers
get_projects() {
    # Scan for PXXX-Name structure
    find projects -maxdepth 1 -type d -name "P*-*" ! -name "P000-*" 2>/dev/null | sort
}

case "$CMD" in
    switch)
        check_tool gum
        check_tool nav
        # 1. Fetch
        # 2. Filter
        JSON=$(nav list --json)
        SELECTED=$(echo "$JSON" | jq -r '.[] | "\(.id)\t\(.title)\t\(.project)"' | gum filter --placeholder "Select context...")
        
        [ -z "$SELECTED" ] && exit 0
        ID=$(echo "$SELECTED" | cut -f1)
        
        # 3. Act
        nav view "$ID"
        ;;
        
    search)
        check_tool gum
        check_tool nav
        QUERY=$(gum input --placeholder "Search query...")
        [ -z "$QUERY" ] && exit 0
        
        # Call nav search
        nav search "$QUERY" --limit 50 --json | \
          jq -r '.[] | "\(.scope)\t\(.path)"' | \
          gum filter | cut -f2 | xargs -I {} open "{}"
        ;;
        
    task)
        # Replaces form.sh task
        check_tool gum
        
        # 1. Select Project
        PROJ_DIRS=$(get_projects)
        [ -z "$PROJ_DIRS" ] && echo "No projects found." && exit 1
        
        PROJECT_PATH=$(echo "$PROJ_DIRS" | gum choose --header "Select Project")
        [ -z "$PROJECT_PATH" ] && exit 0
        PROJECT_NAME=$(basename "$PROJECT_PATH" | cut -d- -f2-)
        PROJECT_ID=$(basename "$PROJECT_PATH" | cut -d- -f1)
        
        # 2. Calculate Next ID
        # Find highest KXXX in that project
        LAST_K=$(find "$PROJECT_PATH/tasks" -name "K*.md" -type f 2>/dev/null | sort | tail -1 | grep -o 'K[0-9]*' | tr -d 'K')
        NEXT_NUM=$((${LAST_K:-0} + 1))
        NEXT_ID=$(printf "K%03d" $NEXT_NUM)
        
        # 3. Input Metadata
        TITLE=$(gum input --placeholder "Task title" --header "Create Task ($NEXT_ID)")
        [ -z "$TITLE" ] && exit 0
        
        STATUS=$(echo -e "next\ninbox\nwaiting\nlater" | gum choose --header "Status")
        ENERGY=$(echo -e "low\nmedium\nhigh" | gum choose --header "Energy")
        DUE=$(gum input --placeholder "Due (YYYY-MM-DD)" --value "$(date +%Y-%m-%d)")
        
        # 4. Create File
        mkdir -p "$PROJECT_PATH/tasks"
        FILE="$PROJECT_PATH/tasks/${NEXT_ID}-${TITLE// /_}.md"
        
        cat > "$FILE" <<EOF
---
id: $NEXT_ID
title: "$TITLE"
date: $(date +%Y-%m-%d)
project: $PROJECT_NAME
status: $STATUS
energy: $ENERGY
due: $DUE
---

# $TITLE

EOF
        echo "✅ Created: $FILE"
        
        # 5. Open?
        nav view "$FILE"
        ;;
        
    done)
        # Replaces form.sh done
        check_tool gum
        check_tool nav
        
        # 1. Find 'next' or 'waiting' tasks
        # Use nav list for speed/parsing
        JSON=$(nav list --json)
        # Filter logic here using jq to find active stuff? 
        # Or just use grep as form.sh did, but smarter.
        
        # Let's use basic find+grep for "next"
        TASKS=$(find projects -name "K*.md" -print0 | xargs -0 grep -l "status: next" | sort)
        
        [ -z "$TASKS" ] && echo "No active tasks." && exit 0
        
        # Select
        TARGET=$(echo "$TASKS" | gum choose --header "Mark Complete")
        [ -z "$TARGET" ] && exit 0
        
        # Update
        # sed -i is platform dependent relative to GNU/BSD
        # Use perl for safety or temp file
        perl -i -pe 's/^status: next/status: done/' "$TARGET"
        echo "✅ Marked done: $TARGET"
        ;;
        
    model)
        # Replaces form.sh model
        check_tool gum
        CHOICE=$(echo -e "Sonnet\nOpus\nOpus-Think\nSonnet-Think\nGPT-5.1\nGPT-5.2\nGemini-Pro\nFlash\nGLM" | gum choose --header "Switch Model")
        [ -z "$CHOICE" ] && exit 0
        
        # Log it / export it
        # If this is sourced, we could export. But usually flow is run as subshell.
        # We'll just echo for now to match form.sh parity, but maybe write to .codex/model?
        echo "MODEL SET: $CHOICE"
        # Optional: Save to user config
        if [[ -d ".codex" ]]; then
            echo "model: $CHOICE" > .codex/current_model
        fi
        ;;

    daily)
        check_tool nav
        # Daily summary workflow
        echo "Generating Daily Summary..."
        TODAY=$(date +%Y-%m-%d)
        nav list --date today --json > "daily-${TODAY}.json"
        echo "Saved to daily-${TODAY}.json"
        ;;
        
    *)
        echo "Usage: flow <switch|search|task|done|model|daily>"
        ;;
esac
