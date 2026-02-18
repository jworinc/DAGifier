#!/usr/bin/env bash

################################################################################
# CRI-WATCH.sh - Configuration File Monitor Daemon
# 
# Purpose: Monitor config files for changes and auto-validate
# Usage: CRI-WATCH.sh <start|stop|status|install>
#
################################################################################

set -euo pipefail
IFS=$'\n\t'

readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions
source "${SCRIPT_DIR}/cri-common.sh"

# Get workspace root for monitoring
WORKSPACE_ROOT="$(find_workspace_root)"
readonly WATCH_DIR="${WORKSPACE_ROOT}"
readonly PID_FILE="/tmp/cri-watch-$(basename "${WORKSPACE_ROOT}").pid"

# Get workspace-aware log directory
CRI_DIR="$(get_cri_dir)"
readonly LOG_FILE="${CRI_DIR}/watch.log"

################################################################################
# Logging to file
################################################################################
log_to_file() {
    echo "[$(date -Iseconds)] $*" | tee -a "${LOG_FILE}"
}

################################################################################
# Check if running
################################################################################
is_running() {
    [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null
}

################################################################################
# Watch loop
################################################################################
watch_loop() {
    log_to_file "CRI-WATCH started (PID: $$) for workspace: $(get_workspace_name)"
    echo $$ > "${PID_FILE}"

    # Use fswatch if available, otherwise fallback to polling
    if command -v fswatch &>/dev/null; then
        log_to_file "Using fswatch for file monitoring"
        fswatch -0 -r \
            --exclude '.git' \
            --exclude '.meta/cri/backups' \
            --exclude 'logs/' \
            --exclude '.DS_Store' \
            "${WATCH_DIR}" 2>>"${LOG_FILE}" | while IFS= read -r -d '' file; do
            handle_change "${file}"
        done
    else
        log_to_file "fswatch not found, using polling (install: brew install fswatch)"
        watch_polling
    fi
}

################################################################################
# Polling fallback
################################################################################
watch_polling() {
    local -A last_mtime

    while true; do
        while IFS= read -r -d '' file; do
            local current_mtime=$(stat -f %m "${file}" 2>/dev/null || stat -c %Y "${file}" 2>/dev/null)
            local cached_mtime="${last_mtime[${file}]:-0}"

            if [[ ${current_mtime} -gt ${cached_mtime} ]]; then
                last_mtime["${file}"]=${current_mtime}
                handle_change "${file}"
            fi
        done < <(find "${WATCH_DIR}" -type f \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" \) ! -path "*/.git/*" ! -path "*/.meta/cri/backups/*" -print0 2>/dev/null)

        sleep 5
    done
}

################################################################################
# Handle file change
################################################################################
handle_change() {
    local file="$1"

    # Skip non-config files
    [[ ! "${file}" =~ \.(json|yaml|yml)$ ]] && return

    # Skip backup directory
    [[ "${file}" =~ /backups/ ]] && return

    # Skip CRI audit log
    [[ "${file}" =~ /audit\.jsonl$ ]] && return

    log_to_file "Change detected: ${file}"

    # Run validation
    if command -v CRI-VALIDATE.sh &>/dev/null || [[ -x "${SCRIPT_DIR}/CRI-VALIDATE.sh" ]]; then
        local validator="${SCRIPT_DIR}/CRI-VALIDATE.sh"
        [[ ! -x "${validator}" ]] && validator="CRI-VALIDATE.sh"

        if "${validator}" "${file}" >> "${LOG_FILE}" 2>&1; then
            log_to_file "✓ Validation passed: ${file}"
        else
            log_to_file "✗ Validation failed: ${file}"
            notify_failure "${file}"
        fi
    else
        log_to_file "⚠ CRI-VALIDATE.sh not found (skipping validation)"
    fi
}

################################################################################
# Notify on validation failure
################################################################################
notify_failure() {
    local file="$1"

    # macOS notification
    if command -v osascript &>/dev/null; then
        osascript -e "display notification \"${file} failed validation\" with title \"CRI-WATCH\"" 2>/dev/null || true
    fi

    # OpenClaw notification (if available)
    if command -v openclaw &>/dev/null; then
        openclaw notify "Config validation failed: ${file}" >/dev/null 2>&1 || true
    fi
}

################################################################################
# Start daemon
################################################################################
start_daemon() {
    if is_running; then
        log_warning "CRI-WATCH is already running (PID: $(cat "${PID_FILE}"))"
        exit 1
    fi

    mkdir -p "$(dirname "${LOG_FILE}")"

    log_success "Starting CRI-WATCH daemon for workspace: $(get_workspace_name)"
    nohup "$0" --daemon >> "${LOG_FILE}" 2>&1 &

    sleep 1

    if is_running; then
        log_success "CRI-WATCH started (PID: $(cat "${PID_FILE}"))"
        log_info "Watching: ${WATCH_DIR}"
        log_info "Log: ${LOG_FILE}"
    else
        log_error "Failed to start (check ${LOG_FILE})"
        exit 1
    fi
}

################################################################################
# Stop daemon
################################################################################
stop_daemon() {
    if ! is_running; then
        log_warning "CRI-WATCH is not running"
        exit 1
    fi

    local pid=$(cat "${PID_FILE}")
    log_info "Stopping CRI-WATCH (PID: ${pid})..."

    kill "${pid}"
    rm -f "${PID_FILE}"

    log_success "CRI-WATCH stopped"
}

################################################################################
# Status
################################################################################
show_status() {
    if is_running; then
        log_success "CRI-WATCH is running"
        echo -e "${CYAN}Workspace: $(get_workspace_name)${NC}"
        echo -e "${CYAN}PID: $(cat "${PID_FILE}")${NC}"
        echo -e "${CYAN}Watching: ${WATCH_DIR}${NC}"
        echo -e "${CYAN}Log: ${LOG_FILE}${NC}"

        if [[ -f "${LOG_FILE}" ]]; then
            echo ""
            echo -e "${CYAN}Recent activity:${NC}"
            tail -5 "${LOG_FILE}"
        fi
    else
        log_warning "CRI-WATCH is not running"
        echo -e "${CYAN}Workspace: $(get_workspace_name)${NC}"
    fi
}

################################################################################
# Install as LaunchAgent (macOS)
################################################################################
install_launchagent() {
    local workspace_name
    workspace_name="$(get_workspace_name)"
    local plist="${HOME}/Library/LaunchAgents/ai.openclaw.cri-watch.${workspace_name}.plist"
    local script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

    log_info "Installing LaunchAgent for workspace: ${workspace_name}"

    cat > "${plist}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.openclaw.cri-watch.${workspace_name}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${script_path}</string>
        <string>--daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${WORKSPACE_ROOT}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_FILE}</string>
</dict>
</plist>
EOF

    launchctl load "${plist}"

    log_success "LaunchAgent installed"
    log_info "Load:   launchctl load ${plist}"
    log_info "Unload: launchctl unload ${plist}"
}

################################################################################
# Usage
################################################################################
usage() {
    cat <<EOF
${CYAN}CRI-WATCH.sh${NC} v${SCRIPT_VERSION} - Configuration File Monitor

${BOLD}USAGE:${NC}
  CRI-WATCH.sh <start|stop|status|install>

${BOLD}COMMANDS:${NC}
  start     Start monitoring daemon
  stop      Stop monitoring daemon
  status    Show daemon status
  install   Install as macOS LaunchAgent

${BOLD}EXAMPLES:${NC}
  cd ~/.openclaw/workspace/my-project
  CRI-WATCH.sh start
  CRI-WATCH.sh status
  tail -f ${LOG_FILE}

${BOLD}WORKSPACE:${NC}
  Current workspace: $(get_workspace_name)
  Watching: ${WATCH_DIR}
  Log: ${LOG_FILE}

${BOLD}MONITORED FILES:${NC}
  *.json, *.yaml, *.yml in workspace
  Excludes: .git/, .meta/cri/backups/, .DS_Store

${BOLD}ON CHANGE:${NC}
  1. Detect file modification
  2. Run CRI-VALIDATE.sh
  3. Log result
  4. Notify if validation fails

EOF
}

################################################################################
# Main
################################################################################
main() {
    case "${1:-}" in
        start)
            start_daemon
            ;;
        stop)
            stop_daemon
            ;;
        status)
            show_status
            ;;
        install)
            install_launchagent
            ;;
        --daemon)
            watch_loop
            ;;
        --help|-h|help)
            usage
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
