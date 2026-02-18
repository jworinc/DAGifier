import { PageDoc, ContentBlock } from '../../types';

export class HnJsonExtractor {
    static extract(json: any, url?: string): PageDoc {
        const title = json.title || 'Hacker News Thread';
        const author = json.author;
        const site = 'news.ycombinator.com';
        const published = json.created_at;

        const content: ContentBlock[] = [];

        if (json.text) {
            content.push({ id: '', type: 'text', text: json.text });
        } else if (json.url) {
            content.push({ id: '', type: 'link', text: 'External Link', url: json.url });
        }

        const commentBlocks = this.extractComments(json.children || []);
        content.push(...commentBlocks);

        return {
            version: '1.1',
            title,
            url: url || `https://news.ycombinator.com/item?id=${json.id}`,
            meta: {
                author,
                site,
                published,
                pack: 'news.ycombinator.com (JSON)',
                confidence: 1.0,
                warnings: []
            },
            kind: 'thread',
            content,
            links: [],
            metadata: {
                source: 'hn-algolia-api',
                mimeType: 'application/json'
            }
        };
    }

    private static extractComments(children: any[]): ContentBlock[] {
        const blocks: ContentBlock[] = [];

        for (const child of children) {
            if (child.text) {
                const commentContent: ContentBlock[] = [{ id: '', type: 'text', text: child.text }];

                blocks.push({
                    id: '',
                    type: 'thread-item',
                    depth: 0, // HN Algolia API returns nested children
                    author: child.author,
                    content: commentContent,
                    children: this.extractComments(child.children || [])
                });
            }
        }

        return blocks;
    }
}
