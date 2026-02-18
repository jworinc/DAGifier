#!/usr/bin/env bash

################################################################################
# STACK.sh - Context Stack Management for Multi-Threaded Work
#
# Purpose: Save, switch, and restore work contexts for pursuing multiple threads
# Usage: STACK.sh <command> [args...]
#
################################################################################

set -euo pipefail
IFS=$'\n\t'

readonly SCRIPT_VERSION="1.0.0"
readonly STACK_DIR="${HOME}/.openclaw/stack"
readonly STACK_FILE="${STACK_DIR}/current-stack.jsonl"
readonly SHELVES_DIR="${STACK_DIR}/shelves"
readonly CURRENT_FILE="${STACK_DIR}/current"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m' # No Color

################################################################################
# Setup
################################################################################
setup() {
    mkdir -p "${STACK_DIR}"
    mkdir -p "${SHELVES_DIR}"
    touch "${STACK_FILE}"
}

################################################################################
# Logging
################################################################################
log_info() { echo -e "${CYAN}ℹ${NC} $*"; }
log_success() { echo -e "${GREEN}✓${NC} $*"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $*"; }
log_error() { echo -e "${RED}✗${NC} $*"; }
log_section() { echo -e "${BLUE}${BOLD}=== $* ===${NC}"; }

################################################################################
# Capture current context
################################################################################
capture_context() {
    local context_name="${1:-$(date +%Y%m%d-%H%M%S)}"

    local pwd_hash=$(echo "$PWD" | md5 | cut -d' ' -f4 | cut -c1-8)
    local context_id="ctx-${pwd_hash}-$$"

    # Get git context if available
    local git_branch="none"
    local git_commit="none"
    local git_dirty="false"

    if git rev-parse --git-dir >/dev/null 2>&1; then
        git_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'none')"
        git_commit="$(git rev-parse --short HEAD 2>/dev/null || echo 'none')"
        git diff --quiet 2>/dev/null || git_dirty="true"
    fi

    # Build context object
    jq -c -n \
        --arg id "${context_id}" \
        --arg name "${context_name}" \
        --arg pwd "${PWD}" \
        --arg timestamp "$(date -Iseconds)" \
        --arg pwd_hash "${pwd_hash}" \
        --arg git_branch "${git_branch}" \
        --arg git_commit "${git_commit}" \
        --argjson git_dirty "${git_dirty}" \
        --arg notes "${2:-}" \
        '{
            id: $id,
            name: $name,
            pwd: $pwd,
            timestamp: $timestamp,
            pwd_hash: $pwd_hash,
            git: {
                branch: $git_branch,
                commit: $git_commit,
                dirty: $git_dirty
            },
            notes: $notes
        }' >> "${STACK_FILE}"

    log_success "Context pushed: ${context_name}"
    log_info "ID: ${context_id}"
}

################################################################################
# Pop context from stack
################################################################################
pop_context() {
    local count="${1:-1}"

    local total=$(wc -l < "${STACK_FILE}" 2>/dev/null || echo 0)

    if [[ ${total} -eq 0 ]]; then
        log_warning "Stack is empty"
        return 1
    fi

    if [[ ${count} -gt ${total} ]]; then
        count=${total}
        log_warning "Only ${total} context(s) on stack"
    fi

    # Get the most recent context(s)
    local contexts=$(tail -n "${count}" "${STACK_FILE}")

    # Remove from stack file
    head -n $((total - count)) "${STACK_FILE}" > "${STACK_FILE}.tmp"
    mv "${STACK_FILE}.tmp" "${STACK_FILE}"

    # Restore the most recent context
    local context_to_restore=$(echo "${contexts}" | tail -n 1)
    local restore_pwd=$(echo "${context_to_restore}" | jq -r '.pwd')
    local restore_name=$(echo "${context_to_restore}" | jq -r '.name')
    local restore_id=$(echo "${context_to_restore}" | jq -r '.id')

    log_info "Restoring context: ${restore_name}"
    log_info "ID: ${restore_id}"
    log_info "Directory: ${restore_pwd}"

    # Save to current file
    echo "${context_to_restore}" > "${CURRENT_FILE}"

    echo ""
    log_info "To restore, run:"
    echo "  cd ${restore_pwd}"
}

################################################################################
# Switch to a specific context by index
################################################################################
switch_context() {
    local index="$1"

    local total=$(wc -l < "${STACK_FILE}" 2>/dev/null || echo 0)

    if [[ ${total} -eq 0 ]]; then
        log_warning "Stack is empty"
        return 1
    fi

    if [[ ${index} -lt 1 || ${index} -gt ${total} ]]; then
        log_error "Invalid index: ${index} (must be 1-${total})"
        return 1
    fi

    # Get context by index (1-indexed from oldest to newest)
    local line_number=$((total - index + 1))
    local context=$(sed -n "${line_number}p" "${STACK_FILE}")

    local switch_name=$(echo "${context}" | jq -r '.name')
    local switch_pwd=$(echo "${context}" | jq -r '.pwd')
    local switch_id=$(echo "${context}" | jq -r '.id')

    log_info "Switching to context: ${switch_name}"
    log_info "ID: ${switch_id}"
    log_info "Directory: ${switch_pwd}"

    # Save to current file
    echo "${context}" > "${CURRENT_FILE}"

    echo ""
    log_info "To switch, run:"
    echo "  cd ${switch_pwd}"
}

################################################################################
# List all contexts on stack
################################################################################
list_contexts() {
    local total=$(wc -l < "${STACK_FILE}" 2>/dev/null || echo 0)

    if [[ ${total} -eq 0 ]]; then
        log_info "Stack is empty"
        return 0
    fi

    log_section "Stack (${total} context(s))"
    echo ""

    # List from newest (top of stack) to oldest
    local index=1
    while IFS= read -r context; do
        local name=$(echo "${context}" | jq -r '.name')
        local pwd=$(echo "${context}" | jq -r '.pwd')
        local timestamp=$(echo "${context}" | jq -r '.timestamp')
        local git_branch=$(echo "${context}" | jq -r '.git.branch')
        local notes=$(echo "${context}" | jq -r '.notes // empty')

        # Show stack marker
        if [[ ${index} -eq 1 ]]; then
            echo -e "${GREEN}[TOP]${NC} ${index}. ${name}"
        else
            echo "     ${index}. ${name}"
        fi

        echo "     PWD: ${pwd}"
        echo "     Time: ${timestamp}"

        if [[ "${git_branch}" != "none" ]]; then
            local dirty_status=""
            [[ "$(echo "${context}" | jq -r '.git.dirty')" == "true" ]] && dirty_status=" ${YELLOW}[dirty]${NC}"
            echo "     Git: ${git_branch}${dirty_status}"
        fi

        if [[ -n "${notes}" ]]; then
            echo "     Notes: ${notes}"
        fi

        echo ""
        ((index++))
    done < <(tail -r "${STACK_FILE}")
}

################################################################################
# Clear stack
################################################################################
clear_stack() {
    local total=$(wc -l < "${STACK_FILE}" 2>/dev/null || echo 0)

    if [[ ${total} -eq 0 ]]; then
        log_info "Stack is already empty"
        return 0
    fi

    log_warning "This will clear ${total} context(s) from the stack"

    read -r -p "Clear stack? (yes/no): " confirm
    if [[ ! "${confirm}" =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Cancelled"
        return 1
    fi

    > "${STACK_FILE}"
    log_success "Stack cleared"
}

################################################################################
# Shelve: Save context to named shelve
################################################################################
shelve_context() {
    local shelve_name="$1"
    local notes="${2:-}"

    if [[ -z "${shelve_name}" ]]; then
        log_error "Shelve name required"
        echo "Usage: STACK.sh shelve <name> [notes]"
        return 1
    fi

    local shelve_file="${SHELVES_DIR}/${shelve_name}.json"

    if [[ -f "${shelve_file}" ]]; then
        log_warning "Shelve '${shelve_name}' already exists"
        read -r -p "Overwrite? (yes/no): " confirm
        if [[ ! "${confirm}" =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Cancelled"
            return 1
        fi
    fi

    # Capture current context
    local pwd_hash=$(echo "$PWD" | md5 | cut -d' ' -f4 | cut -c1-8)
    local context_id="shelve-${pwd_hash}-$$"

    # Get git context
    local git_branch="none"
    local git_commit="none"
    local git_dirty="false"

    if git rev-parse --git-dir >/dev/null 2>&1; then
        git_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'none')"
        git_commit="$(git rev-parse --short HEAD 2>/dev/null || echo 'none')"
        git diff --quiet 2>/dev/null || git_dirty="true"
    fi

    # Build shelve object
    jq -n \
        --arg id "${context_id}" \
        --arg name "${shelve_name}" \
        --arg pwd "${PWD}" \
        --arg timestamp "$(date -Iseconds)" \
        --arg pwd_hash "${pwd_hash}" \
        --arg git_branch "${git_branch}" \
        --arg git_commit "${git_commit}" \
        --argjson git_dirty "${git_dirty}" \
        --arg notes "${notes}" \
        '{
            id: $id,
            name: $name,
            pwd: $pwd,
            timestamp: $timestamp,
            pwd_hash: $pwd_hash,
            git: {
                branch: $git_branch,
                commit: $git_commit,
                dirty: $git_dirty
            },
            notes: $notes
        }' > "${shelve_file}"

    log_success "Shelved: ${shelve_name}"
    log_info "ID: ${context_id}"
    log_info "Directory: ${PWD}"
}

################################################################################
# Unshelve: Restore from named shelve
################################################################################
unshelve_context() {
    local shelve_name="$1"

    if [[ -z "${shelve_name}" ]]; then
        log_error "Shelve name required"
        echo "Usage: STACK.sh unshelve <name>"
        return 1
    fi

    local shelve_file="${SHELVES_DIR}/${shelve_name}.json"

    if [[ ! -f "${shelve_file}" ]]; then
        log_error "Shelve '${shelve_name}' not found"
        echo ""
        log_info "Available shelves:"
        list_shelves
        return 1
    fi

    local context=$(cat "${shelve_file}")
    local unshelve_name=$(echo "${context}" | jq -r '.name')
    local unshelve_pwd=$(echo "${context}" | jq -r '.pwd')
    local unshelve_id=$(echo "${context}" | jq -r '.id')

    log_info "Unshelving: ${unshelve_name}"
    log_info "ID: ${unshelve_id}"
    log_info "Directory: ${unshelve_pwd}"

    # Save to current file
    echo "${context}" > "${CURRENT_FILE}"

    echo ""
    log_info "To restore, run:"
    echo "  cd ${unshelve_pwd}"
}

################################################################################
# List all shelves
################################################################################
list_shelves() {
    if [[ ! -d "${SHELVES_DIR}" ]] || [[ -z "$(ls -A "${SHELVES_DIR}" 2>/dev/null)" ]]; then
        log_info "No shelves found"
        return 0
    fi

    log_section "Shelves"
    echo ""

    local index=1
    for shelve_file in "${SHELVES_DIR}"/*.json; do
        [[ -f "${shelve_file}" ]] || continue

        local context=$(cat "${shelve_file}")
        local name=$(echo "${context}" | jq -r '.name')
        local pwd=$(echo "${context}" | jq -r '.pwd')
        local timestamp=$(echo "${context}" | jq -r '.timestamp')
        local git_branch=$(echo "${context}" | jq -r '.git.branch')
        local notes=$(echo "${context}" | jq -r '.notes // empty')

        echo "${index}. ${name}"
        echo "   PWD: ${pwd}"
        echo "   Time: ${timestamp}"

        if [[ "${git_branch}" != "none" ]]; then
            local dirty_status=""
            [[ "$(echo "${context}" | jq -r '.git.dirty')" == "true" ]] && dirty_status=" ${YELLOW}[dirty]${NC}"
            echo "   Git: ${git_branch}${dirty_status}"
        fi

        if [[ -n "${notes}" ]]; then
            echo "   Notes: ${notes}"
        fi

        echo ""
        ((index++))
    done
}

################################################################################
# Delete a shelve
################################################################################
delete_shelve() {
    local shelve_name="$1"

    if [[ -z "${shelve_name}" ]]; then
        log_error "Shelve name required"
        echo "Usage: STACK.sh delete <name>"
        return 1
    fi

    local shelve_file="${SHELVES_DIR}/${shelve_name}.json"

    if [[ ! -f "${shelve_file}" ]]; then
        log_error "Shelve '${shelve_name}' not found"
        echo ""
        log_info "Available shelves:"
        list_shelves
        return 1
    fi

    log_warning "Deleting shelve: ${shelve_name}"

    read -r -p "Delete? (yes/no): " confirm
    if [[ ! "${confirm}" =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Cancelled"
        return 1
    fi

    rm -f "${shelve_file}"
    log_success "Shelve deleted: ${shelve_name}"
}

################################################################################
# Show current context
################################################################################
show_current() {
    if [[ ! -f "${CURRENT_FILE}" ]]; then
        log_info "No current context set"
        return 0
    fi

    local context=$(cat "${CURRENT_FILE}")
    local name=$(echo "${context}" | jq -r '.name')
    local pwd=$(echo "${context}" | jq -r '.pwd')
    local timestamp=$(echo "${context}" | jq -r '.timestamp')
    local git_branch=$(echo "${context}" | jq -r '.git.branch')
    local context_id=$(echo "${context}" | jq -r '.id')

    log_section "Current Context"
    echo "ID:        ${context_id}"
    echo "Name:      ${name}"
    echo "Directory: ${pwd}"
    echo "Time:      ${timestamp}"

    if [[ "${git_branch}" != "none" ]]; then
        local dirty_status=""
        [[ "$(echo "${context}" | jq -r '.git.dirty')" == "true" ]] && dirty_status=" ${YELLOW}[dirty]${NC}"
        echo "Git:       ${git_branch}${dirty_status}"
    fi
}

################################################################################
# Status: Show stack + shelves + current
################################################################################
show_status() {
    echo ""
    show_current
    echo ""
    list_contexts
    echo ""
    list_shelves
}

################################################################################
# Usage
################################################################################
usage() {
    cat <<EOF
${CYAN}STACK.sh${NC} v${SCRIPT_VERSION} - Context Stack Management

${BOLD}USAGE:${NC}
  STACK.sh <command> [args...]

${BOLD}STACK COMMANDS:${NC}
  ${CYAN}push${NC} [name] [notes]   Push current context to stack
  ${CYAN}pop${NC} [count]              Pop context(s) from stack (default: 1)
  ${CYAN}switch${NC} <index>           Switch to context by index
  ${CYAN}list${NC}                     List all contexts on stack
  ${CYAN}clear${NC}                    Clear entire stack
  ${CYAN}current${NC}                  Show current context

${BOLD}SHELVE COMMANDS:${NC}
  ${CYAN}shelve${NC} <name> [notes]    Save current context to named shelve
  ${CYAN}unshelve${NC} <name>          Restore from named shelve
  ${CYAN}shelves${NC}                  List all shelves
  ${CYAN}delete${NC} <name>             Delete a named shelve

${BOLD}GENERAL:${NC}
  ${CYAN}status${NC}                   Show stack + shelves + current
  ${CYAN}help${NC}                      Show this help

${BOLD}EXAMPLES:${NC}
  # Push current context
  STACK.sh push "CRI integration" "Working on CRI scripts"

  # List and switch contexts
  STACK.sh list
  STACK.sh switch 2

  # Pop back to previous context
  STACK.sh pop

  # Shelve a long-term project
  STACK.sh shelve "openclaw-docs" "Documentation work"

  # Unshelve later
  STACK.sh unshelve "openclaw-docs"

  # Show everything
  STACK.sh status

${BOLD}WORKFLOW:${NC}
  1. Push context: STACK.sh push "thread-name"
  2. Start new thread (cd to different dir, work on different task)
  3. Push new context: STACK.sh push "another-thread"
  4. Switch between threads: STACK.sh list, STACK.sh switch <index>
  5. Pop when done: STACK.sh pop

${BOLD}DATA:${NC}
  Stack: ${STACK_FILE}
  Shelves: ${SHELVES_DIR}/
  Current: ${CURRENT_FILE}

EOF
}

################################################################################
# Main
################################################################################
main() {
    local command="${1:-}"
    shift || true

    case "${command}" in
        push)
            capture_context "$@"
            ;;
        pop)
            pop_context "${1:-1}"
            ;;
        switch)
            switch_context "$1"
            ;;
        list)
            list_contexts
            ;;
        clear)
            clear_stack
            ;;
        current)
            show_current
            ;;
        shelve)
            shelve_context "$@"
            ;;
        unshelve)
            unshelve_context "$1"
            ;;
        shelves)
            list_shelves
            ;;
        delete)
            delete_shelve "$1"
            ;;
        status)
            show_status
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: ${command}"
            echo ""
            usage
            exit 1
            ;;
    esac
}

setup
main "$@"
