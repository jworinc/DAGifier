#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${SCRIPT_DIR}/.."
FEEDS_DIR="${WORKSPACE}/feeds"
SUMMARIES_DIR="${WORKSPACE}/daily-summaries"
LOG_FILE="${WORKSPACE}/logs/feed-monitor.log"

mkdir -p "${FEEDS_DIR}" "${SUMMARIES_DIR}" "$(dirname "${LOG_FILE}")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "${LOG_FILE}"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "${LOG_FILE}"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "${LOG_FILE}"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "${LOG_FILE}"
}

VERBOSE=false
USE_ZAI_ONLY=false
TEST_SINGLE_FEED=""

FEEDS=(
    "https://feeds.feedburner.com/oreilly/radar"
    "https://www.aosabook.org/en/index.xml"
    "https://martinfowler.com/feed.atom"
    "https://www.seths.blog/feed/"
    "https://feeds.feedblitz.com/thoughtbot"
)

TOPICS=("AI" "Programming" "Architecture" "Productivity" "Management" "General")

TOPIC_KEYS=(
    ["AI:ai machine learning llm gpt openai anthropic claude"]
    ["Programming:code programming developer software engineering"]
    ["Architecture:architecture design system distributed"]
    ["Productivity:productivity tools workflow efficiency"]
    ["Management:management leadership team"]
    ["General:general technology news miscellaneous"]
)

get_topic_keywords() {
    local topic="$1"
    for tk in "${TOPIC_KEYS[@]}"; do
        if [[ "$tk" == "${topic}:"* ]]; then
            echo "${tk#*:}"
        fi
    done
}

setup() {
    log "Setting up feed monitor..."
    for topic in "${TOPICS[@]}"; do
        mkdir -p "${FEEDS_DIR}/topics/${topic}"
        log "Created topic folder: ${topic}"
    done
    cat > "${FEEDS_DIR}/feeds-config.txt" << 'EOF'
# Feed Monitor Configuration
# Add your RSS/Atom feeds here (one per line)
FEEDS=(
    "https://feeds.feedburner.com/oreilly/radar"
    "https://www.aosabook.org/en/index.xml"
    "https://martinfowler.com/feed.atom"
    "https://www.seths.blog/feed/"
    "https://feeds.feedblitz.com/thoughtbot"
)

# Topic keywords for categorization (format: "Topic:keyword1 keyword2")
TOPIC_KEYS=(
    ["AI:ai machine learning llm gpt openai anthropic claude"]
    ["Programming:code programming developer software engineering"]
    ["Architecture:architecture design system distributed"]
    ["Productivity:productivity tools workflow efficiency"]
    ["Management:management leadership team"]
    ["General:general technology news miscellaneous"]
)
EOF
    success "Setup complete! Edit ${FEEDS_DIR}/feeds-config.txt to add your feeds and topic keywords."
}

categorize_item() {
    local title="$1"
    local link="$2"
    local topic_file=""
    for topic_config in "${TOPIC_KEYS[@]}"; do
        local topic="${topic_config%%:*}"
        local keywords="${topic_config#*:}"
        if echo "$title" | grep -qiE "$keywords"; then
            topic_file="${FEEDS_DIR}/topics/${topic}/$(date +%Y-%m-%d).md"
            break
        fi
    done
    if [[ -z "$topic_file" ]]; then
        topic_file="${FEEDS_DIR}/topics/General/$(date +%Y-%m-%d).md"
    fi
    echo "- [${title}](${link})" >> "${topic_file}"
}

get_agent_model() {
    if [[ "$USE_ZAI_ONLY" == "true" ]]; then
        echo "zai/glm-4.7-flash"
    else
        echo "google/gemini-flash-latest"
    fi
}

process_feeds() {
    local agent_model=$(get_agent_model)
    log "Processing feeds... (Model: ${agent_model})"
    debug "Verbose mode: ${VERBOSE}"
    local today=$(date '+%Y-%m-%d')
    local summary_file="${SUMMARIES_DIR}/summary-${today}.md"
    local temp_dir=$(mktemp -d)
    cat > "${summary_file}" << 'EOF'
# Daily Feed Summary - ${today}
EOF
    local total_items=0
    for feed_url in "${FEEDS[@]}"; do
        log "Processing feed: ${feed_url}"
        debug "Feed URL: ${feed_url}"
        local feed_file="${temp_dir}/feed.xml"
        if ! curl -s --fail --max-time 30 "${feed_url}" -o "${feed_file}"; then
            error "Failed to fetch feed: ${feed_url}"
            continue
        fi
        debug "Feed file created: $(wc -c < "${feed_file}" | tr -d ' ')"
        if command -v xmlstarlet &> /dev/null; then
            local items=$(xmlstarlet sel -t -m "//item" -v "title" -v "link" -n "${feed_file}" 2>/dev/null)
            if [[ -z "$items" ]]; then
                warning "No items found in feed: ${feed_url}"
                rm -rf "${temp_dir}"
                continue
            fi
            local item_count=0
            for item in $items; do
                local title=$(echo "$item" | xmlstarlet sel -t -m "title")
                local link=$(echo "$item" | xmlstarlet sel -t -m "link")
                if [[ -n "$title" && -n "$link" ]]; then
                    categorize_item "$title" "$link"
                    ((item_count++))
                    debug "Processed item: ${title}"
                fi
            done
            debug "Processed ${item_count} items from ${feed_url}"
        else
            warning "xmlstarlet not available, skipping feed: ${feed_url}"
            rm -rf "${temp_dir}"
            continue
        fi
        ((total_items += item_count))
    done
    rm -rf "${temp_dir}"
    echo "" >> "${summary_file}"
    echo "## Summary by Topic" >> "${summary_file}"
    for topic in "${TOPICS[@]}"; do
        local topic_dir="${FEEDS_DIR}/topics/${topic}"
        if [[ -d "$topic_dir" ]]; then
            echo "### ${topic}" >> "${summary_file}"
            echo "" >> "${summary_file}"
            local topic_files=($(ls -t "${topic_dir}"/*.md 2>/dev/null | tail -10))
            for topic_file in "${topic_files[@]}"; do
                cat "${topic_file}" >> "${summary_file}"
                echo "" >> "${summary_file}"
            done
        fi
    done
    cat >> "${summary_file}" << 'EOF'

---
**Total items processed**: ${total_items}
**Feeds monitored**: ${#FEEDS[@]}
**Model used**: ${agent_model}
**Verbose mode**: ${VERBOSE}
**Generated**: $(date '+%Y-%m-%d %H:%M:%S')
EOF
    success "Daily summary created: ${summary_file}"
    echo ""
    echo -e "${YELLOW}=== Daily Summary ===${NC}"
    cat "${summary_file}"
}

test_single_feed() {
    local feed_url="$1"
    if [[ -z "$feed_url" ]]; then
        error "Usage: --test-single-feed <feed_url>"
        return 1
    fi
    local agent_model=$(get_agent_model)
    log "Testing single feed: ${feed_url} (Model: ${agent_model})"
    debug "Verbose mode: ${VERBOSE}"
    local temp_feed_file="/tmp/feed-test.xml"
    if ! curl -s --fail --max-time 30 "${feed_url}" -o "${temp_feed_file}"; then
        error "Failed to fetch feed: ${feed_url}"
        return 1
    fi
    log "Feed fetched successfully"
    if ! command -v xmlstarlet &> /dev/null; then
        error "xmlstarlet not available. Install with: brew install xmlstarlet"
        rm -f "${temp_feed_file}"
        return 1
    fi
    log "Parsing feed with xmlstarlet..."
    local items=$(xmlstarlet sel -t -m "//item" -v "title" -v "link" -n "${temp_feed_file}" 2>/dev/null)
    local item_count=$(echo "$items" | wc -l)
    log "Found ${item_count} items in feed"
    echo ""
    log "Sample items (first 5):"
    local count=0
    for item in $items; do
        if [[ $count -ge 5 ]]; then
            break
        fi
        local title=$(echo "$item" | xmlstarlet sel -t -m "title")
        local link=$(echo "$item" | xmlstarlet sel -t -m "link")
        echo "  ${title}"
        echo "    ${link}"
        ((count++))
    done
    rm -f "${temp_feed_file}"
    success "Single feed test completed"
    echo ""
    log "Topic categorization:"
    for tk in "${TOPIC_KEYS[@]}"; do
        local topic="${tk%%:*}"
        local keywords="${tk#*:}"
        log "  ${topic}: ${keywords}"
    done
}

main() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --setup) shift ;;
            --run) shift ;;
            --verbose) VERBOSE=true; shift ;;
            --zai-only) USE_ZAI_ONLY=true; shift ;;
            --test-single-feed)
                if [[ -z "$2" ]]; then
                    error "Usage: --test-single-feed <feed_url>"
                    exit 1
                fi
                shift 2
                TEST_SINGLE_FEED="$1"
                ;;
            --help)
                echo "Usage: $0 [--setup|--run|--test-single-feed <url>|--zai-only|--verbose|--help]"
                echo ""
                echo "Options:"
                echo "  --setup                 : Initialize feed monitor configuration"
                echo "  --run                    : Process feeds and generate daily summary"
                echo "  --test-single-feed <url> : Test a single feed (uses ZAI model)"
                echo "  --zai-only              : Use only ZAI models (for cron jobs)"
                echo "  --verbose               : Enable verbose/debug output"
                echo "  --help                  : Show this help message"
                exit 0
                ;;
            *) shift ;;
        esac
    done
    if [[ -n "$TEST_SINGLE_FEED" ]]; then
        process_feeds
    else
        test_single_feed "$TEST_SINGLE_FEED"
    fi
}
