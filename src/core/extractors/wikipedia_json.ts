import { PageDoc, ContentBlock } from '../../types';

export class WikipediaJsonExtractor {
    static extract(json: any, url?: string): PageDoc {
        const title = json.displaytitle || json.title || 'Wikipedia Article';
        const site = 'wikipedia.org';
        const published = json.timestamp;

        const content: ContentBlock[] = [];

        if (json.extract) {
            content.push({ id: '', type: 'text', text: json.extract });
        }

        if (json.thumbnail?.source) {
            content.push({ id: '', type: 'image', alt: 'Article thumbnail', src: json.thumbnail.source });
        }

        return {
            version: '1.1',
            title,
            url: url || json.content_urls?.desktop?.page,
            meta: {
                site,
                published,
                pack: 'wikipedia.org (JSON)',
                confidence: 1.0,
                warnings: []
            },
            kind: 'article',
            content,
            links: [],
            metadata: {
                source: 'wikipedia-rest-api',
                mimeType: 'application/json'
            }
        };
    }
}
