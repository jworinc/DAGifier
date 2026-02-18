import { test, expect } from 'vitest';
import { ExtractionPipeline } from '../src/core/pipeline';
import fs from 'fs';
import path from 'path';

test('Manifesto: Determinism (Strict Invariant)', async () => {
    const pipeline = new ExtractionPipeline();
    const html = `
        <html>
            <head><title>Test Page</title></head>
            <body>
                <h1>Main Title</h1>
                <p>Some content with a <a href="https://example.com/1">link</a>.</p>
                <div class="thread">
                    <div class="comment">Comment 1</div>
                    <div class="comment">Comment 2</div>
                </div>
                <p>Another <a href="https://example.com/2">link</a>.</p>
            </body>
        </html>
    `;

    const run1 = await pipeline.process({
        source: 'url',
        identifier: 'https://test.com/page',
        rawContent: Buffer.from(html),
        mimeType: 'text/html'
    });

    // small delay to ensure timestamp differences don't break determinism if not handled
    await new Promise(r => setTimeout(r, 10));

    const pipeline2 = new ExtractionPipeline();
    const run2 = await pipeline2.process({
        source: 'url',
        identifier: 'https://test.com/page',
        rawContent: Buffer.from(html),
        mimeType: 'text/html'
    });

    // 1. Structural Signature must be identical
    expect(run1.doc.structural_signature).toBe(run2.doc.structural_signature);

    // 2. Full JSON stringification must be identical (verifies key order, sorting)
    expect(JSON.stringify(run1.doc)).toBe(JSON.stringify(run2.doc));
    
    // 3. IDs must be content-based and identical
    expect(run1.doc.content[0].id).toBe(run2.doc.content[0].id);
});

test('Manifesto: Link Stability', async () => {
    const pipeline = new ExtractionPipeline();
    const html = `
        <html>
            <body>
                <a href="https://a.com">A</a>
                <a href="https://b.com">B</a>
                <a href="https://a.com">A again</a>
            </body>
        </html>
    `;

    const { doc } = await pipeline.process({
        source: 'url',
        identifier: 'https://test.com/links',
        rawContent: Buffer.from(html),
        mimeType: 'text/html'
    });

    expect(doc.links.length).toBe(2); // Deduped
    expect(doc.links[0].url).toBe('https://a.com');
    expect(doc.links[0].id).toBe(1);
    
    expect(doc.links[1].url).toBe('https://b.com');
    expect(doc.links[1].id).toBe(2);

    // Verify refIds in content blocks
    const linkBlocks = doc.content.filter(b => b.type === 'link') as any[];
    expect(linkBlocks[0].refId).toBe(1);
    expect(linkBlocks[1].refId).toBe(2);
    expect(linkBlocks[2].refId).toBe(1); // 'A again' points to same refId
});
