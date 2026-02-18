import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import chalk from 'chalk';

export interface ThreadItem {
    id: string;
    path: string;
    title: string;
    date: string;
    project: string;
    agent: string;
    grade: string;
    type: 'thread' | 'task';
    mtime: Date;
}

export interface ThreadFilters {
    date?: string;
    project?: string;
    agent?: string;
    grade?: string;
    type?: 'thread' | 'task' | 'all';
    limit?: number;
    sort?: 'newest' | 'oldest';
    search?: string;
}

export class ThreadManager {
    constructor(private workspaceDir: string) { }

    async listThreads(filters: ThreadFilters = {}): Promise<ThreadItem[]> {
        const dir = path.resolve(this.workspaceDir);
        let files: string[] = [];

        try {
            const allFiles = await fs.readdir(dir);
            files = allFiles.filter(f => f.endsWith('.md') && (f.startsWith('T') || f.startsWith('K')));
        } catch (e) {
            throw new Error(`Failed to read threads directory: ${dir}`);
        }

        const items: ThreadItem[] = [];

        // Parallel processing for speed
        await Promise.all(files.map(async (file) => {
            const filepath = path.join(dir, file);
            try {
                const content = await fs.readFile(filepath, 'utf-8');
                const stat = await fs.stat(filepath);

                // Parse frontmatter
                const match = content.match(/^---\n([\s\S]*?)\n---/);
                let meta: any = {};
                if (match) {
                    try {
                        meta = yaml.parse(match[1]);
                    } catch (e) { /* ignore bad yaml */ }
                }

                // fallback title
                if (!meta.title) {
                    const titleMatch = content.match(/^#\s+(.+)$/m);
                    meta.title = titleMatch ? titleMatch[1] : file;
                }

                items.push({
                    id: file.replace('.md', ''),
                    path: filepath,
                    title: meta.title || file,
                    date: meta.date || new Date(stat.mtime).toISOString().split('T')[0],
                    project: (meta.project || '').replace(/[\[\]"]/g, ''),
                    agent: meta.agent || 'Unknown',
                    grade: meta.grade || 'ungraded',
                    type: file.startsWith('K') ? 'task' : 'thread',
                    mtime: stat.mtime
                });
            } catch (e) {
                // skip unreadable
            }
        }));

        // Filter
        let results = items.filter(item => {
            if (filters.date) {
                if (filters.date === 'today') {
                    const today = new Date().toISOString().split('T')[0];
                    if (item.date !== today) return false;
                } else if (filters.date === 'yesterday') {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    const yStr = y.toISOString().split('T')[0];
                    if (item.date !== yStr) return false;
                } else if (item.date !== filters.date) {
                    return false;
                }
            }

            if (filters.project && item.project !== filters.project) return false;
            if (filters.agent && item.agent !== filters.agent) return false;

            if (filters.grade) {
                if (filters.grade === 'graded' && item.grade === 'ungraded') return false;
                if (filters.grade === 'ungraded' && item.grade !== 'ungraded') return false;
                if (filters.grade.length === 1 && item.grade !== filters.grade) return false;
            }

            if (filters.type && filters.type !== 'all' && item.type !== filters.type) return false;

            if (filters.search) {
                const term = filters.search.toLowerCase();
                if (!item.title.toLowerCase().includes(term) && !item.id.toLowerCase().includes(term)) return false;
            }

            return true;
        });

        // Sort
        results.sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return filters.sort === 'oldest' ? timeA - timeB : timeB - timeA;
        });

        // Limit
        if (filters.limit) {
            results = results.slice(0, filters.limit);
        }

        return results;
    }
}
