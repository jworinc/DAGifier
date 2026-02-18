#!/usr/bin/env bash

################################################################################
# cri-common.sh - Shared library for CRI scripts
# 
# Purpose: Common functions for workspace detection, logging, and utilities
# Usage: source this script at the top of CRI scripts
#
################################################################################

set -euo pipefail
IFS=$'\n\t'

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m' # No Color

################################################################################
# Find workspace root by locating .meta/ directory
################################################################################
find_workspace_root() {
    local current_dir="${PWD}"

    while [[ "${current_dir}" != "/" ]]; do
        if [[ -d "${current_dir}/.meta" ]]; then
            echo "${current_dir}"
            return 0
        fi
        current_dir="$(dirname "${current_dir}")"
    done

    log_error "Could not find workspace root (no .meta/ directory found)"
    return 1
}

################################################################################
# Get workspace name (for display/logging)
################################################################################
get_workspace_name() {
    local workspace_root
    workspace_root="$(find_workspace_root)" || return 1
    basename "${workspace_root}"
}

################################################################################
# Get CRI directory (creates if needed)
################################################################################
get_cri_dir() {
    local workspace_root
    workspace_root="$(find_workspace_root)" || return 1

    local cri_dir="${workspace_root}/.meta/cri"

    if [[ ! -d "${cri_dir}" ]]; then
        mkdir -p "${cri_dir}"
        chmod 0700 "${cri_dir}"

        # Create default config.json
        cat > "${cri_dir}/config.json" <<EOF
{
  "version": "1.0.0",
  "workspace_root": "${workspace_root}",
  "workspace": "$(basename "${workspace_root}")",
  "created": "$(date -Iseconds)"
}
EOF
    fi

    echo "${cri_dir}"
}

################################################################################
# Logging functions
################################################################################
log_info() {
    echo -e "${CYAN}ℹ${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*" >&2
}

log_error() {
    echo -e "${RED}✗${NC} $*" >&2
}

log_section() {
    echo ""
    echo -e "${BLUE}${BOLD}$*${NC}"
    echo "----------------------------------------"
}

################################################################################
# File safety validation
################################################################################
validate_file_safety() {
    local file="$1"

    # Check file exists and is readable
    if [[ ! -f "${file}" ]]; then
        log_error "File not found: ${file}"
        return 1
    fi

    if [[ ! -r "${file}" ]]; then
        log_error "File not readable: ${file}"
        return 1
    fi

    # Check file is regular (not symlink, device, etc.)
    if [[ -L "${file}" ]]; then
        log_error "Symbolic links not supported: ${file}"
        return 1
    fi

    # Check file is within workspace
    local workspace_root
    workspace_root="$(find_workspace_root)" || return 1
    local real_file
    real_file="$(realpath "${file}")"

    if [[ "${real_file}" != "${workspace_root}"* ]]; then
        log_error "File is outside workspace: ${file}"
        log_info "Workspace root: ${workspace_root}"
        return 1
    fi

    # Warn about dangerous file types
    case "${file}" in
        *.enc|*.gpg|*.secret|*.key|*.pem)
            log_warning "Editing encrypted/secret files: ${file}"
            ;;
    esac

    return 0
}
