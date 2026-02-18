import { test, expect } from 'vitest';
import { ExtractionPipeline } from '../src/core/pipeline';

test('Manifesto: Max Depth Limiting', async () => {
    const pipeline = new ExtractionPipeline();
    // Use flat structure but with depth attributes which the pipeline will rebuild into a tree
    const html = `
        <div class="thread">
            <div class="comment" depth="0">Root</div>
            <div class="comment" depth="1">Level 1</div>
            <div class="comment" depth="2">Level 2</div>
            <div class="comment" depth="3">Level 3</div>
        </div>
    `;

    const result = await pipeline.process({
        source: 'url',
        identifier: 'https://test.com/depth',
        rawContent: Buffer.from(html),
        mimeType: 'text/html'
    }, undefined, { maxDepth: 2 });

    const root = result.doc.content[0] as any;
    
    expect(root.depth).toBe(0);
    expect(root.children.length).toBe(1);
    
    const level1 = root.children[0];
    expect(level1.depth).toBe(1);
    expect(level1.children.length).toBe(1); 
    
    const level2 = level1.children[0];
    expect(level2.depth).toBe(2);
    // Max Depth 2 means we keep depth 0, 1, 2.
    // Depth 3 should be pruned.
    expect(level2.children?.length || 0).toBe(0); 
});

test('Manifesto: Max Length Truncation', async () => {
    const pipeline = new ExtractionPipeline();
    // Add enough content to bypass low-signal heuristics (< 3 blocks)
    const html = `
        <p>This is a very long paragraph that should be truncated because it exceeds the limit set in the options.</p>
        <p>Block 2</p>
        <p>Block 3</p>
        <p>Block 4</p>
    `;

    const result = await pipeline.process({
        source: 'url',
        identifier: 'https://test.com/length',
        rawContent: Buffer.from(html),
        mimeType: 'text/html'
    }, undefined, { maxLength: 10 });
    
    // Check if we got content back
    expect(result.doc.content.length).toBeGreaterThan(0);

    const p = result.doc.content[0] as any;
    expect(p.text).toBe('This is a ...'); 
});
