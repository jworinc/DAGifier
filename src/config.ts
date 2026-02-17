
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { execSync } from 'child_process';

export interface DagifierConfig {
    editor: string;
    viewer: string;
    differ: string;
    browser_headless: boolean;
    json_viewer?: string;
    markdown_viewer?: string;
}

const DEFAULT_CONFIG: DagifierConfig = {
    editor: process.env.EDITOR || 'vi',
    viewer: 'less -R',
    differ: 'diff',
    browser_headless: true,
    // viewers populated dynamically
};

export class ConfigManager {
    static async load(): Promise<DagifierConfig> {
        const locations = [
            path.join(os.homedir(), '.dagifierrc'),
            path.join(os.homedir(), '.config', 'dagifier', 'config.json')
        ];

        let userConfig = {};
        for (const loc of locations) {
            try {
                const content = await fs.readFile(loc, 'utf-8');
                userConfig = JSON.parse(content);
                break;
            } catch (e: any) {
                // ignore
            }
        }

        // Auto-detect smart viewers if not overridden
        const config = { ...DEFAULT_CONFIG, ...userConfig };

        if (!config.json_viewer) {
            config.json_viewer = this.detect(['jless', 'fx']); // Removed 'jq' as default viewer, specific flags cover it
        }

        if (!config.markdown_viewer) {
            config.markdown_viewer = this.detect(['glow', 'bat']);
            if (!config.markdown_viewer) config.markdown_viewer = 'less -R';
        }

        return config;
    }

    private static detect(cmds: string[]): string | undefined {
        for (const cmd of cmds) {
            try {
                // fast sync check
                execSync(`command -v ${cmd}`, { stdio: 'ignore' });
                return cmd;
            } catch (e) {
                continue;
            }
        }
        return undefined;
    }
}
