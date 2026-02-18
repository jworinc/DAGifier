#!/usr/bin/env bash

################################################################################
# test-cri-scripts.sh - Comprehensive Test Suite for CRI Scripts
# 
# Purpose: Verify all CRI scripts work correctly with workspace detection
# Usage: ./test-cri-scripts.sh [--verbose]
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
readonly NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Verbose mode
VERBOSE=0
[[ "${1:-}" == "--verbose" ]] && VERBOSE=1

# Test directory
TEST_ROOT="/tmp/cri-test-$$"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

################################################################################
# Test utilities
################################################################################
log_test() {
    echo -e "${CYAN}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((TESTS_FAILED++))
}

log_verbose() {
    [[ ${VERBOSE} -eq 1 ]] && echo -e "${BLUE}[DEBUG]${NC} $*"
}

run_test() {
    local test_name="$1"
    ((TESTS_RUN++))
    log_test "${test_name}"
}

assert_eq() {
    local expected="$1"
    local actual="$2"
    local message="${3:-}"

    if [[ "${expected}" == "${actual}" ]]; then
        log_pass "${message}"
        return 0
    else
        log_fail "${message}"
        log_verbose "Expected: ${expected}"
        log_verbose "Actual: ${actual}"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-}"

    if [[ "${haystack}" == *"${needle}"* ]]; then
        log_pass "${message}"
        return 0
    else
        log_fail "${message}"
        log_verbose "Expected to contain: ${needle}"
        log_verbose "Actual: ${haystack}"
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    local message="${2:-File exists: ${file}}"

    if [[ -f "${file}" ]]; then
        log_pass "${message}"
        return 0
    else
        log_fail "${message}"
        return 1
    fi
}

assert_dir_exists() {
    local dir="$1"
    local message="${2:-Directory exists: ${dir}}"

    if [[ -d "${dir}" ]]; then
        log_pass "${message}"
        return 0
    else
        log_fail "${message}"
        return 1
    fi
}

################################################################################
# Setup test environment
################################################################################
setup_test_env() {
    log_test "Setting up test environment"

    rm -rf "${TEST_ROOT}"
    mkdir -p "${TEST_ROOT}"

    # Create test workspace structure
    mkdir -p "${TEST_ROOT}/workspace-alpha/.meta"
    mkdir -p "${TEST_ROOT}/workspace-alpha/config"
    mkdir -p "${TEST_ROOT}/workspace-beta/.meta"
    mkdir -p "${TEST_ROOT}/workspace-beta/config"

    # Create test config files
    cat > "${TEST_ROOT}/workspace-alpha/config/test.json" <<'EOF'
{
  "meta": {
    "version": "1.0.0"
  },
  "gateway": {
    "mode": "local"
  }
}
EOF

    cat > "${TEST_ROOT}/workspace-beta/config/test.json" <<'EOF'
{
  "meta": {
    "version": "1.0.0"
  },
  "gateway": {
    "mode": "remote"
  }
}
EOF

    log_pass "Test environment created: ${TEST_ROOT}"
}

################################################################################
# Test 1: cri-common.sh - Workspace detection
################################################################################
test_workspace_detection() {
    run_test "Workspace Detection"

    # Source common library
    source "${SCRIPT_DIR}/cri-common.sh"

    # Test 1: Detect workspace-alpha
    cd "${TEST_ROOT}/workspace-alpha/config"
    local workspace_root
    workspace_root="$(find_workspace_root)"
    assert_eq "${TEST_ROOT}/workspace-alpha" "${workspace_root}" "Detected workspace-alpha from config/"

    # Test 2: Detect workspace-beta
    cd "${TEST_ROOT}/workspace-beta/config"
    workspace_root="$(find_workspace_root)"
    assert_eq "${TEST_ROOT}/workspace-beta" "${workspace_root}" "Detected workspace-beta from config/"

    # Test 3: Get workspace name
    local workspace_name
    workspace_name="$(get_workspace_name)"
    assert_eq "workspace-beta" "${workspace_name}" "Workspace name is workspace-beta"

    # Test 4: CRI directory creation
    local cri_dir
    cri_dir="$(get_cri_dir)"
    assert_eq "${TEST_ROOT}/workspace-beta/.meta/cri" "${cri_dir}" "CRI directory path correct"
    assert_dir_exists "${cri_dir}" "CRI directory auto-created"
    assert_file_exists "${cri_dir}/config.json" "CRI config.json created"
}

################################################################################
# Test 2: CRI-ACTION.sh - Basic operations
################################################################################
test_cri_action() {
    run_test "CRI-ACTION.sh Operations"

    cd "${TEST_ROOT}/workspace-alpha/config"

    # Test 1: Status command
    local output
    output=$("${SCRIPT_DIR}/CRI-ACTION.sh" status 2>&1 || true)
    assert_contains "${output}" "workspace-alpha" "Status shows correct workspace"
    assert_contains "${output}" "Valid" "Status validates syntax"

    # Test 2: List backups (should be empty)
    output=$("${SCRIPT_DIR}/CRI-ACTION.sh" list 2>&1)
    assert_contains "${output}" "No backups found" "No backups initially"

    # Test 3: Backup directory creation
    assert_dir_exists "${TEST_ROOT}/workspace-alpha/.meta/cri/backups" "Backup directory created"
}

################################################################################
# Test 3: CRI-VALIDATE.sh - Validation
################################################################################
test_cri_validate() {
    run_test "CRI-VALIDATE.sh Validation"

    cd "${TEST_ROOT}/workspace-alpha/config"

    # Test 1: Valid JSON
    local exit_code=0
    "${SCRIPT_DIR}/CRI-VALIDATE.sh" test.json >/dev/null 2>&1 || exit_code=$?
    assert_eq 0 "${exit_code}" "Valid JSON passes validation"

    # Test 2: Invalid JSON
    echo "{ invalid json" > "${TEST_ROOT}/workspace-alpha/config/invalid.json"
    exit_code=0
    "${SCRIPT_DIR}/CRI-VALIDATE.sh" invalid.json >/dev/null 2>&1 || exit_code=$?
    assert_eq 1 "${exit_code}" "Invalid JSON fails validation"

    rm "${TEST_ROOT}/workspace-alpha/config/invalid.json"
}

################################################################################
# Test 4: CRI-TRACE.sh - Tracing
################################################################################
test_cri_trace() {
    run_test "CRI-TRACE.sh Tracing"

    cd "${TEST_ROOT}/workspace-alpha/config"

    # Test 1: Wrap a command
    local output
    output=$("${SCRIPT_DIR}/CRI-TRACE.sh" echo "test command" 2>&1)
    assert_contains "${output}" "Trace logged" "Command traced successfully"

    # Test 2: Verify audit log created
    assert_file_exists "${TEST_ROOT}/workspace-alpha/.meta/cri/audit.jsonl" "Audit log created"

    # Test 3: Query traces
    output=$("${SCRIPT_DIR}/CRI-TRACE.sh" --query list 2>&1)
    assert_contains "${output}" "workspace-alpha" "Trace shows correct workspace"
    assert_contains "${output}" "test command" "Trace contains command"

    # Test 4: Workspace isolation
    cd "${TEST_ROOT}/workspace-beta/config"
    output=$("${SCRIPT_DIR}/CRI-TRACE.sh" --query list 2>&1)
    if [[ "${output}" == *"workspace-alpha"* ]]; then
        log_fail "Workspace isolation - beta sees alpha traces"
    else
        log_pass "Workspace isolation - beta does not see alpha traces"
    fi
}

################################################################################
# Test 5: Workspace isolation
################################################################################
test_workspace_isolation() {
    run_test "Workspace Isolation"

    # Generate activity in workspace-alpha
    cd "${TEST_ROOT}/workspace-alpha/config"
    "${SCRIPT_DIR}/CRI-TRACE.sh" echo "alpha activity" >/dev/null 2>&1

    # Generate activity in workspace-beta
    cd "${TEST_ROOT}/workspace-beta/config"
    "${SCRIPT_DIR}/CRI-TRACE.sh" echo "beta activity" >/dev/null 2>&1

    # Verify alpha audit log
    local alpha_log="${TEST_ROOT}/workspace-alpha/.meta/cri/audit.jsonl"
    if grep -q "alpha activity" "${alpha_log}" && ! grep -q "beta activity" "${alpha_log}"; then
        log_pass "Alpha workspace only contains alpha traces"
    else
        log_fail "Alpha workspace audit log contaminated"
    fi

    # Verify beta audit log
    local beta_log="${TEST_ROOT}/workspace-beta/.meta/cri/audit.jsonl"
    if grep -q "beta activity" "${beta_log}" && ! grep -q "alpha activity" "${beta_log}"; then
        log_pass "Beta workspace only contains beta traces"
    else
        log_fail "Beta workspace audit log contaminated"
    fi
}

################################################################################
# Test 6: CRI directory structure
################################################################################
test_cri_directory_structure() {
    run_test "CRI Directory Structure"

    cd "${TEST_ROOT}/workspace-alpha/config"

    # Trigger CRI initialization
    "${SCRIPT_DIR}/CRI-ACTION.sh" status >/dev/null 2>&1

    # Verify structure
    assert_dir_exists "${TEST_ROOT}/workspace-alpha/.meta/cri" ".meta/cri created"
    assert_file_exists "${TEST_ROOT}/workspace-alpha/.meta/cri/config.json" "CRI config.json exists"
    assert_dir_exists "${TEST_ROOT}/workspace-alpha/.meta/cri/backups" "Backups directory exists"

    # Verify config.json contents
    local cri_config="${TEST_ROOT}/workspace-alpha/.meta/cri/config.json"
    if jq -e '.workspace_root' "${cri_config}" >/dev/null 2>&1; then
        log_pass "CRI config contains workspace_root"
    else
        log_fail "CRI config missing workspace_root"
    fi
}

################################################################################
# Cleanup
################################################################################
cleanup_test_env() {
    log_test "Cleaning up test environment"
    rm -rf "${TEST_ROOT}"
    log_pass "Test environment cleaned"
}

################################################################################
# Main
################################################################################
main() {
    echo ""
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}CRI Scripts Test Suite${NC}"
    echo -e "${CYAN}================================${NC}"
    echo ""

    setup_test_env
    echo ""

    test_workspace_detection
    echo ""

    test_cri_action
    echo ""

    test_cri_validate
    echo ""

    test_cri_trace
    echo ""

    test_workspace_isolation
    echo ""

    test_cri_directory_structure
    echo ""

    cleanup_test_env
    echo ""

    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}Test Summary${NC}"
    echo -e "${CYAN}================================${NC}"
    echo "Tests Run:    ${TESTS_RUN}"
    echo -e "${GREEN}Tests Passed: ${TESTS_PASSED}${NC}"
    if [[ ${TESTS_FAILED} -gt 0 ]]; then
        echo -e "${RED}Tests Failed: ${TESTS_FAILED}${NC}"
        echo ""
        exit 1
    else
        echo -e "${GREEN}All tests passed!${NC}"
        echo ""
        exit 0
    fi
}

main "$@"
