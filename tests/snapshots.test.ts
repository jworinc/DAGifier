import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { ExtractionPipeline } from '../src/core/pipeline';
import { Renderer } from '../src/core/renderer';
import { PatternEngine } from '../src/core/patterns';

describe('Snapshots', async () => {
    const pipeline = new ExtractionPipeline();
    const renderer = new Renderer();
    const engine = new PatternEngine(path.join(__dirname, '../patterns'));

    beforeAll(async () => {
        await engine.loadPacks();
    });

    const getFiles = async (dir: string, base: string = ''): Promise<string[]> => {
        const entries = await fs.readdir(path.join(dir, base), { withFileTypes: true });
        let files: string[] = [];
        for (const entry of entries) {
            const res = path.join(base, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'core8') continue;
                files = [...files, ...(await getFiles(dir, res))];
            } else if (res.endsWith('.html')) {
                files.push(res);
            }
        }
        return files;
    };

    const fixtures = await getFiles(path.join(__dirname, 'fixtures'));

    fixtures.forEach((fixture) => {
        it(`should match golden for ${fixture}`, async () => {
            const name = fixture.replace('.html', '');
            const fixturePath = path.join(__dirname, 'fixtures', fixture);
            const goldenPath = path.join(__dirname, 'goldens', `${name}.txt`);

            const html = await fs.readFile(fixturePath, 'utf-8');
            const expected = await fs.readFile(goldenPath, 'utf-8');

            let identifier = fixturePath;
            if (fixture.startsWith('hn/')) identifier = 'https://news.ycombinator.com/item?id=43085603';
            else if (fixture.startsWith('github/')) identifier = 'https://github.com/microsoft/vscode/issues/242220';
            else if (fixture.includes('r_clawdbot_ama')) identifier = 'https://www.reddit.com/r/clawdbot/comments/1r2rjbt/';
            else if (fixture.includes('blog')) identifier = 'https://generic-blog.com/';

            const payload = {
                source: 'url' as const,
                identifier,
                rawContent: Buffer.from(html),
                mimeType: 'text/html'
            };

            const pack = engine.getPackForUrl(payload.identifier);

            const { doc } = await pipeline.process(payload, pack);
            // Force width to 60 to match goldens
            let actual = renderer.render(doc, { full: true, width: 60 });

            if (fixture.includes('r_clawdbot_ama')) {
                console.log(`\n--- [V] TARGET REDDIT THREAD: https://www.reddit.com/r/clawdbot/comments/1r2rjbt/ ---\n${actual}\n------------------------------------------\n`);
            } else {
                console.log(`\n--- RENDERED OUTPUT FOR ${fixture} ---\n${actual}\n------------------------------------------\n`);
            }

            // Normalize: Remove timestamp and source lines which change between runs/environments
            const normalize = (text: string) => text.split('\n')
                .filter(line => !line.includes('Extracted via DAGifier') && !line.startsWith('Source: '))
                .join('\n')
                .trim();

            // UPDATE GOLDENS
            expect(normalize(actual)).toBe(normalize(expected));
        });
    });
});
