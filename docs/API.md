# API Documentation

> Last updated: 2026-02-17

## Overview

Dagifier is designed to be embedded in other Node.js applications. The core library exports the `Coordinator` class, which handles the entire extraction pipeline, and the `PageDoc` interface, which describes the output.

---

## Installation

```bash
npm install dagifier
```

---

## Core Usage

### Coordinator

The `Coordinator` class orchestrates the ingestion, pattern matching, extraction, and optional browser rendering.

```typescript
import { Coordinator, PatternEngine } from 'dagifier';
import path from 'path';

// 1. Initialize the pattern engine
const engine = new PatternEngine(path.join(__dirname, 'patterns'));
await engine.loadPacks();

// 2. Create the coordinator
const coordinator = new Coordinator(engine);

// 3. Process a URL
const result = await coordinator.process('https://example.com/article', {
  mode: 'auto',       // 'auto' | 'thread' | 'article'
  rendered: false,    // Force Playwright rendering?
  verbose: true       // Log progress to stderr?
});

console.log(result.doc.title);
```

### Result Object

The `process()` method returns a `CoordinatorResult` object:

```typescript
interface CoordinatorResult {
  doc: PageDoc;           // The extracted document content
  trace: Trace;           // Diagnostic trace of the extraction process
  payload: IngestionPayload; // Metadata about the source input
}
```

---

## Data Models

### PageDoc

The `PageDoc` is the structured representation of the page content.

```typescript
interface PageDoc {
  title: string;
  url?: string;
  author?: string;
  published?: string; // ISO date string
  
  // The type of content
  kind: 'article' | 'thread' | 'mixed';
  
  // The extracted content blocks
  content: ContentBlock[];
  
  // Flattened list of all links found in the content
  links: LinkRef[];
  
  // Metadata about the extraction
  meta: {
    source: 'url' | 'file' | 'stdin';
    executionTime: number;
    jsonLd: boolean; // Was metadata extracted from JSON-LD?
    ...
  };
}
```

### ContentBlock

Content is represented as a list of blocks. Threaded content is recursive.

```typescript
type ContentBlock = 
  | { type: 'text', text: string }
  | { type: 'heading', level: number, text: string }
  | { type: 'list', items: string[] }
  | { type: 'code', text: string, language?: string }
  | { type: 'quote', text: string, author?: string }
  | { type: 'thread-item', 
      level: number, 
      author: string, 
      content: ContentBlock[],
      children: ContentBlock[] 
    };
```

---

## Advanced Usage

### Custom Pattern Packs

You can inject custom patterns directly into the engine if you don't want to load them from files.

```typescript
engine.addPack({
  domain: 'example.com',
  selectors: {
    root: 'article.main-content',
    title: 'h1.headline',
    author: '.byline a'
  }
});
```

### Direct Browser Access

If you need to use the headless browser directly for other tasks (e.g., screenshots), you can access the `BrowserAdapter` via the internal API, but it's recommended to stick to `Coordinator` for extraction tasks.

---

## Error Handling

The `Coordinator` throws standard Errors. 

- `IngestionError`: Failed to fetch or read input.
- `ExtractionError`: Pipeline failed (e.g. malformed HTML).
- `BrowserError`: Playwright failed to launch or navigate.

Wrap your calls in `try/catch` and inspect the error message.

```typescript
try {
  await coordinator.process(url);
} catch (error) {
  console.error('Extraction failed:', error.message);
}
```
