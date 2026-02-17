# DAGifier 🦞

DAGifier is a CLI-first, low-bandwidth ASCII page viewer designed to convert complex web pages and documents into clean, structured text. It uses a "newgen" pipeline with pattern-pack detection to handle sophisticated structures like Reddit threads, blogs, and articles.

## Key Features

- **Pattern-Pack Engine**: Domain-specific YAML rules for high-fidelity extraction.
- **Threaded Rendering**: Specialized ASCII frames for nested comments and replies.
- **Diagnostic Tracing**: Use `--explain` to see exactly how content was identified.
- **Snapshot Testing**: Reliable verification via `record` and `verify` commands.
- **Persistent State**: Automatically remembers success patterns for domains in `~/.dagifier/site-state.json`.

## Installation

```bash
git clone https://github.com/jworinc/DAGifier.git
cd DAGifier
npm install
npm run build
```

## Usage

### Basic Viewing
```bash
node dist/cli.js https://example.com
```

### Threaded View (e.g., Reddit)
```bash
node dist/cli.js "https://www.reddit.com/r/..." --explain
```

### Diagnostic Mode
```bash
node dist/cli.js --explain "fixtures/reddit/thread1.html"
```

### JSON Output
```bash
node dist/cli.js --json "https://example.com"
```

## Configuration (Pattern Packs)

Pattern packs are located in the `patterns/` directory. You can define a new site structure via YAML:

```yaml
domain: example.com
selectors:
  root: "main.content"
  item: ".comment-item"
  author: ".user-name"
  body: ".text-content"
filters:
  - ".sidebar"
  - "script"
```

## Testing

DAGifier uses a fixture/golden snapshot system:

1. **Record a snapshot**:
   ```bash
   npm run test:record <URL> <NAME>
   ```
2. **Verify extractions**:
   ```bash
   npm run test:verify <URL>
   ```

## Architecture

DAGifier follows a modular pipeline:
1. **Ingestor**: Normalizes URL, File, or Stdin into a canonical payload.
2. **Extractor**: Uses `PatternEngine` to apply site-specific rules, falling back to heuristics.
3. **Renderer**: Converts the extraction tree into formatted ASCII.

---
Extracted via DAGifier | 2026
