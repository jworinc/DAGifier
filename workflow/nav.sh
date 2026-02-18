#!/bin/bash
# nav.sh - Knowledge Navigator (Shell Implementation)
# Unified tool for Listing (Frontmatter) and Searching (Semsearch parity).
# Replaces threads-tui.sh AND semsearch.sh with 1:1 feature parity.

set -o pipefail

# --- Scope Detection (Parity with semsearch.sh) ---
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

# --- LIST COMMAND (Optimized AWK) ---
cmd_list() {
    local json=false
    local query=""
    local project=""
    local date_filter=""
    
    # Parse args manually to handle flags
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --json) json=true; shift ;;
            --project) project="$2"; shift 2 ;;
            --query) query="$2"; shift 2 ;;
            --date) date_filter="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    # High-performance scan using fd/find
    local find_cmd="find . -type f -name '*.md' -not -path '*/.*'"
    if command -v fd &>/dev/null; then find_cmd="fd -e md"; fi

    # Capture files into array to pass as args to AWK
    # Bash 3.2 compatible (macOS)
    local saved_IFS="$IFS"
    IFS=$'\n'
    local files=($(eval "$find_cmd"))
    IFS="$saved_IFS"
    
    if [[ ${#files[@]} -eq 0 ]]; then
        if [[ "$json" == "true" ]]; then echo "[]"; else echo "No threads found."; fi
        return 0
    fi

    awk -v query="$query" \
                           -v target_proj="$project" \
                           -v target_date="$date_filter" \
                           -v json="$json" '
    BEGIN { if (json == "true") printf "["; first=1 }
    
    # { print "DEBUG: " FILENAME " : " $0 > "/dev/stderr" }
    FNR == 1 { in_fm=0; id=""; title=""; date=""; proj=""; n=split(FILENAME, p, "/"); f=p[n]; sub(/\.md$/,"",f); id=f }
    /^---$/ { if(FNR==1){in_fm=1;next} if(in_fm){in_fm=0; process(); nextfile} }
    in_fm && /:/ { 
        split($0,kv,":"); key=kv[1]; val=substr($0,length(key)+2); 
        gsub(/^ *"|"$|^ *| *$/,"",val); 
        if(key=="title") title=val; if(key=="date") date=val; 
        if(key=="project") proj=val; if(key=="id") id=val 
    }
    
    function process() {
        if(query!="" && tolower(title)!~tolower(query)) return
        if(target_proj!="" && proj!=target_proj) return
        if(target_date!="" && date!=target_date) return
        
        if(json=="true") {
            if(!first) printf ","
            gsub(/"/,"\\\"",title)
            printf "\n  {\"id\":\"%s\",\"title\":\"%s\",\"date\":\"%s\",\"project\":\"%s\",\"path\":\"%s\"}", id,title,date,proj,FILENAME
            first=0
        } else {
            printf "%-10s %-12s %-10s %s\n", id,date,proj,title
        }
    }
    END { if (json == "true") printf "\n]\n" }' "${files[@]}"
}

# --- SEARCH COMMAND (Full Semsearch Parity) ---
cmd_search() {
    # Default values matching semsearch.sh
    local QUERY="${1:-}"
    local FOLDER="${2:-.}" # Second arg is folder if not a flag
    if [[ "$QUERY" =~ ^- ]]; then # Handle case where query is missing/flags start early
         FOLDER="." 
         # Repack args to parse properly
         set -- "$QUERY" "$FOLDER" "${@:2}" 
         QUERY=""
    elif [[ "$FOLDER" =~ ^- ]]; then
         FOLDER="."
         set -- "$QUERY" "${@:2}"
    else
         shift 2
    fi

    local FORMAT="cli"
    local LIMIT=20
    local SCOPE=""
    local BACKEND="auto"
    local OUTPUT_FILE=""
    local INTERACTIVE=false
    local OPEN_EDITOR=""

    # Parse Options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --format) FORMAT="$2"; shift 2 ;;
            --limit) LIMIT="$2"; shift 2 ;;
            --scope) SCOPE="$2"; shift 2 ;;
            --backend) BACKEND="$2"; shift 2 ;;
            --output) OUTPUT_FILE="$2"; shift 2 ;;
            --open) OPEN_EDITOR="$2"; shift 2 ;;
            --open-hx) OPEN_EDITOR="hx"; shift ;;
            --open-vim) OPEN_EDITOR="vim"; shift ;;
            -i|--interactive) INTERACTIVE=true; shift ;;
            *) shift ;;
        esac
    done

    # Validate/Normalize Scope (kn/docs -> kn:docs)
    if [[ -n "$SCOPE" ]]; then
        SCOPE="${SCOPE//\//:}"
    fi

    # Validation
    if [[ -z "$QUERY" && ! -t 0 ]]; then QUERY=$(cat); fi
    if [[ -z "$QUERY" ]]; then echo "Usage: nav search \"<query>\" [folder] [options]"; return 1; fi

    # --- Backend Logic ---
    local raw_results=""
    local used_backend=""

    run_search() {
        local tool="$1"
        case "$tool" in
            qmd) 
                local col=$(basename "$FOLDER" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-')
                if command -v qmd >/dev/null; then
                    qmd vsearch -n "$LIMIT" "$QUERY" -c "$col" 2>/dev/null && return 0
                    qmd query -n "$LIMIT" "$QUERY" -c "$col" 2>/dev/null && return 0
                fi ;;
            ug)
                if command -v ug >/dev/null; then
                    ug -l --max-count "$LIMIT" -i "$QUERY" "$FOLDER" 2>/dev/null && return 0
                fi ;;
            rg)
                if command -v rg >/dev/null; then
                    rg -l --max-count "$LIMIT" -i "$QUERY" "$FOLDER" 2>/dev/null && return 0
                fi ;;
        esac
        return 1
    }

    if [[ "$BACKEND" == "auto" ]]; then
        if raw_results=$(run_search qmd); then used_backend="qmd";
        elif raw_results=$(run_search ug); then used_backend="ug";
        elif raw_results=$(run_search rg); then used_backend="rg";
        fi
    else
        if raw_results=$(run_search "$BACKEND"); then used_backend="$BACKEND"; fi
    fi

    if [[ -z "$raw_results" ]]; then return 0; fi # No results

    # --- Scope Filtering ---
    # We do this in shell/awk post-processing to support rich filtering
    
    local filtered=""
    if [[ -n "$SCOPE" ]]; then
        # Filter raw_results
        filtered=$(echo "$raw_results" | while read -r line; do
            s=$(get_scope "$line")
            # Strict prefix match logic from semsearch
            # SCOPE=kn -> matches kn:threads, kn:memory
            # SCOPE=kn/memory -> matches kn:memory
            if [[ "$s" == "$SCOPE" || "$s" == *"$SCOPE"* ]]; then echo "$line"; fi
        done)
        raw_results="$filtered"
    fi
    
    if [[ -z "$raw_results" ]]; then return 0; fi

    # --- Interactive Mode ---
    if [[ "$INTERACTIVE" == "true" ]]; then
        if ! command -v fzf >/dev/null; then echo "fzf required"; return 1; fi
        echo "$raw_results" | fzf --preview 'cat {}' | xargs -r ${EDITOR:-vi}
        return 0
    fi

    # --- Output Formatting ---
    case "$FORMAT" in
        json)
            echo "$raw_results" | while read -r line; do
                s=$(get_scope "$line")
                printf '{"path":"%s","scope":"%s","backend":"%s"}\n' "$line" "$s" "$used_backend"
            done | jq -s '.'
            ;;
        table)
            printf "%-60s %-15s\n" "PATH" "SCOPE"
            echo "---------------------------------------------------------------------------"
            echo "$raw_results" | while read -r line; do
                 s=$(get_scope "$line")
                 printf "%-60s %-15s\n" "$line" "$s"
            done
            ;;
        yaml)
            echo "$raw_results" | while read -r line; do
                s=$(get_scope "$line")
                echo "-"
                echo "  path: $line"
                echo "  scope: $s"
                echo "  backend: $used_backend"
            done
            ;;
        html)
             outfile="${OUTPUT_FILE:-search_results.html}"
             echo "<html><body><h1>Search Results ($used_backend)</h1><ul>" > "$outfile"
             echo "$raw_results" | while read -r line; do
                 echo "<li><span class='scope'>$(get_scope "$line")</span> <a href='file://$PWD/$line'>$line</a></li>" >> "$outfile"
             done
             echo "</ul></body></html>" >> "$outfile"
             echo "Saved to $outfile"
             ;;
        *)
            # CLI Default
            echo "📊 Backend: $used_backend"
            echo "$raw_results" | while read -r line; do
                 echo "📄 $line"
            done
            ;;
    esac

    # --open Logic (Parity)
    if [[ -n "$OPEN_EDITOR" && "$FORMAT" == "cli" ]]; then
        local first_res=$(echo "$raw_results" | head -1)
        if [[ -n "$first_res" ]]; then
            echo ""
            echo "Opening: $first_res"
            "$OPEN_EDITOR" "$first_res"
        fi
    fi
}

# --- VIEW COMMAND ---
cmd_view() {
    local target="$1"
    if [[ -n "$target" ]]; then
        open "$target" 2>/dev/null || xdg-open "$target" || vi "$target"
    else
        cmd_list | fzf --preview 'echo {} | awk "{print $4}" | xargs head -20' | awk '{print $NF}' | xargs -r ${EDITOR:-vi}
    fi
}

# --- MAIN ---
CMD="$1"
shift
case "$CMD" in
    list) cmd_list "$@" ;;
    search) cmd_search "$@" ;;
    view) cmd_view "$@" ;;
    *) echo "Usage: nav.sh <list|search|view>"; exit 1 ;;
esac
