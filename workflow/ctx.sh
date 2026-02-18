#!/bin/bash
# ctx.sh - Context Manager (Shell Pillar)
# Source this file in your .zshrc or .bashrc to use the 'ctx' command.
# Usage: ctx <push|pop|shelve|switch>

export CTX_DIR="${HOME}/.openclaw/ctx"
export CTX_STACK="${CTX_DIR}/stack.jsonl"
mkdir -p "${CTX_DIR}/shelves"

ctx() {
    local cmd="$1"
    shift
    
    # Context manager needs jq for JSON handling
    if ! command -v jq &> /dev/null; then
        echo "Error: 'ctx' requires 'jq' installed."
        return 1
    fi

    case "$cmd" in
        push)
            local name="${1:-$(date +%s)}"
            local item="{\"name\":\"$name\",\"path\":\"$PWD\",\"time\":\"$(date)\"}"
            echo "$item" >> "$CTX_STACK"
            echo "Context pushed: $name ($PWD)"
            if [[ -n "$2" ]]; then cd "$2"; fi
            ;;
        pop)
            if [[ ! -f "$CTX_STACK" ]]; then echo "Stack empty"; return 1; fi
            local last=$(tail -n 1 "$CTX_STACK")
            # Remove last line (BSD sed safe)
            sed -i '' '$d' "$CTX_STACK" 2>/dev/null || sed -i '$d' "$CTX_STACK"
            
            local path=$(echo "$last" | jq -r '.path')
            local name=$(echo "$last" | jq -r '.name')
            echo "Restoring context: $name"
            cd "$path"
            ;;
        shelve)
            local name="$1"
            [ -z "$name" ] && echo "Name required" && return 1
            # Current state
            echo "{\"name\":\"$name\",\"path\":\"$PWD\",\"time\":\"$(date)\"}" > "${CTX_DIR}/shelves/${name}.json"
            echo "Shelved as $name"
            ;;
        unshelve)
             local name="$1"
             local file="${CTX_DIR}/shelves/${name}.json"
             if [[ -f "$file" ]]; then
                 local path=$(jq -r '.path' "$file")
                 echo "Unshelving $name -> $path"
                 cd "$path"
             else
                 echo "Shelve not found"
             fi
             ;;
        list)
            if [[ -f "$CTX_STACK" ]]; then
                echo "Stack:"
                cat "$CTX_STACK" | jq -r '"  - " + .name + " (" + .path + ")"'
            fi
            echo "Shelves:"
            ls "${CTX_DIR}/shelves" | sed 's/.json//' | sed 's/^/  - /'
            ;;
        *)
            echo "Usage: ctx <push|pop|shelve|unshelve|list>"
            ;;
    esac
}
