# DAGifier API & Integration Reference

This document outlines the internal structure and integration points for DAGifier as a library or tool.

## Data Structures

### PageDoc
The canonical intermediate representation of a page.
```typescript
interface PageDoc {
    title: string;
    url?: string;
    content: ContentBlock[];
    metadata: Record<string, any>;
}
```

### ContentBlock
A discriminated union representing different parts of a page.
```typescript
type ContentBlock = 
    | { type: 'heading'; level: number; text: string }
    | { type: 'text'; text: string }
    | { type: 'link'; text: string; url: string }
    | { type: 'thread-item'; author?: string; body: string; level: number; children: ContentBlock[] };
```

## Pipeline Flow
1. **Ingestor**: Fetches content (Axios/Stdin/File).
2. **ExtractionPipeline**: 
    - Loads `PatternPack` if available.
    - Applies site-specific selectors.
    - Falls back to `Readability` if signal is low.
3. **Renderer**: 
    - Applies `wrap-ansi`.
    - Handles truncation logic.
    - Emits Unicode ASCII frames.

## Error Handling
- **Usage Errors**: Exit Code `2` (CLI misuse).
- **Execution Errors**: Exit Code `1` (Fetch failed, Parse failed).
- **Success**: Exit Code `0`.

All diagnostic information (Traces, Progress) is strictly isolated to **stderr**.
