import wrapAnsi from 'wrap-ansi';
import { PageDoc, ContentBlock } from '../types';

export interface RenderOptions {
    full?: boolean;
    limit?: number;
    maxDepth?: number;
    wikilinks?: boolean;
    outline?: boolean;
    modality?: 'text' | 'cli' | 'html' | 'web' | 'tui' | 'markdown';
    format?: 'text' | 'md' | 'html' | 'json';
    asciiOnly?: boolean;
    highlight?: string;
    width?: number;
}

export class Renderer {
    private options: Required<RenderOptions> = {
        full: false,
        limit: 300,
        maxDepth: 3,
        wikilinks: false,
        outline: false,
        modality: 'text',
        format: 'text',
        asciiOnly: false,
        highlight: '',
        width: 80
    };

    render(doc: PageDoc, options?: RenderOptions): string {
        this.options = { ...this.options, ...options };

        // Detect terminal width if not specified and in TTY
        if (!options?.width && process.stdout.isTTY) {
            this.options.width = process.stdout.columns || 80;
        }

        if (this.options.modality === 'html' || this.options.modality === 'web') {
            return this.renderHtml(doc);
        } else if (this.options.format === 'md' || this.options.modality === 'markdown') {
            return this.renderMarkdown(doc);
        }

        return this.renderText(doc);
    }

    private renderMarkdown(doc: PageDoc): string {
        const lines: string[] = [];
        // Frontmatter or Title
        lines.push(`# ${doc.title}`);
        if (doc.url) lines.push(`Source: [${doc.url}](${doc.url})`);
        lines.push('');

        const renderBlockMd = (block: ContentBlock): string[] => {
            switch (block.type) {
                case 'heading':
                    return [`${'#'.repeat(block.level)} ${block.text}`];
                case 'text':
                    return block.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                case 'quote':
                    return block.text.split('\n').map(l => `> ${l.trim()}`);
                case 'code':
                    return ['```', ...block.text.split('\n'), '```'];
                case 'list':
                    return block.items.map(i => `- ${i}`);
                case 'link':
                    return [`[${block.text}](${block.url})`];
                case 'thread-item':
                    const indent = '> '.repeat(block.depth + 1);
                    const author = `**${block.author || 'Anonymous'}**:`;
                    const contentLines = block.content.flatMap(c => renderBlockMd(c));

                    const itemLines = [
                        `${indent}${author}`,
                        ...contentLines.map(l => `${indent}${l}`),
                        ''
                    ];

                    if (block.children) {
                        for (const child of block.children) {
                            itemLines.push(...renderBlockMd(child));
                        }
                    }
                    return itemLines;
                default:
                    return [];
            }
        };

        for (const block of doc.content) {
            lines.push(...renderBlockMd(block));
            lines.push('');
        }

        return lines.join('\n');
    }

    private renderText(doc: PageDoc): string {
        const lines: string[] = [];
        const width = this.options.width;

        // Header
        lines.push('='.repeat(width));
        lines.push(doc.title.toUpperCase());
        if (doc.url) lines.push(`Source: ${doc.url}`);
        lines.push('='.repeat(width));

        if (doc.meta.confidence < 0.6) {
            lines.push(` [!] WARNING: Structure Unreliable (Confidence: ${Math.floor(doc.meta.confidence * 100)}%)`);
            doc.meta.warnings.forEach(w => lines.push(`     - ${w}`));
            lines.push('');
        }
        lines.push('');

        // Content
        for (const block of doc.content) {
            // Outline mode
            if (this.options.outline && block.type !== 'heading') continue;

            const blockLines = this.renderBlock(block);
            lines.push(...blockLines);
            if (blockLines.length > 0) lines.push('');
        }

        // Footer
        lines.push('-'.repeat(width));
        lines.push(`Extracted via DAGifier | ${new Date().toISOString()}`);

        const output = lines.join('\n');
        return this.processFinalOutput(output);
    }

    private processFinalOutput(text: string): string {
        let final = text;
        // 1. ASCII-Only
        if (this.options.asciiOnly) {
            final = final.replace(/[^\x00-\x7F]/g, c => {
                // Simple replacements
                if (c === '—') return '--';
                if (c === '’' || c === '‘') return "'";
                if (c === '“' || c === '”') return '"';
                if (c === '…') return '...';
                return '?';
            });
        }

        // 2. Highlight (if specified)
        if (this.options.highlight) {
            const term = this.options.highlight;
            // Simple case-insensitive replacement with ANSI red
            const regex = new RegExp(`(${term})`, 'gi');
            // \x1b[31m = Red, \x1b[0m = Reset
            final = final.replace(regex, '\x1b[31m$1\x1b[0m');
        }

        return final;
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
        const width = this.options.width;
        switch (block.type) {
            case 'heading':
                const headingPrefix = '#'.repeat(block.level) + ' ';
                const wrappedHeading = this.wrapText(block.text, width - headingPrefix.length);
                return [
                    ...wrappedHeading.map((l, i) => i === 0 ? headingPrefix + l : ' '.repeat(headingPrefix.length) + l),
                    '-'.repeat(width)
                ];
            case 'text':
                return this.wrapText(block.text, width);
            case 'quote':
                return this.wrapText(block.text, width - 2).map(l => `> ${l}`);
            case 'code':
                return ['```', ...block.text.split('\n'), '```'];
            case 'list':
                return block.items.flatMap(item => this.wrapText(`- ${item}`, width));
            case 'link':
                const linkText = this.options.wikilinks ? `[[${block.text}]]` : `[${block.text}](${block.url})`;
                return [linkText];
            case 'thread-item':
                const currentIndent = '  '.repeat(block.depth);
                const isCollapsed = !this.options.full && block.depth >= this.options.maxDepth;
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

                threadLines.push(`${currentIndent}└${'─'.repeat(Math.max(0, width - currentIndent.length - 1))}`);

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
