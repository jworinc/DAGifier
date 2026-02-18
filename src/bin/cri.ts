#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { spawn } from 'child_process';
import { CriManager } from '../core/cri';
import { ConfigManager } from '../config';

const program = new Command();

program
    .name('cri')
    .description('Configuration Reliability Engineering (CRI) Tool')
    .version('1.0.0');

program
    .command('apply')
    .description('Apply changes to a config file with validation and backup')
    .argument('<file>', 'Target configuration file')
    .option('--dry-run', 'Preview changes without applying')
    .action(async (file, options) => {
        await runCriAction('apply', file, options);
    });

program
    .command('rollback')
    .description('Rollback a file to a previous version')
    .argument('<file>', 'Target configuration file')
    .argument('[id]', 'Backup ID to restore (optional, defaults to latest)')
    .action(async (file, id, options) => {
        await runCriAction('rollback', file, { ...options, id });
    });

program
    .command('status')
    .description('Show file status and backup history')
    .argument('<file>', 'Target configuration file')
    .action(async (file, options) => {
        await runCriAction('status', file, options);
    });

program
    .command('prune')
    .description('Prune old backups')
    .argument('<file>', 'Target configuration file')
    .option('--keep <n>', 'Number of backups to keep', (v) => parseInt(v), 10)
    .action(async (file, options) => {
        await runCriAction('prune', file, options);
    });

program
    .command('diff')
    .description('Show diff between current file and backup')
    .argument('<file>', 'Target configuration file')
    .argument('[id]', 'Backup ID to compare (optional, defaults to latest)')
    .action(async (file, id, options) => {
        await runCriAction('diff', file, { ...options, id });
    });

async function runCriAction(action: string, file: string, options: any) {
    if (!file) {
        console.error(chalk.red('[!] Config file argument is required'));
        process.exit(1);
    }

    const target = path.resolve(file);
    const cri = new CriManager(target);

    try {
        switch (action) {
            case 'apply':
                // Interactive Edit or Stdin?
                if (process.stdin.isTTY) {
                    console.log(chalk.yellow(`[i] Opening editor for ${path.basename(target)}...`));
                    const config = await ConfigManager.load();
                    const editor = process.env.EDITOR || config.editor || 'vi';

                    // Read current
                    const current = await fs.readFile(target, 'utf-8').catch(() => '');
                    const temp = path.join(os.tmpdir(), `cri_edit_${Date.now()}${path.extname(target)}`);
                    await fs.writeFile(temp, current);

                    const child = spawn(editor, [temp], { stdio: 'inherit' });
                    child.on('exit', async (code) => {
                        if (code === 0) {
                            const newContent = await fs.readFile(temp, 'utf-8');
                            await cri.apply(newContent, options.dryRun);
                        } else {
                            console.log(chalk.red('[!] Editor cancelled'));
                        }
                        fs.unlink(temp).catch(() => { });
                    });
                } else {
                    // Pipe
                    let chunks: any[] = [];
                    process.stdin.on('data', c => chunks.push(c));
                    process.stdin.on('end', async () => {
                        const content = Buffer.concat(chunks).toString('utf-8');
                        await cri.apply(content, options.dryRun);
                    });
                }
                break;
            case 'rollback':
                await cri.rollback(options.id);
                break;
            case 'status':
                await cri.status();
                break;
            case 'prune':
                await cri.prune(options.keep);
                break;
            case 'diff':
                await cri.diff(options.id);
                break;
        }
    } catch (e: any) {
        console.error(chalk.red(`[!] Error: ${e.message}`));
        process.exit(1);
    }
}

program.parse(process.argv);
