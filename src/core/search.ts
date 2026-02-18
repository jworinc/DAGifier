import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';

export type SearchBackend = 'auto' | 'qmd' | 'ug' | 'rg';
export type SearchScope = 'kn/memory' | 'kn/threads' | 'kn/projects' | 'kn/docs' | 'code' | 'docs' | 'config' | 'all';

export interface SearchResult {
    path: string;
    scope: SearchScope;
    backend: string;
}

export class SearchManager {
    constructor(private cwd: string = process.cwd()) { }

    detectScope(filePath: string): SearchScope {
        const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath);
        const dirname = path.basename(path.dirname(absPath));
        const ext = path.extname(absPath).replace('.', '');

        // Directory-based High-Level Scopes
        if (dirname === 'memory') return 'kn/memory';
        if (dirname === 'threads') return 'kn/threads';
        if (dirname === 'projects') return 'kn/projects';
        if (dirname === 'docs' || dirname === 'documentation') return 'kn/docs';

        // Extension-based Scopes
        if (['md', 'txt', 'pdf', 'docx', 'doc'].includes(ext)) return 'docs';
        if (['js', 'ts', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'jsx', 'tsx', 'sh', 'zsh', 'bash'].includes(ext)) return 'code';
        if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf'].includes(ext)) return 'config';

        return 'all'; // Default fallback
    }

    async search(query: string, folder: string, options: { backend?: SearchBackend, limit?: number, scope?: SearchScope } = {}): Promise<SearchResult[]> {
        const limit = options.limit || 20;
        const backend = options.backend || 'auto';
        const targetDir = path.resolve(this.cwd, folder);

        let rawResults: string[] = [];
        let usedBackend = '';

        // Helper to run command
        const runCmd = async (cmd: string, args: string[]): Promise<string[]> => {
            return new Promise((resolve) => {
                const child = spawn(cmd, args, { cwd: targetDir, stdio: ['ignore', 'pipe', 'ignore'] });
                let output = '';
                child.stdout.on('data', d => output += d.toString());
                child.on('close', () => resolve(output.trim().split('\n').filter(l => l)));
                child.on('error', () => resolve([]));
            });
        };

        // 1. QMD (Vector/Hybrid)
        if (backend === 'qmd' || backend === 'auto') {
            // Need to infer collection name from folder?
            // scripts/semsearch.sh does: basename "$FOLDER" | tr ...
            const collection = path.basename(targetDir).toLowerCase().replace(/[^a-z0-9-]/g, '');

            // Check existence of QMD?
            // For now, simpler: try running it.
            // Using `qmd` cli might be slow if we spawn. 
            // NOTE: semsearch.sh checks `command -v qmd`.
            // We will optimistically try.

            // QMD vsearch
            const res = await runCmd('qmd', ['vsearch', '-n', String(limit), query, '-c', collection]);
            if (res.length > 0) {
                rawResults = res;
                usedBackend = 'qmd';
            } else if (backend === 'qmd') {
                // Fallback to query if vsearch fails? script does.
                const res2 = await runCmd('qmd', ['query', '-n', String(limit), query, '-c', collection]);
                if (res2.length > 0) {
                    rawResults = res2;
                    usedBackend = 'qmd';
                }
            }
        }

        // 2. UG (Unified Grep)
        if ((backend === 'ug' || (backend === 'auto' && rawResults.length === 0))) {
            const res = await runCmd('ug', ['-l', '--max-count', String(limit), '-i', query, '.']);
            if (res.length > 0) {
                rawResults = res;
                usedBackend = 'ug';
            }
        }

        // 3. RG (Ripgrep)
        if ((backend === 'rg' || (backend === 'auto' && rawResults.length === 0))) {
            const res = await runCmd('rg', ['-l', '--max-count', String(limit), '-i', query, '.']);
            if (res.length > 0) {
                rawResults = res;
                usedBackend = 'rg';
            }
        }

        if (!usedBackend && rawResults.length === 0) {
            // Check if any tools exist at all to warn user?
            // Actually, we can just return a special result or let the CLI handle "No results"
            // But distinguishing "No results" from "No backend" is nice.
            // Let's rely on the CLI to say "No results" but maybe we can inject a result?
            // No, polluting results is bad.
            // We'll throw a specific error if FORCE backend was used and failed.
            if (backend !== 'auto') {
                // The user asked for a specific backend and it produced no results (or didn't run).
                // We can't easily distinguish "empty grep" from "grep not found" with current runCmd.
                // But runCmd resolves [] on error.
                // Let's assume if auto failed, we just found nothing.
            }

            // Heuristic check: If auto and no results, check if 'rg' exists? 
            // Too expensive. Let's strictly return empty.
        }

        // Map results to objects and filter by scope
        const results: SearchResult[] = [];
        for (const line of rawResults) {
            // Lines from grep tools are usually paths relative to CWD
            const fullPath = path.resolve(targetDir, line);
            const scope = this.detectScope(fullPath);

            // Filter logic
            if (options.scope && options.scope !== 'all') {
                // simple match: if requested "kn/code", scope matches "kn" or "code"?
                // script logic:
                // if scope has '/', exact match (or prefix match?)
                // script: "kn/memory" must match "kn/memory"
                // "kn" matches "kn/*"

                const reqParts = options.scope.split('/');
                const actParts = scope.split('/');

                let match = true;
                if (reqParts[0] !== actParts[0]) match = false;
                if (match && reqParts[1] && reqParts[1] !== actParts[1]) match = false;

                if (!match) continue;
            }

            results.push({
                path: fullPath,
                scope,
                backend: usedBackend
            });
        }

        return results;
    }
}
