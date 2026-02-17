import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import os from 'os';

export interface PatternPack {
    domain: string;
    selectors: {
        root?: string;
        item?: string;
        author?: string;
        body?: string;
        depth?: string;
    };
    filters?: string[];
}

export class PatternEngine {
    private packs: Map<string, PatternPack> = new Map();
    private patternsDir: string;

    private state: Record<string, any> = {};
    private statePath: string;

    constructor(patternsDir: string) {
        this.patternsDir = patternsDir;
        this.statePath = path.join(os.homedir(), '.dagifier', 'site-state.json');
    }

    async loadPacks() {
        try {
            const files = await fs.readdir(this.patternsDir);
            for (const file of files) {
                if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                    const content = await fs.readFile(path.join(this.patternsDir, file), 'utf-8');
                    const pack = yaml.parse(content) as PatternPack;
                    if (pack.domain) {
                        this.packs.set(pack.domain, pack);
                    }
                }
            }
            await this.loadState();
        } catch (error) {
            // If directory doesn't exist yet, that's fine
        }
    }

    private async loadState() {
        try {
            const content = await fs.readFile(this.statePath, 'utf-8');
            this.state = JSON.parse(content);
        } catch {
            this.state = {};
        }
    }

    async saveDomainState(domain: string, data: any) {
        this.state[domain] = { ...this.state[domain], ...data, lastUsed: new Date().toISOString() };
        try {
            await fs.mkdir(path.dirname(this.statePath), { recursive: true });
            await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.error(`Failed to save state: ${error}`);
        }
    }

    getPackForUrl(url: string): PatternPack | undefined {
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            return this.packs.get(domain);
        } catch {
            return undefined;
        }
    }
}
