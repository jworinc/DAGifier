import { parse, HTMLElement } from 'node-html-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as linkedom from 'linkedom';
import { PageDoc, ContentBlock, Trace, TraceStep, IngestionPayload, LinkRef } from '../types';
import { PatternPack } from './patterns';
import { RedditJsonExtractor } from './extractors/reddit_json';
import { HnJsonExtractor } from './extractors/hn_json';
import { WikipediaJsonExtractor } from './extractors/wikipedia_json';
import { StackOverflowJsonExtractor } from './extractors/stackoverflow_json';

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

    private addStep(name: string, decision: string, reason: string, data?: any) {
        this.trace.steps.push({
            name,
            decision,
            reason,
            timestamp: Date.now(),
            data
        });
    }

    async process(payload: IngestionPayload, pack?: PatternPack, options?: { forceReadability?: boolean; maxDepth?: number; maxLength?: number }): Promise<{ doc: PageDoc; trace: Trace }> {
        const startTime = Date.now();
        this.pack = pack;

        const html = payload.rawContent.toString('utf-8');

        // Handle JSON payloads (e.g., from transformed API endpoints)
        if (payload.mimeType?.includes('application/json') || html.trim().startsWith('{') || html.trim().startsWith('[')) {
            try {
                const json = JSON.parse(html);
                if (payload.identifier.includes('reddit.com')) {
                    this.addStep('Extraction', 'Reddit JSON API', 'Extracted structured data from Reddit JSON endpoint');
                    const { doc } = await this.renderFromJson(json, payload.identifier, RedditJsonExtractor);
                    doc.metadata.durationMs = Date.now() - startTime;
                    return { doc, trace: this.trace };
                } else if (payload.identifier.includes('hn.algolia.com') || payload.identifier.includes('news.ycombinator.com')) {
                    this.addStep('Extraction', 'HN JSON API', 'Extracted structured data from HN Algolia endpoint');
                    const { doc } = await this.renderFromJson(json, payload.identifier, HnJsonExtractor);
                    doc.metadata.durationMs = Date.now() - startTime;
                    return { doc, trace: this.trace };
                } else if (payload.identifier.includes('wikipedia.org')) {
                    this.addStep('Extraction', 'Wikipedia JSON API', 'Extracted structured data from Wikipedia REST endpoint');
                    const { doc } = await this.renderFromJson(json, payload.identifier, WikipediaJsonExtractor);
                    doc.metadata.durationMs = Date.now() - startTime;
                    return { doc, trace: this.trace };
                } else if (payload.identifier.includes('stackexchange.com') || payload.identifier.includes('stackoverflow.com')) {
                    this.addStep('Extraction', 'StackOverflow JSON API', 'Extracted structured data from Stack Exchange API');
                    const { doc } = await this.renderFromJson(json, payload.identifier, StackOverflowJsonExtractor);
                    doc.metadata.durationMs = Date.now() - startTime;
                    return { doc, trace: this.trace };
                }
            } catch (e) {
                this.addStep('Parsing', 'JSON Failure', 'Attempted JSON parsing but failed: ' + String(e));
            }
        }

        // Use linkedom for primary structural analysis (fast)
        const { document: linkedDoc } = linkedom.parseHTML(html);

        // Convert to node-html-parser for existing recursive logic (if needed) 
        // or just use linkedDoc directly. Let's try to adapt linkedDoc.
        // Actually, linkedom is more standard-compliant.

        if (pack) {
            this.addStep('Pattern Match', pack.domain, 'Using domain-specific pattern pack');
        }

        this.addStep('Parsing', 'Success (linkedom)', `Parsed ${html.length} characters of HTML`);

        // Multi-source metadata hunting
        const meta = this.huntMetadata(linkedDoc);
        if (meta.headline) {
            this.addStep('Metadata Extraction', meta.headline, 'Extracted via Meta Hunter (JSON-LD/OG/Twitter)');
        }

        let title = meta.headline || this.extractTitleLinked(linkedDoc);
        let content: ContentBlock[] = [];

        if (options?.forceReadability) {
            this.addStep('Extraction', 'Readability', 'Forced Readability mode via options');
            const readResult = this.extractViaReadability(html);
            title = readResult.title || title;
            content = readResult.content;
        } else {
            // Here we still use the HTMLElement from node-html-parser because the codebase is built around it
            const root = parse(html);
            content = this.extractContent(root);

            // Fallback to Readability if content signal is low (heuristic: < 3 blocks)
            if (content.length < 3) {
                this.addStep('Heuristic Fallback', 'Readability', 'Low content signal; attempting Readability extraction');
                const readResult = this.extractViaReadability(html);
                if (readResult.content.length > content.length) {
                    title = readResult.title || title;
                    content = readResult.content;
                    this.addStep('Readability Result', 'Success', `Extracted ${content.length} blocks via Readability`);
                }
            }
        }

        // Heuristic for kind
        let kind: 'thread' | 'article' | 'mixed' = 'article';
        const hasThread = content.some(b => b.type === 'thread-item');
        const hasMuchText = content.filter(b => b.type === 'text').length > 5;
        if (hasThread && hasMuchText) kind = 'mixed';
        else if (hasThread) kind = 'thread';

        const warnings: string[] = [];
        let confidence = 1.0;

        if (!pack && !payload.identifier.includes('reddit.com') && !payload.identifier.includes('news.ycombinator.com')) {
            confidence = 0.7; // Heuristic fallback
            if (content.length < 5) {
                confidence = 0.4;
                warnings.push('Structure unreliable: Low content signal and no pattern match.');
            }
        }

        this.trace.durationMs = Date.now() - startTime;

        return {
            doc: this.finalizeDoc({
                title,
                url: payload.source === 'url' ? payload.identifier : undefined,
                author: meta.author,
                site: meta.site || (payload.source === 'url' ? this.safeHostname(payload.identifier) : undefined),
                date: meta.date,
                pack: pack?.domain,
                jsonLd: meta.source === 'json-ld',
                confidence,
                warnings,
                kind,
                content,
                source: payload.source,
                mimeType: payload.mimeType,
                maxDepth: options?.maxDepth,
                maxLength: options?.maxLength
            }),
            trace: this.trace
        };
    }

    private finalizeDoc(ctx: {
        title: string,
        url?: string,
        author?: string,
        site?: string,
        date?: string,
        pack?: string,
        jsonLd: boolean,
        confidence: number,
        warnings: string[],
        kind: 'thread' | 'article' | 'mixed',
        content: ContentBlock[],
        source: string,
        mimeType?: string,
        maxDepth?: number,
        maxLength?: number
    }): PageDoc {
        // 1. Post-process blocks: assign IDs, normalize text, set parentIds
        this.polishBlocks(ctx.content);

        // 2. Resource Limits Applier (Manifesto)
        if (ctx.maxDepth || ctx.maxLength) {
            this.applyResourceLimits(ctx.content, ctx.maxDepth, ctx.maxLength);
        }

        // 2. Dedup links and assign refIds
        const links: LinkRef[] = [];
        const linkMap = new Map<string, number>();
        let nextRefId = 1;

        const processLinks = (blocks: ContentBlock[]) => {
            blocks.forEach(block => {
                if (block.type === 'link') {
                    if (!linkMap.has(block.url)) {
                        const refId = nextRefId++;
                        linkMap.set(block.url, refId);
                        links.push({ id: refId, text: block.text, url: block.url });
                        block.refId = refId;
                    } else {
                        block.refId = linkMap.get(block.url);
                    }
                }
                if (block.type === 'thread-item') {
                    if (block.content) processLinks(block.content);
                    if (block.children) processLinks(block.children);
                }
            });
        };
        processLinks(ctx.content);

        const signature = this.computeStructuralSignature(ctx.content);

        return {
            version: '1.1',
            title: this.normalizeText(ctx.title),
            url: ctx.url,
            meta: {
                author: ctx.author,
                site: ctx.site,
                published: ctx.date,
                pack: ctx.pack,
                jsonLd: ctx.jsonLd,
                confidence: ctx.confidence,
                warnings: ctx.warnings
            },
            kind: ctx.kind,
            content: ctx.content,
            links,
            metadata: {
                source: ctx.source,
                mimeType: ctx.mimeType,
                ...this.trace.signals
            },
            structural_signature: signature
        };
    }

    private normalizeText(text: string): string {
        return text.normalize('NFC').replace(/\s+/g, ' ').trim();
    }

    private polishBlocks(blocks: ContentBlock[], parentId?: string, depthPrefix: string = '0') {
        blocks.forEach((block, index) => {
            const currentPath = `${depthPrefix}.${index}`;
            // @ts-ignore - assigning ID to union type
            block.id = this.computeContentHash(block, currentPath);

            if (block.type === 'text' || block.type === 'heading' || block.type === 'quote' || block.type === 'code') {
                block.text = this.normalizeText(block.text);
            }

            if (block.type === 'thread-item') {
                block.parentId = parentId;
                if (block.content) this.polishBlocks(block.content, block.id, `${currentPath}.c`);
                if (block.children) this.polishBlocks(block.children, block.id, `${currentPath}.n`);
            }

            if (block.type === 'list') {
                block.items = block.items.map(i => this.normalizeText(i));
            }
        });
    }

    private computeContentHash(block: ContentBlock, path: string): string {
        let str = block.type + path;
        if ('text' in block) str += block.text;

        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    private computeStructuralSignature(blocks: ContentBlock[]): string {
        const structureString = blocks.map(b => {
            if (b.type === 'heading') return `H${b.level}`;
            if (b.type === 'thread-item') return `T${b.depth}[${b.children?.length || 0}]`;
            return b.type.toUpperCase().charAt(0);
        }).join('|');
        let hash = 0;
        for (let i = 0; i < structureString.length; i++) {
            const char = structureString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    private safeHostname(url: string): string | undefined {
        try {
            return new URL(url).hostname;
        } catch {
            return undefined;
        }
    }

    private huntMetadata(doc: any): { headline?: string; author?: string; date?: string; site?: string; source?: string } {
        // 1. JSON-LD (Highest Priority)
        const jsonLd = this.extractJsonLd(doc);
        if (jsonLd.headline) return { ...jsonLd, source: 'json-ld' };

        // 2. OpenGraph
        const og = {
            headline: doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
            author: doc.querySelector('meta[property="article:author"]')?.getAttribute('content'),
            date: doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content'),
            site: doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')
        };
        if (og.headline) return { ...og, source: 'opengraph' };

        // 3. Twitter
        const twitter = {
            headline: doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content'),
            author: doc.querySelector('meta[name="twitter:creator"]')?.getAttribute('content'),
            site: doc.querySelector('meta[name="twitter:site"]')?.getAttribute('content')
        };
        if (twitter.headline) return { ...twitter, source: 'twitter' };

        // 4. Heuristics
        return {
            headline: doc.querySelector('title')?.textContent?.trim(),
            author: doc.querySelector('[rel="author"]')?.textContent?.trim() ||
                doc.querySelector('.author')?.textContent?.trim() ||
                doc.querySelector('.user')?.textContent?.trim() ||
                doc.querySelector('[author]')?.getAttribute('author') ||
                doc.querySelector('[author]')?.textContent?.trim(),
            date: doc.querySelector('time[datetime]')?.getAttribute('datetime'),
            source: 'heuristics'
        };
    }

    private extractJsonLd(doc: any): { headline?: string; author?: string; date?: string; site?: string } {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of Array.from(scripts)) {
            try {
                const data = JSON.parse((script as any).textContent || '');
                // Handle both single object and array of objects
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    if (item['@type'] === 'Article' || item['@type'] === 'BlogPosting' || item['@type'] === 'NewsArticle') {
                        return {
                            headline: item.headline || item.name,
                            author: typeof item.author === 'string' ? item.author : item.author?.name,
                            date: item.datePublished,
                            site: item.publisher?.name
                        };
                    }
                }
            } catch (e) {
                // Ignore malformed JSON-LD
            }
        }
        return {};
    }

    private extractTitleLinked(doc: any): string {
        const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
        if (ogTitle) return ogTitle;
        const h1 = doc.querySelector('h1')?.textContent?.trim();
        if (h1) return h1;
        return doc.querySelector('title')?.textContent?.trim() || 'Untitled';
    }

    private extractViaReadability(html: string): { title: string; content: ContentBlock[] } {
        try {
            const { document } = linkedom.parseHTML(html);
            const reader = new Readability(document as any);
            const article = reader.parse();

            if (!article) return { title: '', content: [] };

            const blocks: ContentBlock[] = [];
            const articleRoot = parse(article.content || '');
            this.traverse(articleRoot, blocks);

            return {
                title: article.title || '',
                content: blocks
            };
        } catch (e) {
            this.addStep('Readability Error', 'Failed', String(e));
            return { title: '', content: [] };
        }
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
                this.addStep('Content Root', contentRoot.tagName, `Selected via pack selector: ${this.pack.selectors.root}`, { selector: this.pack.selectors.root });
                this.trace.signals.rootSelector = this.pack.selectors.root;
            }
        }

        if (!contentRoot) {
            contentRoot = root.querySelector('main') || root.querySelector('article') || root.querySelector('body') || root;
            if (contentRoot) {
                this.addStep('Content Root', contentRoot.tagName || 'root', 'Selected via heuristics');
                this.trace.signals.rootSelector = (contentRoot.tagName || 'root').toLowerCase();
            }
        }

        if (contentRoot) {
            this.traverse(contentRoot, blocks);
            this.trace.signals.itemSelector = this.pack?.selectors.item || 'none';

            // Rebuild tree if we have a flat list of thread-items with depth (e.g. HN)
            if (blocks.some(b => b.type === 'thread-item' && b.depth > 0) && blocks.every(b => b.type === 'thread-item' && b.children?.length === 0)) {
                this.addStep('Tree Reconstruction', 'Pattern-driven', 'Rebuilding hierarchy from flat HTML list via depth metadata');
                const tree = this.rebuildThreadTree(blocks);
                blocks.length = 0;
                blocks.push(...tree);
            }

            this.trace.signals.blockCount = blocks.length;
        }

        // Phase 3: Generic Thread Reconstruction
        // If content is very thin, try to detect thread structures
        if (blocks.length < 3 && !this.pack?.selectors.item) {
            const genericThread = this.detectGenericThread(root);
            if (genericThread.length > 0) {
                this.addStep('Generic Thread', 'Detected', `Found ${genericThread.length} items via generic heuristics`);
                // Clear thin/accidental blocks before pushing structured thread
                blocks.length = 0;
                blocks.push(...genericThread);
                this.trace.signals.strategy = 'generic-thread';
            }
        }

        if (blocks.length === 0) {
            console.log('DEBUG: No content found. Root innerHTML:', root.innerHTML);
            console.log('DEBUG: Content Root:', contentRoot ? contentRoot.outerHTML : 'None');
        }
        return blocks;
    }

    private detectGenericThread(root: HTMLElement): ContentBlock[] {
        // Heuristic 1: Look for highly repeated class names with nesting
        const candidates = root.querySelectorAll('div, section, li, article');
        const classCounts = new Map<string, number>();

        for (const el of candidates) {
            const cls = el.getAttribute('class');
            if (cls) classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
        }

        // Find blocks that appear many times (> 5) and contain text
        let bestSelector = '';
        let maxCount = 0;

        for (const [cls, count] of classCounts.entries()) {
            if (count >= 3 && count > maxCount) {
                // Check if it looks like a comment (has author/time/reply indicators?)
                // Simplified check for now
                bestSelector = '.' + cls.split(' ').join('.');
                maxCount = count;
            }
        }

        if (bestSelector) {
            this.addStep('Generic Thread', 'Heuristic', `Identified repeated container: ${bestSelector}`);
            const items = root.querySelectorAll(bestSelector);
            const flatBlocks: ContentBlock[] = [];

            for (const item of items) {
                // Determine depth
                let depth = parseInt(item.getAttribute('depth') || item.getAttribute('aria-level') || '0');
                if (depth === 0) {
                    let parent = item.parentNode;
                    while (parent && parent instanceof HTMLElement) {
                        if (this.matchesSelector(parent, bestSelector)) depth++;
                        parent = parent.parentNode;
                    }
                }

                // Extract body content via traverse for richness
                const commentContent: ContentBlock[] = [];
                // Only traverse CHILDREN of item, avoid recursing into item itself to prevent doubling
                for (const childNode of item.childNodes) {
                    if (childNode instanceof HTMLElement) {
                        this.traverse(childNode, commentContent);
                    }
                }

                if (commentContent.length > 0) {
                    flatBlocks.push({
                        id: '',
                        type: 'thread-item',
                        depth: depth,
                        author: this.huntMetadata(item).author || 'Anonymous',
                        content: commentContent,
                        children: [],
                        collapsed: false
                    });
                } else if (item.text.trim()) {
                    flatBlocks.push({
                        id: '',
                        type: 'thread-item',
                        depth: depth,
                        author: this.huntMetadata(item).author || 'Anonymous',
                        content: [{ id: '', type: 'text', text: item.text.trim() }],
                        children: [],
                        collapsed: false
                    });
                }
            }

            // Rebuild tree from flat list based on depth
            return this.rebuildThreadTree(flatBlocks);
        }
        return [];
    }

    private rebuildThreadTree(flat: ContentBlock[]): ContentBlock[] {
        const root: ContentBlock[] = [];
        const stack: { block: any, depth: number }[] = [];

        for (const block of flat) {
            if (block.type !== 'thread-item') continue;

            while (stack.length > 0 && stack[stack.length - 1]!.depth >= block.depth) {
                stack.pop();
            }

            if (stack.length === 0) {
                root.push(block);
            } else {
                stack[stack.length - 1]!.block.children.push(block);
                block.parentId = stack[stack.length - 1]!.block.id;
            }
            stack.push({ block, depth: block.depth });
        }

        return root;
    }

    private matchesSelector(element: HTMLElement, selector: string): boolean {
        const parts = selector.split(',').map(s => s.trim());
        for (const part of parts) {
            // Handle tag.class notation
            const [tagName, ...classes] = part.split('.');

            let match = true;
            if (tagName && tagName !== element.tagName.toLowerCase()) {
                match = false;
            }

            if (match && classes.length > 0) {
                const elementClasses = (element.getAttribute('class') || '').split(/\s+/);
                for (const cls of classes) {
                    if (!elementClasses.includes(cls)) {
                        match = false;
                        break;
                    }
                }
            }

            // Handle attribute selector [attr=val]
            if (!tagName && part.startsWith('[') && part.endsWith(']')) {
                const attrMatch = part.match(/\[([a-zA-Z0-9_-]+)=['"]?([^'"]+)['"]?\]/);
                if (attrMatch) {
                    const [_, name, value] = attrMatch;
                    if (element.getAttribute(name!) !== value) match = false;
                    else match = true;
                }
            }

            if (match) return true;
        }
        return false;
    }

    private traverse(node: HTMLElement, blocks: ContentBlock[]) {
        const itemSelector = this.pack?.selectors.item;

        for (const child of node.childNodes) {
            if (child instanceof HTMLElement) {
                const tag = child.tagName.toLowerCase();

                // Check for blacklisted elements
                if (this.pack?.filters?.some(f => this.matchesSelector(child, f))) {
                    continue;
                }

                if (itemSelector && this.matchesSelector(child, itemSelector)) {
                    this.extractComment(child, blocks);
                } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                    blocks.push({
                        id: '',
                        type: 'heading',
                        level: parseInt(tag.substring(1)),
                        text: child.text.trim()
                    });
                } else if (tag === 'p') {
                    const text = child.text.trim();
                    if (text) {
                        blocks.push({ id: '', type: 'text', text });
                    }
                } else if (tag === 'blockquote') {
                    blocks.push({ id: '', type: 'quote', text: child.text.trim() });
                } else if (tag === 'pre' || tag === 'code') {
                    blocks.push({ id: '', type: 'code', text: child.text.trim() });
                } else if (tag === 'ul' || tag === 'ol') {
                    const items = child.querySelectorAll('li').map(li => li.text.trim()).filter(t => t);
                    if (items.length > 0) blocks.push({ id: '', type: 'list', items });
                } else if (tag === 'a') {
                    blocks.push({
                        id: '',
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

        // Body extraction -> blocks
        let bodyNode: HTMLElement | null = null;
        if (selectors?.body) {
            bodyNode = child.querySelector(selectors.body);
        }
        if (!bodyNode) {
            bodyNode = child.querySelector('[slot="comment"]') || child.querySelector('.md') || child;
        }

        const commentContent: ContentBlock[] = [];
        if (bodyNode) {
            this.traverse(bodyNode, commentContent);
        }

        // Depth extraction
        let depth = 0;
        if (selectors?.depthMethod === 'attr' && selectors.depth) {
            const attrParts = selectors.depth.split(':');
            depth = parseInt(child.getAttribute(attrParts[1] || attrParts[0]!) || '0');
        } else if (selectors?.depthMethod === 'query' && selectors.depth) {
            const depthEl = child.querySelector(selectors.depth);
            if (depthEl) {
                if (selectors.depthMath) {
                    const rawValue = parseInt(depthEl.getAttribute('width') || depthEl.text || '0');
                    if (selectors.depthMath === 'x / 40') depth = Math.floor(rawValue / 40);
                    else depth = rawValue;
                } else {
                    depth = parseInt(depthEl.text || '0');
                }
            }
        } else if (selectors?.depthMethod === 'nested') {
            // Count parents matching itemSelector
            let parent = child.parentNode;
            while (parent && parent instanceof HTMLElement) {
                if (this.pack?.selectors.item && this.matchesSelector(parent, this.pack.selectors.item)) {
                    depth++;
                }
                parent = parent.parentNode;
            }
        } else {
            // Default heuristics
            depth = parseInt(child.getAttribute('depth') || child.getAttribute('aria-level') || '0');
            if (depth > 0) this.addStep('Depth Inference', 'Attribute', `Found depth ${depth} via attribute`, { method: 'attribute', value: depth });
        }

        const children: ContentBlock[] = [];
        const item: ContentBlock = {
            id: '', // Will be set in post-processing
            type: 'thread-item',
            depth: depth,
            author: author,
            content: commentContent,
            children,
            collapsed: false
        };
        blocks.push(item);

        // Recurse into children
        const itemSelector = this.pack?.selectors.item;
        for (const nestedChild of child.childNodes) {
            if (nestedChild instanceof HTMLElement) {
                if (itemSelector && this.matchesSelector(nestedChild, itemSelector)) {
                    this.extractComment(nestedChild, children);
                } else {
                    this.extractCommentSearch(nestedChild, children);
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

    private async renderFromJson(json: any, url: string, extractor: any): Promise<{ doc: PageDoc }> {
        const rawDoc = extractor.extract(json, url);

        const doc = this.finalizeDoc({
            title: rawDoc.title,
            url: rawDoc.url,
            author: rawDoc.meta.author,
            site: rawDoc.meta.site,
            date: rawDoc.meta.published,
            pack: rawDoc.meta.pack,
            jsonLd: !!rawDoc.meta.jsonLd,
            confidence: rawDoc.meta.confidence || 1.0,
            warnings: rawDoc.meta.warnings || [],
            kind: rawDoc.kind,
            content: rawDoc.content,
            source: 'json-api',
            mimeType: 'application/json'
        });

        return { doc };
    }

    private applyResourceLimits(blocks: ContentBlock[], maxDepth?: number, maxLength?: number) {
        // Iterate backwards to allow safe removal
        for (let i = blocks.length - 1; i >= 0; i--) {
            const block = blocks[i];

            // 1. Max Length Truncation (Apply to all text-bearing blocks)
            if (maxLength && maxLength > 0) {
                if ('text' in block && block.text.length > maxLength) {
                    block.text = block.text.substring(0, maxLength) + '...';
                }
            }

            // 2. Max Depth Pruning (Specific to thread-items)
            if (block.type === 'thread-item') {
                // Prune
                if (maxDepth !== undefined && block.depth > maxDepth) {
                    blocks.splice(i, 1);
                    continue;
                }

                // Recurse
                // Note: We recurse into children AND content of thread items
                if (block.children) this.applyResourceLimits(block.children, maxDepth, maxLength);
                if (block.content) this.applyResourceLimits(block.content, maxDepth, maxLength);
            }
        }
    }
}
