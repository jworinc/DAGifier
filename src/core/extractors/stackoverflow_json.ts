import { PageDoc, ContentBlock } from '../../types';

export class StackOverflowJsonExtractor {
    static extract(json: any, url?: string): PageDoc {
        const question = json.items?.[0];
        if (!question) throw new Error('Invalid StackOverflow JSON response');

        const title = question.title;
        const author = question.owner?.display_name;
        const site = 'stackoverflow.com';
        const published = new Date(question.creation_date * 1000).toISOString();

        const content: ContentBlock[] = [];

        // 1. Question Body
        if (question.body) {
            content.push({ id: '', type: 'text', text: this.stripHtml(question.body) });
        }

        // 2. Answers (if present in the filter)
        if (question.answers) {
            for (const answer of question.answers) {
                const answerContent: ContentBlock[] = [
                    { id: '', type: 'text', text: this.stripHtml(answer.body) }
                ];
                content.push({
                    id: '',
                    type: 'thread-item',
                    depth: 0,
                    author: answer.owner?.display_name,
                    content: answerContent,
                    children: []
                });
            }
        }

        return {
            version: '1.1',
            title,
            url: url || question.link,
            meta: {
                author,
                site,
                published,
                pack: 'stackoverflow.com (JSON)',
                confidence: 1.0,
                warnings: []
            },
            kind: 'thread',
            content,
            links: [],
            metadata: {
                source: 'stack-exchange-api',
                mimeType: 'application/json'
            }
        };
    }

    private static stripHtml(html: string): string {
        // Simple HTML strip for the extractor
        return html.replace(/<[^>]*>?/gm, '').trim();
    }
}
