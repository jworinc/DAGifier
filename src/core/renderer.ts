import { PageDoc, ContentBlock } from '../types';

export class Renderer {
    render(doc: PageDoc, mode: 'auto' | 'thread' | 'article' = 'auto'): string {
        const lines: string[] = [];

        // Header
        lines.push('='.repeat(60));
        lines.push(doc.title.toUpperCase());
        if (doc.url) lines.push(`Source: ${doc.url}`);
        lines.push('='.repeat(60));
        lines.push('');

        // Content
        for (const block of doc.content) {
            lines.push(...this.renderBlock(block));
            lines.push('');
        }

        // Footer
        lines.push('-'.repeat(60));
        lines.push(`Extracted via DAGifier | ${new Date().toISOString()}`);

        return lines.join('\n');
    }

    private renderBlock(block: ContentBlock): string[] {
        switch (block.type) {
            case 'heading':
                return [
                    '#'.repeat(block.level) + ' ' + block.text,
                    '-'.repeat(block.text.length + block.level + 1)
                ];
            case 'text':
                return this.wrapText(block.text, 60);
            case 'link':
                return [`[${block.text}](${block.url})`];
            case 'thread-item':
                const currentIndent = '  '.repeat(block.level);
                let threadLines = [
                    `${currentIndent}┌─ ${block.author || 'Anonymous'}`,
                    ...this.wrapText(block.body, 60 - currentIndent.length - 4).map(l => `${currentIndent}│ ${l}`),
                    `${currentIndent}└${'─'.repeat(Math.max(0, 60 - currentIndent.length - 1))}`
                ];
                if (block.children) {
                    for (const child of block.children) {
                        threadLines.push(...this.renderBlock(child));
                    }
                }
                return threadLines;
            default:
                return [];
        }
    }

    private wrapText(text: string, width: number): string[] {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            if ((currentLine + word).length > width) {
                lines.push(currentLine.trim());
                currentLine = word + ' ';
            } else {
                currentLine += word + ' ';
            }
        }
        if (currentLine.trim()) lines.push(currentLine.trim());
        return lines;
    }
}
