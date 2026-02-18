#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import { ThreadManager } from '../core/threads';
import { BrowserTui } from '../core/browser-tui';
import { SearchManager } from '../core/search';
import { ConfigManager } from '../config';

const program = new Command();

program
    .name('nav')
    .description('Knowledge Navigator & Thread Browser')
    .version('1.0.0');

// Shared Options
program.option('-C, --cwd <dir>', 'Working directory'); // No default, so we can detect if provided

program
    .command('list')
    .description('List and filter threads')
    .option('-d, --date <date>', 'Filter by date')
    .option('-p, --project <id>', 'Filter by project')
    .option('-a, --agent <name>', 'Filter by agent')
    .option('-q, --query <text>', 'Filter by text search')
    .option('-C, --cwd <dir>', 'Working directory')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
        await runNavList(options);
    });

program
    .command('view')
    .description('Interactive TUI for browsing/viewing')
    .argument('[id]', 'Thread ID to view')
    .option('-C, --cwd <dir>', 'Working directory')
    .action(async (id, options) => {
        await runNavView(id, options);
    });

program
    .command('search')
    .description('Semantic Search Shim')
    .argument('<query>', 'Search query')
    .argument('[folder]', 'Target folder', '.')
    .option('--scope <scope>', 'Filter by scope (kn/code/etc)')
    .option('--backend <tool>', 'Force backend: qmd, ug, rg')
    .option('--limit <n>', 'Limit results', (v) => parseInt(v), 20)
    .option('-C, --cwd <dir>', 'Working directory')
    .option('--json', 'Output as JSON')
    .action(async (query, folder, options) => {
        await runNavSearch(query, folder, options);
    });

// Logic
async function getManager() {
    const config = await ConfigManager.load();
    const opts = program.opts();
    // Options passed to subcommand (last arg in action) override global
    // But here we might not have access to subcommand opts unless passed in.
    // We will rely on getManager taking opts as arg.
    const dir = opts.cwd || config.workspace_dir || process.cwd();
    return new ThreadManager(path.resolve(dir));
}

// Helper to resolve dir from specific options
async function getManagerF(options: any) {
    const config = await ConfigManager.load();
    const dir = options.cwd || program.opts().cwd || config.workspace_dir || process.cwd();
    // process.chdir(dir); // Optional: change process cwd? safer to just pass dir
    return new ThreadManager(path.resolve(dir));
}

async function runNavList(options: any) {
    const manager = await getManagerF(options);
    const items = await manager.listThreads({
        date: options.date,
        project: options.project,
        agent: options.agent,
        search: options.query
    });

    if (options.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
    }

    if (items.length === 0) {
        console.log(chalk.yellow('No threads found.'));
        return;
    }

    items.forEach(item => {
        const icon = item.type === 'task' ? '☑' : '📝';
        console.log(`${chalk.blue(item.id)} ${chalk.dim(item.date)} ${icon} ${item.title}`);
    });
}

async function runNavView(id: string, options: any) {
    const manager = await getManagerF(options);

    if (id) {
        // Direct view (todo: implement direct open)
        console.log(chalk.yellow('Direct view specific ID not fully implemented, opening menu...'));
    }

    const items = await manager.listThreads({}); // List all
    const selected = await BrowserTui.select(items);

    if (selected) {
        console.log(chalk.green(`[+] Opening ${selected.title}`));
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        require('child_process').exec(`${opener} "${selected.path}"`);
    }
}

async function runNavSearch(query: string, folder: string, options: any) {
    // Resolve CWD
    const config = await ConfigManager.load();
    const dir = options.cwd || program.opts().cwd || config.workspace_dir || process.cwd();

    // Using dir as base for search if folder is relative? 
    // SearchManager takes rootDir.
    // If folder is '.', it means rootDir.

    const searcher = new SearchManager(path.resolve(dir));
    // Normalize folder relative to resolved dir
    const targetFolder = folder === '.' ? '.' : folder;

    const results = await searcher.search(query, targetFolder, {
        scope: options.scope,
        backend: options.backend,
        limit: options.limit
    });

    if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }

    if (results.length === 0) {
        console.log(chalk.yellow('No results found.'));
        return;
    }

    console.log(chalk.bold(`Found ${results.length} results:`));
    results.forEach(r => {
        console.log(`${chalk.dim(r.scope)} ${chalk.cyan(path.relative(process.cwd(), r.path))} ${chalk.dim(`(${r.backend})`)}`);
    });
}

program.parse(process.argv);
