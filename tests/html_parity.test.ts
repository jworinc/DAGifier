import { test, expect } from 'vitest';
import { ExtractionPipeline } from '../src/core/pipeline';
import fs from 'fs';
import path from 'path';

test('HTML Parity: Flat Thread Reconstruction', async () => {
    const pipeline = new ExtractionPipeline();
    const fixturePath = path.join(__dirname, 'fixtures/core8/flat_thread.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');

    // Using an empty pack to triggers generic heuristics
    const { doc } = await pipeline.process({
        source: 'file',
        identifier: 'flat_thread.html',
        rawContent: Buffer.from(html),
        mimeType: 'text/html'
    });

    // Expecting 3 root items (UserA, UserD, UserG)
    expect(doc.content.length).toBe(3);

    const root1 = doc.content[0] as any;
    expect(root1.author).toBe('UserA');
    expect(root1.children.length).toBe(1);

    const reply1 = root1.children[0];
    expect(reply1.author).toBe('UserB');
    expect(reply1.children.length).toBe(1);

    const reply2 = reply1.children[0];
    expect(reply2.author).toBe('UserC');

    const root2 = doc.content[1] as any;
    expect(root2.author).toBe('UserD');
});

test('HTML Parity: Meta Hunter', async () => {
    const pipeline = new ExtractionPipeline();
    const html = `
        <html>
            <head>
                <meta property="og:title" content="OG Headline" />
                <meta property="article:author" content="OG Author" />
            </head>
            <body><h1>Ignore this</h1></body>
        </html>
    `;

    const { doc } = await pipeline.process({
        source: 'url',
        identifier: 'https://example.com/test',
        rawContent: Buffer.from(html),
        mimeType: 'text/html'
    });

    expect(doc.title).toBe('OG Headline');
    expect(doc.meta.author).toBe('OG Author');
});
