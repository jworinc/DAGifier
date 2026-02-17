import wrapAnsi from 'wrap-ansi';
import { PageDoc, ContentBlock } from '../types';

export interface RenderOptions {
    full?: boolean;
    limit?: number;
    maxDepth?: number;
    wikilinks?: boolean;
    outline?: boolean;
    modality?: 'text' | 'cli' | 'html' | 'web' | 'tui';
}

export class Renderer {
    private options: Required<RenderOptions> = {
        full: false,
        limit: 300,
        maxDepth: 3,
        wikilinks: false,
        outline: false,
        modality: 'text'
    };

    render(doc: PageDoc, options?: RenderOptions): string {
        this.options = { ...this.options, ...options };

        if (this.options.modality === 'html' || this.options.modality === 'web') {
            return this.renderHtml(doc);
        }

        return this.renderText(doc);
    }

    private renderText(doc: PageDoc): string {
        const lines: string[] = [];
        // Header
        lines.push('='.repeat(60));
        lines.push(doc.title.toUpperCase());
        if (doc.url) lines.push(`Source: ${doc.url}`);
        lines.push('='.repeat(60));
        lines.push('');

        // Content
        for (const block of doc.content) {
            const blockLines = this.renderBlock(block);
            if (this.options.outline && block.type !== 'heading') continue;
            lines.push(...blockLines);
            if (blockLines.length > 0) lines.push('');
        }

        // Footer
        lines.push('-'.repeat(60));
        lines.push(`Extracted via DAGifier | ${new Date().toISOString()}`);

        return lines.join('\n');
    }

    private renderHtml(doc: PageDoc): string {
        const renderBlockHtml = (block: ContentBlock): string => {
            switch (block.type) {
                case 'heading':
                    return `<h${block.level}>${block.text}</h${block.level}>`;
                case 'text':
                    return `<p>${block.text}</p>`;
                case 'link':
                    return `<div class="link-item"><a href="${block.url}">${block.text}</a></div>`;
                case 'thread-item':
                    const childrenHtml = block.children?.map(c => renderBlockHtml(c)).join('') || '';
                    const bodyHtml = block.content.map(c => renderBlockHtml(c)).join('');
                    return `
                        <div class="comment" style="margin-left: 20px; border-left: 1px solid #eee; padding-left: 10px; margin-bottom: 15px;">
                            <div class="meta" style="font-size: 0.85em; color: #777;">${block.author || 'Anonymous'}</div>
                            <div class="body" style="margin: 5px 0;">${bodyHtml}</div>
                            ${childrenHtml}
                        </div>
                    `;
                default:
                    return '';
            }
        };

        const contentHtml = doc.content.map(b => renderBlockHtml(b)).join('\n');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${doc.title}</title>
    <style>
        body { font-family: -apple-system, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #222; background: #fff; }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .source { color: #888; font-size: 0.9em; }
        .comment { padding-top: 10px; }
        footer { margin-top: 50px; border-top: 1px solid #eee; color: #888; font-size: 0.8em; }
        a { color: #0066cc; }
        blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 10px; color: #555; }
        pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>${doc.title}</h1>
    ${doc.url ? `<p class="source">Source: <a href="${doc.url}">${doc.url}</a></p>` : ''}
    <main>${contentHtml}</main>
    <footer>Extracted via DAGifier | ${new Date().toISOString()}</footer>
</body>
</html>`.trim();
    }

    private renderBlock(block: ContentBlock): string[] {
        switch (block.type) {
            case 'heading':
                const headingPrefix = '#'.repeat(block.level) + ' ';
                const wrappedHeading = this.wrapText(block.text, 60 - headingPrefix.length);
                return [
                    ...wrappedHeading.map((l, i) => i === 0 ? headingPrefix + l : ' '.repeat(headingPrefix.length) + l),
                    '-'.repeat(60)
                ];
            case 'text':
                return this.wrapText(block.text, 60);
            case 'quote':
                return this.wrapText(block.text, 58).map(l => `> ${l}`);
            case 'code':
                return ['```', ...block.text.split('\n'), '```'];
            case 'list':
                return block.items.flatMap(item => this.wrapText(`- ${item}`, 60));
            case 'link':
                const linkText = this.options.wikilinks ? `[[${block.text}]]` : `[${block.text}](${block.url})`;
                return [linkText];
            case 'thread-item':
                const currentIndent = '  '.repeat(block.level);
                const isCollapsed = !this.options.full && block.level >= this.options.maxDepth;
                const hasChildren = block.children && block.children.length > 0;

                const statusIndicator = hasChildren ? (isCollapsed ? ' [+]' : ' [-]') : '';
                const authorLabel = `${block.author || 'Anonymous'}${statusIndicator}`;

                let threadLines = [
                    `${currentIndent}┌─ ${authorLabel}`
                ];

                // Render content blocks inside thread item
                for (const contentBlock of block.content) {
                    const contentLines = this.renderBlock(contentBlock);
                    // Indent content lines + pipe
                    threadLines.push(...contentLines.map(l => `${currentIndent}│ ${l}`));
                }

                threadLines.push(`${currentIndent}└${'─'.repeat(Math.max(0, 60 - currentIndent.length - 1))}`);

                if (!isCollapsed && block.children) {
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
        let workingText = text;
        const limit = this.options.limit;

        if (!this.options.full && text.length > limit) {
            const truncated = text.slice(0, limit);
            const remainingWords = text.slice(limit).trim().split(/\s+/).length;
            workingText = `${truncated}... (${remainingWords} more words)`;
        }

        const normalizedText = workingText.replace(/\s+/g, ' ').trim();
        return wrapAnsi(normalizedText, width, { hard: true, trim: true }).split('\n');
    }
}
