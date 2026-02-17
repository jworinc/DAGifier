import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/core/renderer';
import { PageDoc } from '../src/types';

describe('Renderer', () => {
  const renderer = new Renderer();

  it('should render a simple page with title and text', () => {
    const doc: PageDoc = {
      title: 'Test Title',
      kind: 'article',
      meta: {},
      links: [],
      content: [
        { type: 'heading', level: 1, text: 'Header' },
        { type: 'text', text: 'Some text content.' }
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
      title: 'Thread Test',
      kind: 'thread',
      meta: {},
      links: [],
      content: [
        {
          type: 'thread-item',
          level: 0,
          author: 'Alice',
          content: [{ type: 'text', text: 'Hello' }],
          children: [
            { type: 'thread-item', level: 1, author: 'Bob', content: [{ type: 'text', text: 'Hi Alice' }], children: [] }
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
