#!/usr/bin/env bash

################################################################################
# CRI-ACTION.sh - Configuration Review & Integration Action Script
# 
# Purpose: Safe config file modification workflow with backup, validation, 
#          delta review, and rollback capabilities.
#
# Usage: Run from a directory containing the target file
#   cd workspace/config && CRI-ACTION.sh <mode> [args]
#
# Modes:
#   apply           - Interactive apply with delta review and validation
#   apply --dry-run - Show changes without applying
#   rollback [id]   - Rollback to latest or specific backup
#   list            - List available backups
#   diff [id]       - Show diff with current vs backup
#   test            - Validate syntax only
#   status          - Show file status and recent backups
#   prune [N]       - Keep only N most recent backups (default: 10)
#
################################################################################

set -euo pipefail
IFS=$'\n\t'

readonly SCRIPT_VERSION="2.0.0"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions
source "${SCRIPT_DIR}/cri-common.sh"

# Configuration
readonly MAX_INPUT_SIZE="${CRI_MAX_INPUT_MB:-10}"  # MB
readonly DEFAULT_KEEP_BACKUPS=10

# Get workspace-aware directories
CRI_DIR="$(get_cri_dir)"
readonly BACKUP_DIR="${CRI_DIR}/backups"

# State tracking
CLEANUP_TEMP_FILE=""
CLEANUP_BACKUP=""
DRY_RUN=0

################################################################################
# Cleanup handler
################################################################################
cleanup() {
    local exit_code=$?
    if [[ -n "${CLEANUP_TEMP_FILE}" && -f "${CLEANUP_TEMP_FILE}" ]]; then
        rm -f "${CLEANUP_TEMP_FILE}" 2>/dev/null || true
    fi
    if [[ -n "${CLEANUP_BACKUP}" && -f "${CLEANUP_BACKUP}" && ${exit_code} -ne 0 ]]; then
        log_warning "Backup preserved at: ${CLEANUP_BACKUP}"
    fi
    exit "${exit_code}"
}

trap cleanup EXIT INT TERM

################################################################################
# Find target file in current directory
################################################################################
find_target_file() {
    local candidates=()
    local file

    while IFS= read -r -d '' file; do
        [[ -L "${file}" ]] && continue
        [[ ! -r "${file}" ]] && continue
        [[ "$(basename "${file}")" == "$(basename "${BASH_SOURCE[0]}")" ]] && continue
        candidates+=("${file}")
    done < <(find . -maxdepth 1 -type f \( ! -name ".*" \) \( ! -name "*.sh" \) \( ! -name "*.md" \) -print0 2>/dev/null)

    if [[ ${#candidates[@]} -eq 0 ]]; then
        log_error "No target file found in current directory"
        log_info "Expected: config file (JSON/YAML/etc) in a dedicated subdirectory"
        return 1
    fi

    if [[ ${#candidates[@]} -gt 1 ]]; then
        log_error "Multiple candidate files found:"
        printf '  %s\n' "${candidates[@]}" >&2
        log_info "Use a dedicated subdirectory with a single config file"
        return 1
    fi

    realpath "${candidates[0]}"
}

################################################################################
# Get list of backups for a file
################################################################################
get_backups() {
    local file="$1"
    local basename_file
    basename_file="$(basename "${file}")"

    if [[ ! -d "${BACKUP_DIR}" ]]; then
        return 0
    fi

    find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${basename_file}.*" 2>/dev/null | sort -r
}

################################################################################
# Extract timestamp ID from backup filename
################################################################################
extract_backup_id() {
    local backup="$1"
    local basename_backup
    basename_backup="$(basename "${backup}")"
    echo "${basename_backup##*.}"
}

################################################################################
# Create backup with unique timestamp
################################################################################
create_backup() {
    local file="$1"
    local basename_file
    basename_file="$(basename "${file}")"

    mkdir -p "${BACKUP_DIR}"
    chmod 0700 "${BACKUP_DIR}"

    local timestamp
    timestamp="$(date +%Y%m%d-%H%M%S)-$$"
    local backup="${BACKUP_DIR}/${basename_file}.${timestamp}"

    cp -p "${file}" "${backup}"
    echo "${backup}"
}

################################################################################
# Validate syntax based on file extension
################################################################################
validate_syntax() {
    local file="$1"
    local content_source="${2:-file}"
    local test_result=0

    case "${file}" in
        *.json)
            log_info "Validating JSON syntax..."
            if [[ "${content_source}" == "file" ]]; then
                jq empty "${file}" 2>/dev/null || test_result=1
            else
                jq empty 2>/dev/null || test_result=1
            fi
            ;;
        *.yaml|*.yml)
            log_info "Validating YAML syntax..."
            if [[ "${content_source}" == "file" ]]; then
                python3 -c "import yaml, sys; yaml.safe_load(open('${file}'))" 2>/dev/null || test_result=1
            else
                python3 -c "import yaml, sys; yaml.safe_load(sys.stdin)" 2>/dev/null || test_result=1
            fi
            ;;
        *.sh)
            log_info "Validating shell syntax..."
            if [[ "${content_source}" == "file" ]]; then
                bash -n "${file}" 2>/dev/null || test_result=1
            else
                local temp
                temp="$(mktemp)"
                cat > "${temp}"
                bash -n "${temp}" 2>/dev/null || test_result=1
                rm -f "${temp}"
            fi
            ;;
        *)
            log_warning "No syntax validator available for this file type"
            return 2
            ;;
    esac

    return ${test_result}
}

################################################################################
# TEST MODE
################################################################################
test_mode() {
    local file="$1"

    log_section "Syntax Validation"
    log_info "File: ${file}"
    log_info "Workspace: $(get_workspace_name)"
    echo ""

    validate_syntax "${file}" "file"
    local result=$?

    if [[ ${result} -eq 0 ]]; then
        log_success "Valid"
        return 0
    elif [[ ${result} -eq 2 ]]; then
        log_warning "No validator available (skipped)"
        return 0
    else
        log_error "Invalid syntax"
        return 1
    fi
}

################################################################################
# STATUS MODE
################################################################################
status_mode() {
    local file="$1"

    log_section "Status: $(basename "${file}")"
    log_info "Workspace: $(get_workspace_name)"
    log_info "CRI Directory: ${CRI_DIR}"
    echo ""

    if [[ -f "${file}" ]]; then
        log_info "File: ${file}"
        log_info "Size: $(du -h "${file}" | cut -f1)"
        log_info "Modified: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${file}" 2>/dev/null || stat -c "%y" "${file}" 2>/dev/null | cut -d. -f1)"
        echo ""
    else
        log_error "File not found: ${file}"
        return 1
    fi

    local -a backups
    mapfile -t backups < <(get_backups "${file}")

    if [[ ${#backups[@]} -gt 0 ]]; then
        log_info "Recent backups (showing up to 5):"
        local count=0
        for backup in "${backups[@]}"; do
            ((count++))
            local backup_id
            backup_id="$(extract_backup_id "${backup}")"
            local size
            size="$(du -h "${backup}" | cut -f1)"
            local mtime
            mtime="$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${backup}" 2>/dev/null || stat -c "%y" "${backup}" 2>/dev/null | cut -d. -f1)"

            if [[ ${count} -eq 1 ]]; then
                echo -e "  ${CYAN}[LATEST]${NC} ${backup_id}  (${size}, ${mtime})"
            else
                echo "           ${backup_id}  (${size}, ${mtime})"
            fi

            [[ ${count} -ge 5 ]] && break
        done

        if [[ ${#backups[@]} -gt 5 ]]; then
            log_info "... and $((${#backups[@]} - 5)) more"
        fi
    else
        log_info "No backups found"
    fi
    echo ""

    log_info "Validation:"
    test_mode "${file}"
}

################################################################################
# LIST MODE
################################################################################
list_mode() {
    local file="$1"

    local -a backups
    mapfile -t backups < <(get_backups "${file}")

    if [[ ${#backups[@]} -eq 0 ]]; then
        log_info "No backups found for: $(basename "${file}")"
        return 0
    fi

    log_section "Backups for: $(basename "${file}")"
    log_info "Workspace: $(get_workspace_name)"
    echo ""

    local count=0
    for backup in "${backups[@]}"; do
        ((count++))
        local backup_id
        backup_id="$(extract_backup_id "${backup}")"
        local size
        size="$(du -h "${backup}" | cut -f1)"
        local mtime
        mtime="$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${backup}" 2>/dev/null || stat -c "%y" "${backup}" 2>/dev/null | cut -d. -f1)"

        if [[ ${count} -eq 1 ]]; then
            echo -e "${CYAN}[LATEST]${NC} ${backup_id}  (${size}, ${mtime})"
        else
            echo "         ${backup_id}  (${size}, ${mtime})"
        fi
    done

    echo ""
    log_info "Rollback commands:"
    echo "  $(basename "$0") rollback              # Restore latest"
    echo "  $(basename "$0") rollback <id>         # Restore specific"
    echo "  $(basename "$0") diff <id>             # Show differences"
}

################################################################################
# DIFF MODE
################################################################################
diff_mode() {
    local file="$1"
    local backup_id="$2"

    local backup
    if [[ -n "${backup_id}" ]]; then
        backup="${BACKUP_DIR}/$(basename "${file}").${backup_id}"
        if [[ ! -f "${backup}" ]]; then
            log_error "Backup not found: ${backup_id}"
            return 1
        fi
    else
        local -a backups
        mapfile -t backups < <(get_backups "${file}")
        if [[ ${#backups[@]} -eq 0 ]]; then
            log_error "No backups found"
            return 1
        fi
        backup="${backups[0]}"
        backup_id="$(extract_backup_id "${backup}")"
    fi

    log_section "Diff: Current ↔ Backup ${backup_id}"
    echo ""

    diff -u "${file}" "${backup}" || true
}

################################################################################
# APPLY MODE
################################################################################
apply_mode() {
    local file="$1"
    local dry_run="${2:-0}"

    if [[ ${dry_run} -eq 1 ]]; then
        log_section "Apply Changes (DRY RUN)"
    else
        log_section "Apply Changes"
    fi
    log_info "File: ${file}"
    log_info "Workspace: $(get_workspace_name)"
    echo ""

    echo -e "${YELLOW}${BOLD}1. Current State${NC}"
    echo "----------------------------------------"
    head -20 "${file}"
    if [[ $(wc -l < "${file}") -gt 20 ]]; then
        log_info "... ($(wc -l < "${file}") total lines)"
    fi
    echo ""

    echo -e "${YELLOW}${BOLD}2. Proposed Change${NC}"
    echo "----------------------------------------"
    log_info "Paste new content (Ctrl+D when done, Ctrl+C to cancel)"
    log_info "Max size: ${MAX_INPUT_SIZE}MB"
    echo ""

    local temp_input
    temp_input="$(mktemp)"
    CLEANUP_TEMP_FILE="${temp_input}"

    dd bs=1M count="${MAX_INPUT_SIZE}" of="${temp_input}" 2>/dev/null || {
        log_error "Input exceeds size limit (${MAX_INPUT_SIZE}MB)"
        return 1
    }

    if [[ ! -s "${temp_input}" ]]; then
        log_error "No content provided"
        return 1
    fi

    echo ""
    echo -e "${YELLOW}${BOLD}3. Delta${NC}"
    echo "----------------------------------------"
    diff -u "${file}" "${temp_input}" || true
    echo ""

    echo -e "${YELLOW}${BOLD}4. Validation${NC}"
    echo "----------------------------------------"

    validate_syntax "${file}" "stdin" < "${temp_input}"
    local test_result=$?

    if [[ ${test_result} -eq 0 ]]; then
        log_success "Syntax validation passed"
    elif [[ ${test_result} -eq 2 ]]; then
        log_warning "No validator available (skipped)"
    else
        log_error "Syntax validation failed"
        echo ""
        read -r -p "Proceed anyway? (yes/no): " proceed
        if [[ ! "${proceed}" =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Aborted"
            return 1
        fi
    fi
    echo ""

    if [[ ${dry_run} -eq 1 ]]; then
        log_success "Dry run complete - no changes applied"
        return 0
    fi

    echo -e "${YELLOW}${BOLD}5. Backup${NC}"
    echo "----------------------------------------"
    local backup
    backup="$(create_backup "${file}")"
    CLEANUP_BACKUP="${backup}"
    local backup_id
    backup_id="$(extract_backup_id "${backup}")"
    log_success "Created backup: ${backup_id}"
    echo ""

    echo -e "${YELLOW}${BOLD}6. Confirm${NC}"
    echo "----------------------------------------"
    log_info "Recovery command:"
    echo "  $(basename "$0") rollback ${backup_id}"
    echo ""
    read -r -p "Apply this change? (yes/no): " confirm

    if [[ ! "${confirm}" =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Change cancelled"
        log_info "Backup preserved at: ${backup}"
        return 1
    fi

    echo ""
    log_info "Applying change..."

    local temp_output
    temp_output="$(mktemp)"
    cp "${temp_input}" "${temp_output}"
    chmod --reference="${file}" "${temp_output}" 2>/dev/null || chmod 0644 "${temp_output}"

    mv -f "${temp_output}" "${file}"

    validate_syntax "${file}" "file" >/dev/null 2>&1 || {
        log_error "Applied change failed validation!"
        log_warning "Rolling back..."
        cp "${backup}" "${file}"
        log_success "Rolled back to backup: ${backup_id}"
        return 1
    }

    CLEANUP_BACKUP=""

    echo ""
    log_success "Change applied successfully"
    log_info "Backup: ${backup_id}"
}

################################################################################
# ROLLBACK MODE
################################################################################
rollback_mode() {
    local file="$1"
    local backup_id="$2"

    local backup
    if [[ -n "${backup_id}" ]]; then
        backup="${BACKUP_DIR}/$(basename "${file}").${backup_id}"
        if [[ ! -f "${backup}" ]]; then
            log_error "Backup not found: ${backup_id}"
            return 1
        fi
    else
        local -a backups
        mapfile -t backups < <(get_backups "${file}")
        if [[ ${#backups[@]} -eq 0 ]]; then
            log_error "No backups found"
            return 1
        fi
        backup="${backups[0]}"
        backup_id="$(extract_backup_id "${backup}")"
    fi

    log_section "Rollback to: ${backup_id}"
    log_info "File: ${file}"
    log_info "Workspace: $(get_workspace_name)"
    echo ""

    echo -e "${YELLOW}Delta (Current → Backup)${NC}"
    echo "----------------------------------------"
    diff -u "${file}" "${backup}" || true
    echo ""

    read -r -p "Restore this backup? (yes/no): " confirm
    if [[ ! "${confirm}" =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Rollback cancelled"
        return 1
    fi

    log_info "Creating safety backup of current state..."
    local safety_backup
    safety_backup="$(create_backup "${file}")"
    local safety_id
    safety_id="$(extract_backup_id "${safety_backup}")"
    log_success "Safety backup: ${safety_id}"
    echo ""

    log_info "Restoring from backup..."
    cp "${backup}" "${file}"

    validate_syntax "${file}" "file" >/dev/null 2>&1 || {
        log_error "Restored backup failed validation!"
        log_warning "This backup may be corrupt"
        return 1
    }

    echo ""
    log_success "Rollback completed"
    log_info "Restored from: ${backup_id}"
    log_info "Previous state saved as: ${safety_id}"
}

################################################################################
# PRUNE MODE
################################################################################
prune_mode() {
    local file="$1"
    local keep="${2:-${DEFAULT_KEEP_BACKUPS}}"

    if ! [[ "${keep}" =~ ^[0-9]+$ ]] || [[ ${keep} -lt 1 ]]; then
        log_error "Invalid keep count: ${keep}"
        return 1
    fi

    local -a backups
    mapfile -t backups < <(get_backups "${file}")

    if [[ ${#backups[@]} -le ${keep} ]]; then
        log_info "Only ${#backups[@]} backup(s) found, keeping all"
        return 0
    fi

    local to_remove=$((${#backups[@]} - keep))

    log_section "Prune Backups"
    log_info "Total backups: ${#backups[@]}"
    log_info "Keeping: ${keep}"
    log_info "Removing: ${to_remove}"
    echo ""

    log_info "Will remove:"
    for ((i=keep; i<${#backups[@]}; i++)); do
        local backup_id
        backup_id="$(extract_backup_id "${backups[$i]}")"
        echo "  ${backup_id}"
    done
    echo ""

    read -r -p "Proceed? (yes/no): " confirm
    if [[ ! "${confirm}" =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Prune cancelled"
        return 1
    fi

    for ((i=keep; i<${#backups[@]}; i++)); do
        rm -f "${backups[$i]}"
    done

    log_success "Removed ${to_remove} old backup(s)"
}

################################################################################
# USAGE
################################################################################
usage() {
    cat <<EOF
${CYAN}CRI-ACTION.sh${NC} v${SCRIPT_VERSION} - Configuration Review & Integration

${BOLD}USAGE:${NC}
  cd <directory-with-config> && $(basename "$0") <mode> [options]

${BOLD}MODES:${NC}
  ${CYAN}apply${NC}              Apply changes with review workflow
  ${CYAN}apply --dry-run${NC}    Preview changes without applying
  ${CYAN}rollback [id]${NC}      Rollback to latest or specific backup
  ${CYAN}list${NC}               List available backups
  ${CYAN}diff [id]${NC}          Show diff between current and backup
  ${CYAN}test${NC}               Validate syntax only
  ${CYAN}status${NC}             Show file info and recent backups
  ${CYAN}prune [N]${NC}          Keep only N most recent backups (default: ${DEFAULT_KEEP_BACKUPS})

${BOLD}EXAMPLES:${NC}
  cd workspace/config && $(basename "$0") apply
  cd workspace/config && $(basename "$0") rollback
  cd workspace/config && $(basename "$0") rollback 20260212-154734-12345
  cd workspace/config && $(basename "$0") diff 20260212-154734-12345
  cd workspace/config && $(basename "$0") prune 5

${BOLD}WORKSPACE:${NC}
  Current workspace: $(get_workspace_name)
  CRI directory: ${CRI_DIR}
  Backups: ${BACKUP_DIR}

EOF
}

################################################################################
# MAIN
################################################################################
main() {
    local mode="${1:-}"
    shift || true

    if [[ -z "${mode}" || "${mode}" == "help" || "${mode}" == "--help" || "${mode}" == "-h" ]]; then
        usage
        exit 0
    fi

    if [[ "${mode}" == "apply" ]] && [[ "${1:-}" == "--dry-run" ]]; then
        DRY_RUN=1
        shift || true
    fi

    local file
    file="$(find_target_file)" || exit 1

    validate_file_safety "${file}" || exit 1

    case "${mode}" in
        apply)
            apply_mode "${file}" "${DRY_RUN}"
            ;;
        rollback)
            rollback_mode "${file}" "${1:-}"
            ;;
        list)
            list_mode "${file}"
            ;;
        diff)
            diff_mode "${file}" "${1:-}"
            ;;
        test)
            test_mode "${file}"
            ;;
        status)
            status_mode "${file}"
            ;;
        prune)
            prune_mode "${file}" "${1:-${DEFAULT_KEEP_BACKUPS}}"
            ;;
        *)
            log_error "Unknown mode: ${mode}"
            echo ""
            usage
            exit 1
            ;;
    esac
}

main "$@"
