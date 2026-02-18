#!/usr/bin/env bash

################################################################################
# cri-common.sh - Shared functions for CRI scripts
################################################################################

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m'

log_error() { echo -e "${RED}✗ ERROR: $*${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠ WARNING: $*${NC}" >&2; }
log_info() { echo -e "${CYAN}ℹ INFO: $*${NC}" >&2; }
log_success() { echo -e "${GREEN}✓ $*${NC}"; }
log_section() { echo -e "${BLUE}=== $* ===${NC}"; }

find_workspace_root() {
    local current_dir="$PWD"
    local max_depth=10
    local depth=0

    while [[ ${depth} -lt ${max_depth} ]]; do
        [[ -d "${current_dir}/.meta" ]] && echo "${current_dir}" && return 0
        [[ "${current_dir}" =~ ^${HOME}/\.openclaw/workspace ]] && echo "${current_dir}" && return 0
        [[ "${current_dir}" =~ ^${HOME}/\.openclaw/agents/[^/]+$ ]] && echo "${current_dir}" && return 0
        [[ "${current_dir}" == "${HOME}/.openclaw/system" ]] && echo "${current_dir}" && return 0
        [[ -f "${current_dir}/workspace.json" ]] && echo "${current_dir}" && return 0
        [[ -d "${current_dir}/.git" && "${current_dir}" =~ workspace ]] && echo "${current_dir}" && return 0
        [[ "${current_dir}" == "${HOME}/.openclaw" ]] && break
        [[ "${current_dir}" == "${HOME}" || "${current_dir}" == "/" ]] && break
        current_dir="$(dirname "${current_dir}")"
        ((depth++))
    done

    echo "${HOME}/.openclaw"
    return 1
}

get_cri_dir() {
    [[ -n "${CRI_DIR:-}" ]] && echo "${CRI_DIR}" && return 0

    local workspace_root
    workspace_root="$(find_workspace_root)"
    local is_workspace=$?
    local cri_dir="${workspace_root}/.meta/cri"

    if [[ ! -d "${cri_dir}" ]]; then
        mkdir -p "${cri_dir}"
        chmod 0700 "${cri_dir}"

        local context_type="workspace"
        [[ "${workspace_root}" =~ /agents/([^/]+)$ ]] && context_type="agent:${BASH_REMATCH[1]}"
        [[ "${workspace_root}" =~ /system$ ]] && context_type="system"
        [[ "${workspace_root}" =~ workspace-([^/]+)$ ]] && context_type="workspace:${BASH_REMATCH[1]}"
        [[ "${workspace_root}" == "${HOME}/.openclaw/workspace" ]] && context_type="workspace:main"

        cat > "${cri_dir}/config.json" <<EOF
{
  "workspace_root": "${workspace_root}",
  "context_type": "${context_type}",
  "created": "$(date -Iseconds)",
  "cri_version": "2.0.0",
  "openclaw_aware": true
}
EOF
        [[ ${is_workspace} -eq 0 ]] && log_success "Initialized CRI for: $(get_workspace_name)"
    fi

    [[ ${is_workspace} -ne 0 ]] && log_warning "Not in a workspace - using global CRI directory"
    echo "${cri_dir}"
}

get_workspace_name() {
    local workspace_root
    workspace_root="$(find_workspace_root)"
    [[ "${workspace_root}" =~ /agents/([^/]+)$ ]] && echo "agent:${BASH_REMATCH[1]}" && return
    [[ "${workspace_root}" =~ /system$ ]] && echo "system" && return
    [[ "${workspace_root}" =~ workspace-([^/]+)$ ]] && echo "${BASH_REMATCH[1]}" && return
    [[ "${workspace_root}" == "${HOME}/.openclaw/workspace" ]] && echo "main" && return
    [[ "${workspace_root}" == "${HOME}/.openclaw" ]] && echo "global" && return
    basename "${workspace_root}"
}

get_workspace_type() {
    local workspace_root
    workspace_root="$(find_workspace_root)"
    [[ -f "${workspace_root}/workspace.json" ]] && jq -r '.type // "unknown"' "${workspace_root}/workspace.json" 2>/dev/null || echo "unknown"
}

get_agent_id() {
    local workspace_root
    workspace_root="$(find_workspace_root)"
    [[ "${workspace_root}" =~ /agents/([^/]+)$ ]] && echo "${BASH_REMATCH[1]}" && return 0
    return 1
}

validate_file_safety() {
    local file="$1"
    [[ ! -f "${file}" ]] && log_error "File does not exist: ${file}" && return 1
    [[ -L "${file}" ]] && log_error "File is a symlink: ${file}" && return 1
    [[ ! -r "${file}" ]] && log_error "File is not readable: ${file}" && return 1
    [[ ! -w "${file}" ]] && log_error "File is not writable: ${file}" && return 1
    return 0
}

has_openclaw_cli() { command -v openclaw &>/dev/null; }

get_openclaw_session_id() {
    [[ -n "${OPENCLAW_SESSION_ID:-}" ]] && echo "${OPENCLAW_SESSION_ID}" && return 0
    has_openclaw_cli && openclaw session current 2>/dev/null && return 0
    return 1
}

log_to_openclaw() {
    local message="$1"
    local level="${2:-info}"
    has_openclaw_cli && openclaw log "${level}" "${message}" 2>/dev/null || true
}
