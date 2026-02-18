#!/usr/bin/env bash

################################################################################
# CRI-VALIDATE.sh - Configuration Pre-flight Validation
# 
# Purpose: Validate configs before applying changes
# Usage: CRI-VALIDATE.sh <config-file> [--schema <schema-file>]
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
readonly SCHEMA_DIR="${CRI_DIR}/schemas"

# Validation results
declare -a ERRORS=()
declare -a WARNINGS=()
declare -a INFO=()

################################################################################
# Logging with result tracking
################################################################################
log_error_tracked() {
    ERRORS+=("$*")
    log_error "$*"
}

log_warning_tracked() {
    WARNINGS+=("$*")
    log_warning "$*"
}

log_info_tracked() {
    INFO+=("$*")
    log_info "$*"
}

################################################################################
# Syntax validation
################################################################################
validate_syntax() {
    local file="$1"

    log_section "Syntax Validation"

    case "${file}" in
        *.json)
            if jq empty "${file}" 2>/dev/null; then
                log_success "JSON syntax valid"
                return 0
            else
                log_error_tracked "Invalid JSON syntax"
                jq . "${file}" 2>&1 | head -5 >&2
                return 1
            fi
            ;;
        *.yaml|*.yml)
            if python3 -c "import yaml; yaml.safe_load(open('${file}'))" 2>/dev/null; then
                log_success "YAML syntax valid"
                return 0
            else
                log_error_tracked "Invalid YAML syntax"
                return 1
            fi
            ;;
        *)
            log_warning_tracked "No syntax validator for file type"
            return 2
            ;;
    esac
}

################################################################################
# Schema validation (if schema provided)
################################################################################
validate_schema() {
    local file="$1"
    local schema="${2:-}"

    [[ -z "${schema}" ]] && return 0

    echo ""
    log_section "Schema Validation"

    if [[ ! -f "${schema}" ]]; then
        log_warning_tracked "Schema file not found: ${schema}"
        return 2
    fi

    # Use jsonschema CLI if available
    if command -v jsonschema &>/dev/null; then
        if jsonschema -i "${file}" "${schema}" 2>/dev/null; then
            log_success "Schema validation passed"
            return 0
        else
            log_error_tracked "Schema validation failed"
            jsonschema -i "${file}" "${schema}" 2>&1 | head -10 >&2
            return 1
        fi
    else
        log_warning_tracked "jsonschema CLI not installed (pip install jsonschema)"
        return 2
    fi
}

################################################################################
# OpenClaw-specific validation
################################################################################
validate_openclaw_config() {
    local file="$1"

    # Only for openclaw.json
    [[ ! "${file}" =~ openclaw\.json$ ]] && return 0

    echo ""
    log_section "OpenClaw-Specific Validation"

    # Check required fields
    local required_fields=("meta.version" "gateway.mode")
    for field in "${required_fields[@]}"; do
        if ! jq -e ".${field}" "${file}" >/dev/null 2>&1; then
            log_error_tracked "Missing required field: ${field}"
        else
            local value=$(jq -r ".${field}" "${file}")
            log_success "Field ${field} = ${value}"
        fi
    done

    # Check gateway.mode is valid
    local mode=$(jq -r '.gateway.mode // "unset"' "${file}")
    case "${mode}" in
        local|remote|hybrid)
            log_success "gateway.mode is valid: ${mode}"
            ;;
        unset)
            log_error_tracked "gateway.mode is not set"
            ;;
        *)
            log_error_tracked "gateway.mode has invalid value: ${mode}"
            ;;
    esac

    # Check gateway.bind and trustedProxies consistency
    local bind=$(jq -r '.gateway.bind // "127.0.0.1"' "${file}")
    local proxies=$(jq -r '.gateway.trustedProxies // [] | length' "${file}")

    if [[ "${bind}" == "0.0.0.0" && ${proxies} -eq 0 ]]; then
        log_warning_tracked "gateway.bind=0.0.0.0 but no trustedProxies defined (security risk)"
    fi

    # Check if models reference valid providers
    local models=$(jq -r '.models[]?.provider // empty' "${file}" 2>/dev/null || true)
    if [[ -n "${models}" ]]; then
        while IFS= read -r provider; do
            [[ -z "${provider}" ]] && continue
            if jq -e ".providers.\"${provider}\"" "${file}" >/dev/null 2>&1; then
                log_success "Model provider exists: ${provider}"
            else
                log_error_tracked "Model references non-existent provider: ${provider}"
            fi
        done <<< "${models}"
    fi
}

################################################################################
# OpenClaw doctor integration
################################################################################
validate_openclaw_doctor() {
    local file="$1"

    [[ ! "${file}" =~ openclaw\.json$ ]] && return 0

    echo ""
    log_section "OpenClaw Doctor Check"

    if ! command -v openclaw &>/dev/null; then
        log_warning_tracked "openclaw CLI not found (skipping doctor check)"
        return 2
    fi

    # Check if we're in a workspace with openclaw config
    local openclaw_config="${HOME}/.openclaw/openclaw.json"
    if [[ ! -f "${openclaw_config}" ]]; then
        log_warning_tracked "OpenClaw config not found at ${openclaw_config} (skipping doctor)"
        return 2
    fi

    # Backup current config
    local backup="/tmp/openclaw.json.backup.$$"
    cp "${openclaw_config}" "${backup}" 2>/dev/null || {
        log_warning_tracked "Cannot backup current config (skipping doctor)"
        return 2
    }

    # Temporarily install new config
    cp "${file}" "${openclaw_config}"

    # Run doctor
    if openclaw doctor --quiet 2>/dev/null; then
        log_success "openclaw doctor passed"
        local result=0
    else
        log_error_tracked "openclaw doctor found issues"
        openclaw doctor 2>&1 | grep -E "(WARN|ERROR)" | head -10 >&2 || true
        local result=1
    fi

    # Restore original
    mv "${backup}" "${openclaw_config}"

    return ${result}
}

################################################################################
# Summary
################################################################################
show_summary() {
    echo ""
    log_section "Validation Summary"
    echo "Workspace: $(get_workspace_name)"
    echo "Errors:   ${#ERRORS[@]}"
    echo "Warnings: ${#WARNINGS[@]}"
    echo "Info:     ${#INFO[@]}"

    if [[ ${#ERRORS[@]} -eq 0 ]]; then
        echo ""
        log_success "Validation passed - safe to apply"
        return 0
    else
        echo ""
        log_error "Validation failed - do not apply"
        return 1
    fi
}

################################################################################
# Usage
################################################################################
usage() {
    cat <<EOF
${CYAN}CRI-VALIDATE.sh${NC} v${SCRIPT_VERSION} - Configuration Pre-flight Validation

${BOLD}USAGE:${NC}
  CRI-VALIDATE.sh <config-file> [--schema <schema-file>]

${BOLD}EXAMPLES:${NC}
  CRI-VALIDATE.sh openclaw.json
  CRI-VALIDATE.sh openclaw.json --schema openclaw.schema.json
  CRI-VALIDATE.sh approvals.json

${BOLD}VALIDATIONS PERFORMED:${NC}
  1. Syntax validation (JSON/YAML)
  2. Schema validation (if schema provided)
  3. OpenClaw-specific rules (for openclaw.json)
  4. openclaw doctor check (if available)

${BOLD}EXIT CODES:${NC}
  0 - Validation passed (safe to apply)
  1 - Validation failed (errors found)
  2 - Validation skipped (missing tools)

${BOLD}WORKSPACE:${NC}
  Current workspace: $(get_workspace_name)
  Schema directory: ${SCHEMA_DIR}

EOF
}

################################################################################
# Main
################################################################################
main() {
    local file=""
    local schema=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --schema)
                schema="$2"
                shift 2
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                file="$1"
                shift
                ;;
        esac
    done

    if [[ -z "${file}" ]]; then
        usage
        exit 1
    fi

    if [[ ! -f "${file}" ]]; then
        log_error "File not found: ${file}"
        exit 1
    fi

    echo -e "${CYAN}Validating: ${file}${NC}"
    echo -e "${CYAN}Workspace: $(get_workspace_name)${NC}"
    echo ""

    # Run validations
    validate_syntax "${file}"
    validate_schema "${file}" "${schema}"
    validate_openclaw_config "${file}"
    validate_openclaw_doctor "${file}"

    # Show summary and exit
    show_summary
}

main "$@"
