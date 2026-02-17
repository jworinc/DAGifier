import { parse, HTMLElement } from 'node-html-parser';
import { PageDoc, ContentBlock, Trace, TraceStep, IngestionPayload } from '../types';
import { PatternPack } from './patterns';

export class ExtractionPipeline {
    private trace: Trace;
    private pack?: PatternPack;

    constructor() {
        this.trace = {
            steps: [],
            signals: {},
            durationMs: 0
        };
    }

    private addStep(name: string, decision: string, reason: string) {
        this.trace.steps.push({
            name,
            decision,
            reason,
            timestamp: Date.now()
        });
    }

    async process(payload: IngestionPayload, pack?: PatternPack): Promise<{ doc: PageDoc; trace: Trace }> {
        const startTime = Date.now();
        this.pack = pack;
        const html = payload.rawContent.toString('utf-8');
        const root = parse(html);

        if (pack) {
            this.addStep('Pattern Match', pack.domain, 'Using domain-specific pattern pack');
        }

        this.addStep('Parsing', 'Success', `Parsed ${html.length} characters of HTML`);

        const title = this.extractTitle(root);
        const content = this.extractContent(root);

        this.trace.durationMs = Date.now() - startTime;

        const doc: PageDoc = {
            title,
            url: payload.source === 'url' ? payload.identifier : undefined,
            content,
            metadata: {
                source: payload.source,
                mimeType: payload.mimeType,
                pack: pack?.domain
            }
        };

        return { doc, trace: this.trace };
    }

    private extractTitle(root: HTMLElement): string {
        const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content');
        if (ogTitle) {
            this.addStep('Title Extraction', ogTitle, 'Used og:title');
            return ogTitle;
        }
        const h1 = root.querySelector('h1')?.text.trim();
        if (h1) {
            this.addStep('Title Extraction', h1, 'Used first H1');
            return h1;
        }
        const title = root.querySelector('title')?.text.trim() || 'Untitled';
        this.addStep('Title Extraction', title, 'Used <title> tag');
        return title;
    }

    private extractContent(root: HTMLElement): ContentBlock[] {
        const blocks: ContentBlock[] = [];

        let contentRoot: HTMLElement | null = null;
        if (this.pack?.selectors.root) {
            contentRoot = root.querySelector(this.pack.selectors.root);
            if (contentRoot) {
                this.addStep('Content Root', contentRoot.tagName, `Selected via pack selector: ${this.pack.selectors.root}`);
            }
        }

        if (!contentRoot) {
            contentRoot = root.querySelector('main') || root.querySelector('article') || root.querySelector('body');
            if (contentRoot) {
                this.addStep('Content Root', contentRoot.tagName, 'Selected via heuristics');
            }
        }

        if (contentRoot) {
            this.traverse(contentRoot, blocks);
        }

        return blocks;
    }

    private matchesSelector(element: HTMLElement, selector: string): boolean {
        // Simple matcher for tag names, classes, and attributes
        const parts = selector.split(',').map(s => s.trim());
        for (const part of parts) {
            if (part.startsWith('.')) {
                if (element.classList.contains(part.substring(1))) return true;
            } else if (part.startsWith('[') && part.endsWith(']')) {
                const attrMatch = part.match(/\[([a-zA-Z0-9_-]+)=['"]?([^'"]+)['"]?\]/);
                if (attrMatch) {
                    const [_, name, value] = attrMatch;
                    if (element.getAttribute(name!) === value) return true;
                }
            } else if (part === element.tagName.toLowerCase()) {
                return true;
            }
        }
        return false;
    }

    private traverse(node: HTMLElement, blocks: ContentBlock[]) {
        const itemSelector = this.pack?.selectors.item;

        for (const child of node.childNodes) {
            if (child instanceof HTMLElement) {
                // Check for blacklisted elements
                if (this.pack?.filters?.some(f => child.classList.contains(f.substring(1)) || child.tagName.toLowerCase() === f.toLowerCase())) {
                    continue;
                }

                if (itemSelector && this.matchesSelector(child, itemSelector)) {
                    this.extractComment(child, blocks);
                } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(child.tagName.toLowerCase())) {
                    blocks.push({
                        type: 'heading',
                        level: parseInt(child.tagName.substring(1)),
                        text: child.text.trim()
                    });
                } else if (child.tagName.toLowerCase() === 'p') {
                    const text = child.text.trim();
                    if (text) {
                        blocks.push({ type: 'text', text });
                    }
                } else if (child.tagName.toLowerCase() === 'a') {
                    blocks.push({
                        type: 'link',
                        text: child.text.trim(),
                        url: child.getAttribute('href') || ''
                    });
                } else {
                    this.traverse(child, blocks);
                }
            }
        }
    }

    private extractComment(child: HTMLElement, blocks: ContentBlock[]) {
        const selectors = this.pack?.selectors;

        // Author extraction
        let author: string | undefined;
        if (selectors?.author?.startsWith('attr:')) {
            author = child.getAttribute(selectors.author.split(':')[1]!) || undefined;
        }
        if (!author && selectors?.author) {
            author = child.querySelector(selectors.author)?.text.trim();
        }
        // Heuristic fallback for author if pack fails or not present
        if (!author) {
            author = child.getAttribute('author') || child.querySelector('[author]')?.text.trim();
        }

        // Body extraction
        let bodyNode: HTMLElement | null = null;
        if (selectors?.body) {
            bodyNode = child.querySelector(selectors.body);
        }
        if (!bodyNode) {
            bodyNode = child.querySelector('[slot="comment"]') || child.querySelector('.md') || child;
        }

        // Depth extraction
        let depth = 0;
        if (selectors?.depth?.startsWith('attr:')) {
            depth = parseInt(child.getAttribute(selectors.depth.split(':')[1]!) || '0');
        } else {
            depth = parseInt(child.getAttribute('depth') || child.getAttribute('aria-level') || '0');
        }

        const item: ContentBlock = {
            type: 'thread-item',
            level: depth,
            author: author,
            body: bodyNode.text.trim(),
            children: []
        };
        blocks.push(item);

        // Recurse into children
        const itemSelector = this.pack?.selectors.item;
        for (const nestedChild of child.childNodes) {
            if (nestedChild instanceof HTMLElement) {
                if (itemSelector && this.matchesSelector(nestedChild, itemSelector)) {
                    this.extractComment(nestedChild, item.children!);
                } else {
                    this.extractCommentSearch(nestedChild, item.children!);
                }
            }
        }
    }

    private extractCommentSearch(node: HTMLElement, blocks: ContentBlock[]) {
        const itemSelector = this.pack?.selectors.item;
        for (const child of node.childNodes) {
            if (child instanceof HTMLElement) {
                if (itemSelector && this.matchesSelector(child, itemSelector)) {
                    this.extractComment(child, blocks);
                } else {
                    this.extractCommentSearch(child, blocks);
                }
            }
        }
    }
}
