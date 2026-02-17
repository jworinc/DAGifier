import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PatternEngine } from '../src/core/patterns';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('PatternEngine', () => {
    const patternsDir = path.join(__dirname, '../patterns');
    let engine: PatternEngine;

    beforeEach(async () => {
        engine = new PatternEngine(patternsDir);
        await engine.loadPacks();
    });

    it('should load patterns from the directory', async () => {
        // We know we have reddit and generic-blog
        const redditPack = engine.getPackForUrl('https://reddit.com/r/test');
        expect(redditPack).toBeDefined();
        expect(redditPack?.domain).toBe('reddit.com');

        const blogPack = engine.getPackForUrl('https://generic-blog.com/post');
        expect(blogPack).toBeDefined();
        expect(blogPack?.domain).toBe('generic-blog.com');
    });

    it('should match domains correctly regardless of www prefix', () => {
        const pack1 = engine.getPackForUrl('https://www.reddit.com');
        const pack2 = engine.getPackForUrl('https://reddit.com');
        expect(pack1).toBeDefined();
        expect(pack1).toEqual(pack2);
    });

    it('should fallback to substring matching for local file paths', () => {
        const pack = engine.getPackForUrl('/path/to/reddit/fixture.html');
        expect(pack).toBeDefined();
        expect(pack?.domain).toBe('reddit.com');
    });

    it('should return undefined for unknown domains', () => {
        const pack = engine.getPackForUrl('https://google.com');
        expect(pack).toBeUndefined();
    });
});
