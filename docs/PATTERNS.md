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

---

## Higher Order Effects

Why do good patterns matter? It's not just about aesthetics.

### 1. Context Window Efficiency
A precise pattern that eliminates ads, navigation, and footer links can reduce token usage by **60-80%**. 
- **Bad Pattern**: Ingests `<body>`. 50k tokens. LLM forgets instructions.
- **Good Pattern**: Ingests `.article-content`. 2k tokens. LLM attends to every word.

### 2. Semantic Density
By using explicit selectors for `author` and `timestamp`, Dagifier can reconstruct the *temporal structure* of a thread. 
- **Effect**: The LLM understands "User A replied to User B *after* User C posted X."
- **Benefit**: Enables complex reasoning tasks like "Summarize the debate flow" which fail on unstructured text dumps.

### 3. Agent Reliability
When an agent (like Codex) browses the web, it relies on structured data.
- **Flaky Pattern**: Agent sees "Click here to subscribe" mixed with content. It might try to click it.
- **Robust Pattern**: Agent sees only the clean text. It stays focused on the research task.
