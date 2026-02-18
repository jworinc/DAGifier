import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Coordinator } from '../src/core/coordinator';
import { PatternEngine } from '../src/core/patterns';
import { BrowserAdapter } from '../src/core/browser';
import { Ingestor } from '../src/core/ingestor';
import { Renderer } from '../src/core/renderer';
import path from 'path';
import fs from 'fs/promises';

describe('Pattern-driven Transformation & JSON Extraction', () => {
    let engine: PatternEngine;
    let browserAdapter: BrowserAdapter;
    let coordinator: Coordinator;

    beforeEach(async () => {
        engine = new PatternEngine(path.join(__dirname, '../patterns'));
        await engine.loadPacks();
        browserAdapter = new BrowserAdapter();
        coordinator = new Coordinator(engine, browserAdapter);
    });

    it('should transform Reddit URL based on pattern', async () => {
        const url = 'https://www.reddit.com/r/openclaw/comments/1r4t9q8/openclaw_best_practices/';
        const pack = engine.getPackForUrl(url);

        expect(pack).toBeDefined();
        expect(pack?.transform).toBeDefined();

        const regex = new RegExp(pack!.transform!.search);
        const transformed = url.replace(regex, pack!.transform!.replace);

        expect(transformed).toBe('https://www.reddit.com/r/openclaw/comments/1r4t9q8/openclaw_best_practices/.json');
    });

    it('should extract data from Reddit JSON fixture', async () => {
        const fixturePath = path.join(__dirname, 'fixtures/reddit_post.json');
        // Ensure fixture exists or mock it
        const jsonContent = await fs.readFile(fixturePath, 'utf-8');
        const payload = {
            source: 'url' as const,
            identifier: 'https://www.reddit.com/r/test.json',
            rawContent: Buffer.from(jsonContent),
            mimeType: 'application/json'
        };

        const { ExtractionPipeline } = await import('../src/core/pipeline');
        const pipeline = new ExtractionPipeline();
        const pack = engine.getPackForUrl('https://www.reddit.com');

        const { doc } = await pipeline.process(payload as any, pack);

        const renderer = new Renderer();
        const output = renderer.render(doc, { full: true });
        const goldenPath = path.join(__dirname, 'goldens/reddit_json.txt');
        await fs.mkdir(path.dirname(goldenPath), { recursive: true });
        await fs.writeFile(goldenPath, output);

        expect(doc.title).toBe('OpenClaw Best Practices: what actually works after 25 years');
        expect(doc.meta.author).toBe('claw_master');
        expect(doc.kind).toBe('thread');
        expect(doc.content.some(b => b.type === 'thread-item')).toBe(true);
    });

    it('should extract data from HN JSON fixture', async () => {
        const fixturePath = path.join(__dirname, 'fixtures/hn_post.json');
        const jsonContent = await fs.readFile(fixturePath, 'utf-8');
        const payload = {
            source: 'url' as const,
            identifier: 'https://news.ycombinator.com/item?id=123456',
            rawContent: Buffer.from(jsonContent),
            mimeType: 'application/json'
        };

        const { ExtractionPipeline } = await import('../src/core/pipeline');
        const pipeline = new ExtractionPipeline();

        const { doc } = await pipeline.process(payload as any);

        const renderer = new Renderer();
        const output = renderer.render(doc, { full: true });
        const goldenPath = path.join(__dirname, 'goldens/hn_json.txt');
        await fs.writeFile(goldenPath, output);

        expect(doc.title).toBe('Welcome to Hacker News');
        expect(doc.meta.author).toBe('pg');
        expect(doc.kind).toBe('thread');
        expect(doc.content.some(b => b.type === 'thread-item')).toBe(true);
    });

    it('should extract data from Wikipedia JSON fixture', async () => {
        const fixturePath = path.join(__dirname, 'fixtures/wikipedia_page.json');
        const jsonContent = await fs.readFile(fixturePath, 'utf-8');
        const payload = {
            source: 'url' as const,
            identifier: 'https://en.wikipedia.org/wiki/OpenClaw',
            rawContent: Buffer.from(jsonContent),
            mimeType: 'application/json'
        };

        const { ExtractionPipeline } = await import('../src/core/pipeline');
        const pipeline = new ExtractionPipeline();

        const { doc } = await pipeline.process(payload as any);

        const renderer = new Renderer();
        const output = renderer.render(doc, { full: true });
        const goldenPath = path.join(__dirname, 'goldens/wikipedia_json.txt');
        await fs.writeFile(goldenPath, output);

        expect(doc.title).toBe('OpenClaw');
        expect(doc.kind).toBe('article');
        const firstBlock = doc.content[0];
        if (firstBlock.type === 'text') {
            expect(firstBlock.text).toContain('open-source recreation');
        } else {
            throw new Error('Expected first block to be text');
        }
    });

    it('should extract data from StackOverflow JSON fixture', async () => {
        const fixturePath = path.join(__dirname, 'fixtures/stackoverflow_post.json');
        const jsonContent = await fs.readFile(fixturePath, 'utf-8');
        const payload = {
            source: 'url' as const,
            identifier: 'https://stackoverflow.com/questions/11227809/test-question',
            rawContent: Buffer.from(jsonContent),
            mimeType: 'application/json'
        };

        const { ExtractionPipeline } = await import('../src/core/pipeline');
        const pipeline = new ExtractionPipeline();

        const { doc } = await pipeline.process(payload as any);

        const renderer = new Renderer();
        const output = renderer.render(doc, { full: true });
        const goldenPath = path.join(__dirname, 'goldens/stackoverflow_json.txt');
        await fs.writeFile(goldenPath, output);

        expect(doc.title).toBe('How to test arrays in JS?');
        expect(doc.meta.author).toBe('coder1');
        expect(doc.kind).toBe('thread');
        expect(doc.content.some(b => b.type === 'thread-item')).toBe(true);
    });
});
