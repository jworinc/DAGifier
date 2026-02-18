import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/core/renderer';
import { PageDoc } from '../src/types';

describe('Renderer', () => {
  const renderer = new Renderer();

  it('should render a simple page with title and text', () => {
    const doc: PageDoc = {
      version: '1.0',
      title: 'Test Title',
      kind: 'article',
      meta: { confidence: 1.0, warnings: [] },
      links: [],
      content: [
        { id: '1', type: 'heading', level: 1, text: 'Header' },
        { id: '2', type: 'text', text: 'Some text content.' }
      ],
      metadata: { source: 'file', mimeType: 'text/html' }
    };

    const output = renderer.render(doc);
    expect(output).toContain('TEST TITLE');
    expect(output).toContain('# Header');
    expect(output).toContain('Some text content.');
  });

  it('should render threaded items with author and indentation', () => {
    const doc: PageDoc = {
      version: '1.0',
      title: 'Thread Test',
      kind: 'thread',
      meta: { confidence: 1.0, warnings: [] },
      links: [],
      content: [
        {
          id: '1',
          type: 'thread-item',
          depth: 0,
          author: 'Alice',
          content: [{ id: '1a', type: 'text', text: 'Hello' }],
          children: [
            { id: '2', type: 'thread-item', depth: 1, author: 'Bob', content: [{ id: '2a', type: 'text', text: 'Hi Alice' }], children: [] }
          ]
        }
      ],
      metadata: { source: 'file', mimeType: 'text/html' }
    };

    const output = renderer.render(doc);
    expect(output).toContain('┌─ Alice');
    expect(output).toContain('│ Hello');
    expect(output).toContain('  ┌─ Bob');
    expect(output).toContain('  │ Hi Alice');
  });
});
