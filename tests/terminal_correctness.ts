import { Renderer } from '../src/core/renderer';
import { PageDoc } from '../src/types';

async function test() {
    const renderer = new Renderer();
    const doc: PageDoc = {
        title: 'Terminal Correctness Test',
        url: 'https://example.com',
        content: [
            { id: 'b1', type: 'text', text: 'This is a long line of text that should be wrapped according to the width specified in the renderer options. It needs to be long enough to exceed the default width.' }
        ],
        links: [],
        meta: { site: 'example.com', confidence: 1.0, warnings: [] },
        metadata: { durationMs: 10 },
        version: '1.1',
        structural_signature: 'test'
    };

    console.log('--- Width 40 ---');
    console.log(renderer.render(doc, { width: 40 }));

    console.log('\n--- Width 80 ---');
    console.log(renderer.render(doc, { width: 80 }));

    console.log('\n--- Unicode NFC Test ---');
    // 'e' + '\u0301' (combined) should be normalized to '\u00e9'
    const docUnicode: PageDoc = {
        ...doc,
        title: 'Unicode Test',
        content: [{ id: 'b2', type: 'text', text: 'cafe\u0301' }] // 'cafe' with combining acute accent
    };

    // We need to run this through the pipeline to see normalization, 
    // but we can also just check if the renderer handles it well.
    // Actually, normalization happens in the Pipeline.finalizeDoc.
    console.log('Renderer output for "cafe\\u0301":');
    console.log(renderer.render(docUnicode));
}

test();
