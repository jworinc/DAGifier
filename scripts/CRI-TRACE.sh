#!/usr/bin/env bash

################################################################################
# CRI-TRACE.sh - Configuration Change Provenance Tracker
# 
# Purpose: Wraps config changes to log WHO/WHEN/WHY metadata
# Usage: CRI-TRACE.sh <wrapped-command> [args...]
#
################################################################################

set -euo pipefail
IFS=$'\n\t'

readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions
source "${SCRIPT_DIR}/cri-common.sh"

# Get workspace-aware directories
CRI_DIR="$(get_cri_dir)"
readonly TRACE_DB="${CRI_DIR}/audit.jsonl"

################################################################################
# Setup
################################################################################
setup() {
    mkdir -p "${CRI_DIR}"
    touch "${TRACE_DB}"
    chmod 0700 "${CRI_DIR}"
}

################################################################################
# Capture context before execution
################################################################################
capture_context() {
    local context_file="${CRI_DIR}/.context.$$"

    # Build compact JSON using jq
    jq -c -n \
        --arg trace_id "$(uuidgen 2>/dev/null || echo "trace-$(date +%s)-$$")" \
        --arg timestamp_start "$(date -Iseconds)" \
        --arg workspace "$(get_workspace_name)" \
        --arg user "${USER}" \
        --arg hostname "$(hostname)" \
        --arg pwd "${PWD}" \
        --arg command "$(printf '%s' "$*" | jq -Rs .)" \
        --arg shell "${SHELL:-}" \
        --arg term "${TERM:-}" \
        --arg ssh_client "${SSH_CLIENT:-local}" \
        --arg git_branch "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'none')" \
        --arg git_commit "$(git rev-parse --short HEAD 2>/dev/null || echo 'none')" \
        --argjson git_dirty "$(git diff --quiet 2>/dev/null && echo false || echo true)" \
        '{
            trace_id: $trace_id,
            timestamp_start: $timestamp_start,
            workspace: $workspace,
            user: $user,
            hostname: $hostname,
            pwd: $pwd,
            command: $command,
            env: {
                SHELL: $shell,
                TERM: $term,
                SSH_CLIENT: $ssh_client
            },
            git: {
                branch: $git_branch,
                commit: $git_commit,
                dirty: $git_dirty
            }
        }' > "${context_file}"

    echo "${context_file}"
}

################################################################################
# Execute wrapped command and capture result
################################################################################
execute_wrapped() {
    local context_file="$1"
    shift

    local start_time=$(date +%s)
    local exit_code=0

    # Execute the actual command
    "$@" || exit_code=$?

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Append result to context
    local trace_id=$(jq -r .trace_id < "${context_file}")

    jq -c --arg code "${exit_code}" \
       --arg dur "${duration}" \
       --arg end "$(date -Iseconds)" \
       '. + {
          "timestamp_end": $end,
          "exit_code": ($code | tonumber),
          "duration_seconds": ($dur | tonumber),
          "success": (($code | tonumber) == 0)
       }' < "${context_file}" >> "${TRACE_DB}"

    rm -f "${context_file}"

    if [[ ${exit_code} -eq 0 ]]; then
        log_success "Trace logged: ${trace_id}"
    else
        log_warning "Failed command traced: ${trace_id}"
    fi

    return ${exit_code}
}

################################################################################
# Query traces
################################################################################
query_traces() {
    local mode="${1:-list}"
    shift || true

    if [[ ! -f "${TRACE_DB}" ]]; then
        log_info "No traces found (empty audit log)"
        return 0
    fi

    case "${mode}" in
        list)
            local limit="${1:-10}"
            echo -e "${CYAN}Recent traces (last ${limit}) in workspace: $(get_workspace_name)${NC}"
            tail -n "${limit}" "${TRACE_DB}" | jq -r '
                "\(.timestamp_start) | \(.user)@\(.hostname) | \(.command) | " +
                if .success then "✓" else "✗ (exit \(.exit_code))" end
            '
            ;;
        search)
            local query="$1"
            jq --arg q "${query}" 'select(.command | contains($q))' "${TRACE_DB}"
            ;;
        failed)
            jq 'select(.success == false)' "${TRACE_DB}"
            ;;
        stats)
            echo -e "${CYAN}Trace statistics for workspace: $(get_workspace_name)${NC}"
            jq -s '{
                total: length,
                successful: [.[] | select(.success)] | length,
                failed: [.[] | select(.success == false)] | length,
                avg_duration: ([.[] | .duration_seconds] | add / length),
                unique_users: [.[] | .user] | unique | length
            }' "${TRACE_DB}"
            ;;
        export)
            local output="${1:-trace-export-$(date +%Y%m%d).json}"
            jq -s . "${TRACE_DB}" > "${output}"
            echo "Exported to: ${output}"
            ;;
        blame)
            local file="$1"
            echo -e "${CYAN}Changes involving: ${file}${NC}"
            jq --arg f "${file}" 'select(.pwd | contains($f) or .command | contains($f))' "${TRACE_DB}" | \
                jq -r '"\(.timestamp_start) | \(.user) | \(.command)"'
            ;;
        *)
            log_error "Unknown query mode: ${mode}"
            echo "Modes: list, search, failed, stats, export, blame" >&2
            return 1
            ;;
    esac
}

################################################################################
# Usage
################################################################################
usage() {
    cat <<EOF
${CYAN}CRI-TRACE.sh${NC} v${SCRIPT_VERSION} - Configuration Change Provenance

${BOLD}USAGE:${NC}
  Wrap commands:
    CRI-TRACE.sh <command> [args...]

  Query traces:
    CRI-TRACE.sh --query <mode> [args...]

${BOLD}WRAP EXAMPLES:${NC}
  CRI-TRACE.sh CRI-ACTION.sh apply
  CRI-TRACE.sh openclaw config set gateway.mode local

${BOLD}QUERY MODES:${NC}
  list [N]           Show last N traces (default: 10)
  search <text>      Find traces containing text
  failed             Show only failed commands
  stats              Show trace statistics
  export [file]      Export all traces to JSON
  blame <file>       Show changes involving a specific file

${BOLD}QUERY EXAMPLES:${NC}
  CRI-TRACE.sh --query list 20
  CRI-TRACE.sh --query search "gateway.mode"
  CRI-TRACE.sh --query failed
  CRI-TRACE.sh --query blame openclaw.json
  CRI-TRACE.sh --query stats

${BOLD}WORKSPACE:${NC}
  Current workspace: $(get_workspace_name)
  Trace log: ${TRACE_DB}

EOF
}

################################################################################
# Main
################################################################################
main() {
    setup

    if [[ $# -eq 0 ]]; then
        usage
        exit 0
    fi

    case "${1:-}" in
        --query|-q)
            shift
            query_traces "$@"
            ;;
        --help|-h|help)
            usage
            ;;
        *)
            local context=$(capture_context "$@")
            execute_wrapped "${context}" "$@"
            ;;
    esac
}

main "$@"
