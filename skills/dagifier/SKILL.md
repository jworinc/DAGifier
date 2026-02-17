---
name: dagifier
description: Convert any URL into clean, llm-optimized markdown content using smart extraction patterns.
---

# Dagifier Skill

The `dagifier` skill allows you to fetch, render, and distill web content into clean Markdown, optimized for LLM consumption. It handles dynamic content (via Playwright), extracts main article/thread content while removing clutter, and can even visualize data structures.

## Capabilities
- **Read**: Fetch a URL and return clean Markdown.
- **Skim**: Fetch a URL and return a truncated summary.
- **Tree**: Visualize JSON/API responses as a directory tree (useful for exploring raw data).
- **Query**: Extract specific elements using CSS selectors.

## Usage

### 1. Read URL (Default)
Get the full content of a page, automatically formatted.
```bash
dagifier read <url>
```
Options:
- `--mode article`: Force article extraction (Readability).
- `--mode thread`: Force forum thread extraction.
- `--full`: Disable truncation.

### 2. Skim URL
Get a quick overview (first few paragraphs) to decide if it's relevant.
```bash
dagifier skim <url>
```

### 3. Query Selector
Extract specific data points from a page.
```bash
dagifier query <url> <css_selector>
```

### 4. Tree View (for raw data)
Visualize a JSON API response or complex structure.
```bash
dagifier tree <url>
```

## Examples

**Read a blog post:**
```bash
dagifier read https://example.com/blog/post
```

**Extract a Reddit thread:**
```bash
dagifier read https://reddit.com/r/webdev/comments/12345
```

**Get specific data:**
```bash
dagifier query https://news.ycombinator.com/ ".titleline > a"
```
