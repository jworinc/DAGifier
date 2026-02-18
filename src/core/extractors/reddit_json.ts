import { PageDoc, ContentBlock } from '../../types';

export class RedditJsonExtractor {
    static extract(json: any, url?: string): PageDoc {
        // Reddit listing structure is usually an array [post, comments] 
        // or a single object for listings.
        const post = Array.isArray(json) ? json[0].data.children[0].data : json.data.children[0].data;
        const comments = Array.isArray(json) ? json[1].data.children : [];

        const title = post.title || 'Reddit Post';
        const author = post.author;
        const site = 'reddit.com';
        const published = new Date(post.created_utc * 1000).toISOString();

        const content: ContentBlock[] = [];

        // 1. Post Content (Selftext)
        if (post.selftext) {
            content.push({ id: '', type: 'text', text: post.selftext });
        } else if (post.url && !post.url.includes('reddit.com')) {
            content.push({ id: '', type: 'link', text: 'Link to content', url: post.url });
        }

        // 2. Comments
        const commentBlocks = this.extractComments(comments);
        content.push(...commentBlocks);

        return {
            version: '1.1',
            title,
            url: url || post.url,
            meta: {
                author,
                site,
                published,
                pack: 'reddit.com (JSON)',
                confidence: 1.0,
                warnings: []
            },
            kind: 'thread',
            content,
            links: [], // Will be populated by pipeline
            metadata: {
                source: 'json-api',
                mimeType: 'application/json'
            }
        };
    }

    private static extractComments(children: any[]): ContentBlock[] {
        const blocks: ContentBlock[] = [];

        for (const child of children) {
            if (child.kind === 't1') { // Comment
                const data = child.data;
                const author = data.author;
                const body = data.body;
                const depth = data.depth || 0;

                const commentContent: ContentBlock[] = [];
                if (body) {
                    commentContent.push({ id: '', type: 'text', text: body });
                }

                const nestedChildren = data.replies?.data?.children || [];
                const nestedBlocks = this.extractComments(nestedChildren);

                blocks.push({
                    id: '',
                    type: 'thread-item',
                    depth: depth,
                    author,
                    content: commentContent,
                    children: nestedBlocks
                });
            }
        }

        return blocks;
    }
}
