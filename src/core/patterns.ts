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
        depthMethod?: 'attr' | 'query' | 'nested';
        depthMath?: string; // e.g. "x / 40"
    };
    transform?: {
        search: string;
        replace: string;
    };
    filters?: string[];
}

export interface DomainState {
    provider?: 'fetch' | 'playwright' | 'firecrawl';
    lastSuccess?: string;
    packVersion?: string;
    selectors?: any;
    score?: number;
    needsRendering?: boolean;
}

export class PatternEngine {
    private packs: Map<string, PatternPack> = new Map();
    private patternsDir: string;

    private state: Record<string, DomainState> = {};
    private statePath: string;

    constructor(patternsDir: string) {
        this.patternsDir = patternsDir;
        this.statePath = path.join(os.homedir(), '.dagifier', 'site-state.json');
    }

    addPack(pack: PatternPack) {
        if (pack.domain) {
            this.packs.set(pack.domain, pack);
        }
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
            console.error(`[PatternEngine] Error loading packs from ${this.patternsDir}: ${error}`);
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

    async saveDomainState(domain: string, data: Partial<DomainState>) {
        this.state[domain] = { ...this.state[domain], ...data, lastSuccess: new Date().toISOString() };
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
            // Fallback: check if the input string contains any of our domain keys or their base names
            for (const [domain, pack] of this.packs.entries()) {
                if (url.includes(domain)) return pack;
                const base = domain.split('.')[0];
                if (base && url.includes(base)) return pack;
            }
            return undefined;
        }
    }

    async getDomainState(url: string): Promise<DomainState | undefined> {
        try {
            const domain = new URL(url).hostname.replace('www.', '');
            return this.state[domain];
        } catch {
            return undefined;
        }
    }
}
