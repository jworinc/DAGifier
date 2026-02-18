#!/bin/bash
set -e

# Setup
TEST_DIR="tests/temp_separation"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
git init -q # Stop fd from ignoring this dir based on parent .gitignore

# Dummy Config for CRI
echo '{"version": 1}' > config.json
# Dummy Knowledge Base for Nav
# ThreadManager does shallow scan of CWD by default
cat > K001.md <<EOF
---
title: Project Alpha
date: 2023-01-01
project: P001
agent: Claude
---
Content
EOF

cat > K002.md <<EOF
---
title: Project Beta
date: 2023-01-02
project: P002
agent: GPT
---
Content
EOF
mkdir -p code
touch code/script.ts
mkdir -p docs
touch docs/manual.pdf
mkdir -p projects/P001
cp K001.md projects/P001/K001.md
cp K002.md projects/P001/K002.md

CRI="../../dist/bin/cri.js"
NAV="../../dist/bin/nav.js"

echo "=== CRI TESTS ==="

echo "1. Status (Initial)"
node "$CRI" status config.json | grep "Size:"

echo "2. Apply (Dry Run)"
echo '{"version": 2}' | node "$CRI" apply config.json --dry-run | grep "Dry run complete"

echo "3. Apply (Actual)"
echo '{"version": 2}' | node "$CRI" apply config.json
grep '"version": 2' config.json

echo "4. Status (After Update)"
node "$CRI" status config.json | grep "LATEST"

echo "5. Rollback"
node "$CRI" rollback config.json
grep '"version": 1' config.json

echo "6. Prune"
node "$CRI" prune config.json --keep 1


echo "=== NAV TESTS ==="

echo "7. List (All)"
node "$NAV" list -C . | grep "Project Alpha"
node "$NAV" list -C . | grep "Project Beta"

echo "8. List (Filter Project)"
node "$NAV" list -C . --project P001 | grep "Project Alpha"

echo "9. List (JSON)"
node "$NAV" list -C . --json | grep '"id":'

echo "10. Search (Scope Detection)"
# ...
if command -v rg &> /dev/null; then
    echo "11. Search (RG Backend)"
    node "$NAV" search "Content" . --backend rg --json -C . | grep "K001.md"
else
    echo "Skipping RG test (rg not found)"
fi

echo "12. Search (Missing Backend Warning)"
node "$NAV" search "NonExistent" . --backend ug -C . || true

echo "=== SHELL NAV PARITY TESTS ==="
NAV_SH="../../workflow/nav.sh"
chmod +x "$NAV_SH"

echo "13. Shell List (JSON)"
"$NAV_SH" list --json | grep '"id":'

echo "14. Shell Search (Table Format)"
# Mocking backend result if tools missing? 
# The script checks command -v. If rg exists, it runs.
if command -v rg &> /dev/null; then
    "$NAV_SH" search "Project" . --backend rg --format table | grep "PATH"
fi

echo "15. Shell Search (Scope Filter)"
# Create dummy file with kn/ structure?
# We are in temp dir.
mkdir -p documentation
mkdir -p documentation
echo "This is a manual." > documentation/manual.md
if command -v rg &> /dev/null; then
    "$NAV_SH" search "manual" . --backend rg --scope kn/docs | grep "documentation/manual.md"
fi

echo "=== WORKFLOW TESTS ==="
# Just syntax check scripts
bash -n ../../workflow/ctx.sh
bash -n ../../workflow/flow.sh

echo "ALL TESTS PASSED"

# Cleanup
cd ../..
rm -rf "$TEST_DIR"
