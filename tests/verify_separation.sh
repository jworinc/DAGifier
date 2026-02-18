#!/bin/bash
set -e

echo "1. Verifying CRI binary..."
node dist/bin/cri.js --help

echo "2. Verifying Nav binary..."
node dist/bin/nav.js --help

echo "3. Verifying Nav Search (Dry Run)..."
# Just help to ensure command loads
node dist/bin/nav.js search --help

echo "Separation Verification Passed!"
