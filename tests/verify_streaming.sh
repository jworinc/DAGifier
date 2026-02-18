# Create a slow producer of URLs
echo "Checking streaming behavior..."
(
    echo "https://example.com"
    sleep 2
    echo "https://example.org"
    sleep 2
    echo "https://google.com"
    sleep 2
) | npx tsx src/cli.ts - --ndjson --metadata-only | while read line; do echo "$(date '+%H:%M:%S') $line"; done
