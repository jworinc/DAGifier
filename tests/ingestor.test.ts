import { describe, it, expect, vi } from 'vitest';
import { Ingestor } from '../src/core/ingestor';
import path from 'path';
import fs from 'fs/promises';

describe('Ingestor', () => {
    const ingestor = new Ingestor();

    it('should ingest a local file', async () => {
        const filePath = path.join(__dirname, 'fixtures/blog/test1.html');
        const payload = await ingestor.ingest(filePath);

        expect(payload.source).toBe('file');
        expect(payload.identifier).toBe(filePath);
        expect(payload.mimeType).toBe('text/html');
        expect(payload.rawContent.length).toBeGreaterThan(0);
    });

    it('should identify HTML content from buffer', async () => {
        // This implicitly tests internal type detection
        const filePath = path.join(__dirname, 'fixtures/blog/test1.html');
        const payload = await ingestor.ingest(filePath);
        expect(payload.mimeType).toBe('text/html');
    });

    // URL ingestion usually requires network, which we can mock if needed
    // But for now, ensuring file and local path handling is solid
});
