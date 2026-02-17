# Pattern Packs Guide

> Last updated: 2026-02-17

## Overview

Pattern Packs are YAML files that teach Dagifier how to extract structured content from specific websites. They are located in the `patterns/` directory and are automatically loaded by the engine.

---

## Schema Reference

A pattern pack defines selectors for the root container, individual items (e.g., comments), and metadata like authors and depth.

```yaml
domain: example.com       # The hostname this pack applies to
selectors:
  root: ".comments-area"  # Container for the thread
  item: ".comment"        # Selector for each thread item
  author: ".author-name"  # Relative selector for author
  body: ".comment-body"   # Relative selector for content
  
  # Threading Strategy
  depthMethod: "attr"     # How to determine nesting level
  depth: "data-level"     # Attribute name or selector
  
filters:                  # Optional: Remove noisy elements
  - ".ad-banner"
  - ".reply-button"
```

---

## Threading Strategies

Different sites structure threaded conversations differently. Dagifier supports three strategies:

### 1. Attribute-Based (`attr`)
The nesting level is explicitly stored in an HTML attribute.

**Example (Reddit-style):**
```html
<div class="comment" data-level="1">...</div>
<div class="comment" data-level="2">...</div>
```

**YAML:**
```yaml
depthMethod: "attr"
depth: "data-level"
```

### 2. Query-Based (`query`)
The depth is determined by the presence or content of a specific element.

**Example (Hacker News-style):**
```html
<img src="spacer.gif" width="40" /> <!-- Width indicates depth -->
```

**YAML:**
```yaml
depthMethod: "query"
depth: "img[src='spacer.gif']"
depthMath: "width / 40"  # Optional: Calculate level from attribute
```

### 3. Nested DOM (`nested`)
The HTML structure itself is nested (e.g., `<ul>` inside `<li>`).

**Example:**
```html
<ul>
  <li>
    Comment 1
    <ul>
      <li>Reply 1</li>
    </ul>
  </li>
</ul>
```

**YAML:**
```yaml
depthMethod: "nested"
# 'depth' is ignored here; strict parent-child relationship is used
```

---

## Authoring Workflow

To create a robust pattern pack, follow these steps:

### 1. Discovery (`dagifier query`)
Use the `query` command to test selectors against a live page without writing a full pack.

```bash
# Test author selector
dagifier query https://news.ycombinator.com ".hnuser"

# Test item selector (force render if needed)
dagifier query -r https://reddit.com/r/javascript "shreddit-comment"
```

### 2. Draft the Pack
Create `patterns/mydomain.yaml` with your findings.

### 3. Verify (`dagifier record` & `dagifier diff`)
Create a "golden" snapshot to verify your pattern works and doesn't regress.

```bash
# 1. Record a baseline
dagifier record https://example.com/thread my-site/baseline

# 2. visual check
cat tests/goldens/my-site/baseline.txt

# 3. If you change the YAML later, run diff to check for regressions
dagifier diff https://example.com/thread my-site/baseline
```
