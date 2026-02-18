import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { diffLines } from 'diff';
import yaml from 'yaml';

export class CriManager {
    private criDir: string | null = null;
    private backupDir: string | null = null;
    private auditFile: string | null = null;

    constructor(private targetFile: string) { }

    // 1. Discovery
    async init() {
        // Find workspace root by looking for .meta/
        let current = path.dirname(path.resolve(this.targetFile));
        while (current !== '/') {
            const metaPath = path.join(current, '.meta');
            try {
                await fs.access(metaPath);
                this.criDir = path.join(metaPath, 'cri');
                this.backupDir = path.join(this.criDir, 'backups');
                await fs.mkdir(this.backupDir, { recursive: true });
                return;
            } catch {
                current = path.dirname(current);
            }
        }
        // Fallback: local .cri
        const local = path.dirname(path.resolve(this.targetFile));
        this.criDir = path.join(local, '.cri');
        this.backupDir = path.join(this.criDir, 'backups');
        this.auditFile = path.join(this.criDir, 'audit.jsonl');
        await fs.mkdir(this.backupDir, { recursive: true });
    }

    // 1.5 Audit
    async audit(action: string, details: any) {
        if (!this.auditFile) await this.init();
        if (!this.auditFile) return;

        const entry = {
            timestamp: new Date().toISOString(),
            action,
            file: this.targetFile,
            ...details
        };
        await fs.appendFile(this.auditFile, JSON.stringify(entry) + '\n');
    }

    // 2. Backup
    async createBackup(): Promise<string> {
        if (!this.backupDir) await this.init();
        if (!this.backupDir) throw new Error("Could not initialize backup dir");

        const content = await fs.readFile(this.targetFile);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const basename = path.basename(this.targetFile);
        const backupPath = path.join(this.backupDir, `${basename}.${timestamp}`);

        await fs.writeFile(backupPath, content);
        return backupPath;
    }

    async getBackups(): Promise<string[]> {
        if (!this.backupDir) await this.init();
        if (!this.backupDir) return [];

        const files = await fs.readdir(this.backupDir);
        const basename = path.basename(this.targetFile);
        return files
            .filter(f => f.startsWith(basename + '.'))
            .sort().reverse() // Newest first (lexicographical ISO sort works)
            .map(f => path.join(this.backupDir!, f));
    }

    // 3. Validation
    async validate(content: string): Promise<boolean> {
        const ext = path.extname(this.targetFile);
        try {
            if (ext === '.json') {
                JSON.parse(content);
            } else if (ext === '.yaml' || ext === '.yml') {
                yaml.parse(content);
            } else if (ext === '.sh') {
                // simple check
                if (!content.trim()) return false;
            }
            return true;
        } catch (e: any) {
            console.error(chalk.red(`[!] Validation Failed: ${e.message}`));
            return false;
        }
    }

    // 4. Operations
    async apply(newContent: string, dryRun: boolean = false) {
        // Diff
        const oldContent = await fs.readFile(this.targetFile, 'utf-8');
        const diff = diffLines(oldContent, newContent);

        console.log(chalk.bold('\n--- Proposed Changes ---'));
        diff.forEach(part => {
            const color = part.added ? chalk.green : part.removed ? chalk.red : chalk.grey;
            if (part.added || part.removed) process.stdout.write(color(part.value));
        });
        console.log('\n------------------------');

        // Validate
        if (!await this.validate(newContent)) {
            throw new Error("Validation failed");
        }

        if (dryRun) {
            console.log(chalk.yellow('[i] Dry run complete. No changes applied.'));
            return;
        }

        // Backup
        const backup = await this.createBackup();
        console.log(chalk.green(`[+] Backup created: ${path.basename(backup)}`));

        // Write
        await fs.writeFile(this.targetFile, newContent);
        console.log(chalk.green(`[+] Changes applied to ${path.basename(this.targetFile)}`));
        await this.audit('apply', { backup: path.basename(backup) });
    }

    async rollback(backupId?: string) {
        const backups = await this.getBackups();
        if (backups.length === 0) throw new Error("No backups found");

        let targetBackup = backups[0];
        if (backupId) {
            const found = backups.find(b => b.includes(backupId));
            if (!found) throw new Error(`Backup ID ${backupId} not found`);
            targetBackup = found;
        }

        const content = await fs.readFile(targetBackup, 'utf-8');

        // Safety backup of current
        const safety = await this.createBackup();
        console.log(chalk.cyan(`[i] Safety backup of current state: ${path.basename(safety)}`));

        await fs.writeFile(this.targetFile, content);
        console.log(chalk.green(`[+] Rolled back to ${path.basename(targetBackup)}`));
        await this.audit('rollback', { from: path.basename(targetBackup), safety: path.basename(safety) });
    }

    async prune(keep: number = 10) {
        const backups = await this.getBackups();
        if (backups.length <= keep) {
            console.log(chalk.dim(`[i] Only ${backups.length} backups, nothing to prune.`));
            return;
        }

        const toRemove = backups.slice(keep);
        console.log(chalk.yellow(`[i] Pruning ${toRemove.length} old backups...`));

        await Promise.all(toRemove.map(f => fs.unlink(f)));
        console.log(chalk.green(`[+] Pruned.`));
        await this.audit('prune', { keep, removed: toRemove.length });
    }

    async diff(backupId?: string) {
        if (!this.backupDir) await this.init();
        const backups = await this.getBackups();

        let targetContent = '';
        let targetName = 'Current';

        if (!backupId) {
            if (backups.length === 0) { console.log("No backups."); return; }
            targetContent = await fs.readFile(backups[0], 'utf-8');
            targetName = path.basename(backups[0]);
        } else {
            const found = backups.find(b => b.includes(backupId));
            if (!found) throw new Error(`Backup ${backupId} not found`);
            targetContent = await fs.readFile(found, 'utf-8');
            targetName = path.basename(found);
        }

        const currentContent = await fs.readFile(this.targetFile, 'utf-8');
        console.log(chalk.bold(`Diff: ${path.basename(this.targetFile)} <-> ${targetName}`));

        const diff = diffLines(currentContent, targetContent);
        diff.forEach(part => {
            const color = part.added ? chalk.green : part.removed ? chalk.red : chalk.grey;
            process.stdout.write(color(part.value));
        });
    }

    async status() {
        if (!this.backupDir) await this.init();

        const stat = await fs.stat(this.targetFile);
        console.log(chalk.bold(`File: ${this.targetFile}`));
        console.log(`Size: ${stat.size} bytes`);
        console.log(`Modified: ${stat.mtime}`);
        console.log(`CRI Dir: ${this.criDir || 'Not found'}`);

        const backups = await this.getBackups();
        console.log(chalk.bold(`\nBackups (${backups.length}):`));
        backups.slice(0, 5).forEach((b, i) => {
            const name = path.basename(b).split('.').pop(); // timestamp part
            const label = i === 0 ? chalk.cyan(' (LATEST)') : '';
            console.log(`  ${name}${label}`);
        });
    }
}
