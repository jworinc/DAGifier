import axios from 'axios';
import fs from 'fs/promises';
import { IngestionPayload } from '../types';
import { fileTypeFromBuffer } from 'file-type';

export class Ingestor {
    async fromUrl(url: string): Promise<IngestionPayload> {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const buffer = Buffer.from(response.data);
        const type = await fileTypeFromBuffer(buffer);

        return {
            source: 'url',
            identifier: url,
            rawContent: buffer,
            mimeType: type?.mime || response.headers['content-type']
        };
    }

    async fromFile(path: string): Promise<IngestionPayload> {
        const buffer = await fs.readFile(path);
        const type = await fileTypeFromBuffer(buffer);

        return {
            source: 'file',
            identifier: path,
            rawContent: buffer,
            mimeType: type?.mime
        };
    }

    async fromStdin(): Promise<IngestionPayload> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
            process.stdin.on('end', async () => {
                const buffer = Buffer.concat(chunks);
                const type = await fileTypeFromBuffer(buffer);
                resolve({
                    source: 'stdin',
                    identifier: '-',
                    rawContent: buffer,
                    mimeType: type?.mime
                });
            });
            process.stdin.on('error', reject);
        });
    }

    async ingest(input: string): Promise<IngestionPayload> {
        if (input === '-') {
            return this.fromStdin();
        }
        if (input.startsWith('http')) {
            return this.fromUrl(input);
        }
        return this.fromFile(input);
    }
}
