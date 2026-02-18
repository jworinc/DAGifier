#!/bin/bash
set -e

echo "Building..."
npm run build

echo "1. Verify threads command help"
node dist/cli.js threads --help

echo "2. Verify config command help"
node dist/cli.js config --help

echo "3. Test Config Status"
touch test_config.json
echo '{"foo": "bar"}' > test_config.json
node dist/cli.js config status test_config.json

echo "4. Test Config Apply (Dry Run)"
echo '{"foo": "baz"}' | node dist/cli.js config apply test_config.json --dry-run

echo "5. Cleanup"
rm test_config.json
rm -rf .meta
rm -rf .cri

echo "Verification Passed!"
