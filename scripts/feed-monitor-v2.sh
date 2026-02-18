#!/bin/bash

# Feed Monitor - Monitors blogs/feeds and creates daily summaries with topical organization
# Usage: ./feed-monitor-v2.sh [--setup] [--run]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${SCRIPT_DIR}/.."
FEEDS_DIR="${WORKSPACE}/feeds"
SUMMARIES_DIR="${WORKSPACE}/daily-summaries"
LOG_FILE="${WORKSPACE}/logs/feed-monitor.log"

# Create directories
mkdir -p "${FEEDS_DIR}" "${SUMMARIES_DIR}" "$(dirname "${LOG_FILE}")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "${LOG_FILE}"
}

# Error function
error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "${LOG_FILE}"
}

# Success function
success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "${LOG_FILE}"
}

# Warning function
warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "${LOG_FILE}"
}

# Feed configuration (add your feeds here)
FEEDS=(
    "https://feeds.feedburner.com/oreilly/radar"
    "https://www.aosabook.org/en/index.xml" 
    "https://martinfowler.com/feed.atom"
    "https://www.seths.blog/feed/"
    "https://feeds.feedblitz.com/thoughtbot"
)

# Topic keywords for categorization
TOPICS=("AI" "Programming" "Architecture" "Productivity" "Management" "General")

# Function to get keywords for a topic
get_keywords_for_topic() {
    case "$1" in
        "AI") echo "ai machine learning llm gpt openai anthropic claude" ;;
        "Programming") echo "code programming developer software engineering" ;;
        "Architecture") echo "architecture design system distributed" ;;
        "Productivity") echo "productivity tools workflow efficiency" ;;
        "Management") echo "management leadership team" ;;
        *) echo "" ;;
    esac
}

# Setup function
setup() {
    log "Setting up feed monitor..."
    
    # Create topic folders
    for topic in "${TOPICS[@]}"; do
        mkdir -p "${FEEDS_DIR}/topics/${topic}"
        log "Created topic folder: ${topic}"
    done
    
    # Create a sample feeds configuration
    cat > "${FEEDS_DIR}/feeds-config.txt" << EOF
# Feed Monitor Configuration
# Add your RSS/Atom feeds here (one per line)
FEEDS=(
    "https://feeds.feedburner.com/oreilly/radar"
    "https://www.aosabook.org/en/index.xml"
    "https://martinfowler.com/feed.atom"
    "https://www.seths.blog/feed/"
    "https://feeds.feedblitz.com/thoughtbot"
)

# Topics for categorization
TOPICS=("AI" "Programming" "Architecture" "Productivity" "Management" "General")

# Keywords for each topic
AI: ai machine learning llm gpt openai anthropic claude
Programming: code programming developer software engineering
Architecture: architecture design system distributed
Productivity: productivity tools workflow efficiency
Management: management leadership team
EOF

    success "Setup complete! Edit ${FEEDS_DIR}/feeds-config.txt to add your feeds."
}

# Function to fetch and process feeds
process_feeds() {
    log "Processing feeds..."
    
    today=$(date '+%Y-%m-%d')
    summary_file="${SUMMARIES_DIR}/summary-${today}.md"
    temp_dir=$(mktemp -d)
    
    # Initialize summary
    cat > "${summary_file}" << EOF
# Daily Feed Summary - ${today}

EOF

    # Process each feed
    total_items=0
    
    for feed_url in "${FEEDS[@]}"; do
        log "Processing feed: ${feed_url}"
        
        # Fetch feed using curl
        feed_file="${temp_dir}/$(basename ${feed_url//\//_}).xml"
        
        if ! curl -s --fail --max-time 30 "${feed_url}" -o "${feed_file}"; then
            error "Failed to fetch feed: ${feed_url}"
            continue
        fi
        
        # Parse feed (simplified - extract titles and links)
        titles=$(grep -o '<title[^>]*>.*</title>' "${feed_file}" | sed 's/<[^>]*>//g' | sed '/^$/d')
        links=$(grep -o '<link[^>]*>.*</link>' "${feed_file}" | sed 's/<[^>]*>//g' | sed '/^$/d')
        
        # Convert to arrays
        IFS=$'\n' read -ra title_array <<< "$titles"
        IFS=$'\n' read -ra link_array <<< "$links"
        
        # Process items
        for i in "${!title_array[@]}"; do
            title="${title_array[$i]}"
            link="${link_array[$i]}"
            
            if [[ -n "$title" && -n "$link" ]]; then
                # Categorize by topic
                categorized=false
                for topic in "${TOPICS[@]}"; do
                    keywords=$(get_keywords_for_topic "$topic")
                    if [[ -n "$keywords" ]] && echo "$title" | grep -qiE "$keywords"; then
                        # Save to topic folder
                        echo "- [${title}](${link})" >> "${FEEDS_DIR}/topics/${topic}/$(date +%Y-%m-%d).md"
                        categorized=true
                        break
                    fi
                done
                
                # If not categorized, save to general
                if [[ "$categorized" == "false" ]]; then
                    echo "- [${title}](${link})" >> "${FEEDS_DIR}/topics/General/$(date +%Y-%m-%d).md"
                fi
                
                ((total_items++))
            fi
        done
    done
    
    # Generate summary by topic
    echo "" >> "${summary_file}"
    echo "## Summary by Topic" >> "${summary_file}"
    echo "" >> "${summary_file}"
    
    for topic in "${TOPICS[@]}"; do
        topic_file="${FEEDS_DIR}/topics/${topic}/$(date +%Y-%m-%d).md"
        if [[ -f "$topic_file" && -s "$topic_file" ]]; then
            echo "### ${topic}" >> "${summary_file}"
            echo "" >> "${summary_file}"
            cat "$topic_file" >> "${summary_file}"
            echo "" >> "${summary_file}"
        fi
    done
    
    # Add metadata
    cat >> "${summary_file}" << EOF

---
- **Total items processed**: ${total_items}
- **Feeds monitored**: ${#FEEDS[@]}
- **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
- **Next update**: $(date -d 'tomorrow' '+%Y-%m-%d')
EOF

    # Cleanup
    rm -rf "${temp_dir}"
    
    success "Daily summary created: ${summary_file}"
    
    # Show summary
    echo -e "\n${YELLOW}=== Daily Summary ===${NC}"
    cat "${summary_file}"
}

# Main function
main() {
    case "${1:-}" in
        --setup)
            setup
            ;;
        --run)
            process_feeds
            ;;
        --help)
            echo "Usage: $0 [--setup|--run|--help]"
            echo "  --setup  : Initialize feed monitor configuration"
            echo "  --run    : Process feeds and generate daily summary"
            echo "  --help   : Show this help message"
            ;;
        *)
            error "Unknown option: ${1:-}"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
}

# Run main function
main "$@"