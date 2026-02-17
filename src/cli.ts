#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { Ingestor } from './core/ingestor';
import { ExtractionPipeline } from './core/pipeline';
import { Renderer } from './core/renderer';
import { PatternEngine } from './core/patterns';
import { BrowserAdapter } from './core/browser';
import { PageDoc, ContentBlock } from './types';
import { Coordinator } from './core/coordinator';
import * as linkedom from 'linkedom';
import { diffLines } from 'diff';
import { ConfigManager } from './config';
import { DoctorService } from './doctor';
import { materializeJsonForLstr, prepareDocForLstr } from './lstr';
import os from 'os';

// --- Configuration & Factories ---
const engine = new PatternEngine(path.join(__dirname, '../patterns'));
const browserAdapter = new BrowserAdapter(); // Shared instance

function createProgram() {
    const program = new Command();

    program
        .name('dagifier')
        .description('CLI-first low-bandwidth ASCII page viewer')
        .version('1.0.0');

    // Global Options
    program
        .option('-v, --verbose', 'Verbose output (to stderr)')
        .option('-p, --pack <domain>', 'Manually specify a domain pattern pack')
        .option('-r, --rendered', 'Force rendering via headless browser (Playwright)')
        .option('-o, --outline', 'Outline mode: only render headings');

    // Output Options
    program
        .option('-j, --json', 'Emit PageDoc + Trace as JSON')
        .option('-e, --explain', 'Print human-readable extraction diagnostics to stderr')
        .option('-x, --extract', 'Emit only cleaned text blocks')
        .option('-w, --wikilinks', 'Use wikilinks [[styling]] for Obsidian/wikis');

    // Rendering Options
    program
        .option('-m, --mode <mode>', 'Rendering mode (auto, thread, article)', 'auto')
        .option('--modality <name>', 'Interface modality (text, html, tui)', 'text')
        .option('-f, --full', 'Disable text truncation')
        .option('-l, --limit <n>', 'Set character limit for blocks', (v) => parseInt(v), 300)
        .option('--viewer <cmd>', 'Pipe output to external viewer command')
        .option('--filter <jq_query>', 'Filter JSON output using jq (requires jq installed)');


    // Commands
    program
        .command('edit')
        .description('Fetch and edit content in $EDITOR')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runEdit(input, options, cmd);
        });

    program
        .command('read')
        .description('Default mode: Auto-detect structure, full detail.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runAction(input, { mode: 'auto', full: true }, cmd);
        });

    program
        .command('skim')
        .description('Compact mode: Truncated text, default depth limit.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runAction(input, { mode: 'auto', full: false, limit: 150 }, cmd);
        });

    program
        .command('view')
        .description('Alias for interactive TUI mode.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runAction(input, { ...options, modality: 'tui' }, cmd);
        });

    program
        .command('tree')
        .description('Visualize content as a filesystem tree (requires lstr)')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runTree(input, options, cmd);
        });

    program
        .command('outline')
        .description('Structure only: Headings and metadata.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runAction(input, { mode: 'article', outline: true }, cmd);
        });

    program
        .command('thread')
        .description('Force thread view with depth limit.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runAction(input, { mode: 'thread', maxDepth: 5 }, cmd);
        });

    program
        .command('links')
        .description('Extract and list all links with reference IDs.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            const globalOpts = cmd.parent ? cmd.parent.opts() : {};
            const finalOpts = { ...globalOpts, ...options };
            const { doc } = await handleInput(input, finalOpts);
            let output = `${chalk.bold(`Links for ${doc.title}`)}\n`;
            output += '=\'.repeat(40)\n';
            doc.links.forEach(link => {
                output += `[${chalk.yellow(link.id)}] ${chalk.cyan(link.text)} -> ${chalk.blue(link.url)}\n`;
            });
            pipeOutput(output, {});
        });

    program
        .command('explain')
        .description('Show extraction trace and signals.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runAction(input, { explain: true }, cmd);
        });

    program
        .command('record')
        .description('Record HTML and ASCII golden for a URL')
        .argument('<url>', 'URL to record')
        .argument('<name>', 'Name for the snapshot (e.g. reddit/case1)')
        .action(runRecord);

    program
        .command('query')
        .description('Test a CSS selector against a URL (Authoring Workflow)')
        .argument('<url>', 'URL to fetch')
        .argument('<selector>', 'CSS selector to test')
        .action(runQuery);

    program
        .command('diff')
        .description('Compare current live output against a saved golden')
        .argument('<url>', 'URL to fetch')
        .argument('<name>', 'Name of the snapshot to compare against')
        .action(runDiff);

    program
        .command('doctor')
        .description('Check and fix external tool dependencies')
        .option('--fix', 'Attempt to install missing tools (brew/npm)')
        .option('--json', 'Output check results as JSON')
        .action(async (options, cmd) => {
            const checks = DoctorService.checkAll();
            if (options.json) {
                console.log(JSON.stringify(checks, null, 2));
                return;
            }

            console.log(chalk.bold('\nDagifier Dependency Check'));
            console.log('='.repeat(50));
            checks.forEach(c => {
                const status = c.installed ? chalk.green('INSTALLED') : chalk.red('MISSING');
                const name = chalk.cyan(c.tool.padEnd(10));
                console.log(`${name} [${status}] ${c.description}`);
                if (!c.installed) {
                    console.log(chalk.dim(`  -> Install: ${c.installCmd}`));
                }
            });
            console.log('='.repeat(50) + '\n');

            if (options.fix) {
                await DoctorService.installMissing(checks);
            } else {
                const missing = checks.filter(c => !c.installed).length;
                if (missing > 0) {
                    console.log(chalk.yellow(`[!] ${missing} recommended tools are missing.`));
                    console.log(`Run ${chalk.bold('dagifier doctor --fix')} to attempt auto-installation.\n`);
                } else {
                    console.log(chalk.green('[+] All systems go!\n'));
                }
            }
        });

    // Default fallback
    program
        .argument('[input]', 'URL, file path, or "-" for stdin')
        .action(async (input, options, cmd) => {
            if (input) {
                await runAction(input, { mode: 'auto', full: true }, cmd);
            } else {
                program.help();
            }
        });

    return program;
}

// --- Logic & Helpers ---

// JSON Syntax Highlighter
function colorizeJson(obj: any): string {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
        let cls = chalk.yellow; // number
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = chalk.cyan; // key
            } else {
                cls = chalk.green; // string
            }
        } else if (/true|false/.test(match)) {
            cls = chalk.blue; // boolean
        } else if (/null/.test(match)) {
            cls = chalk.magenta; // null
        }
        return cls(match);
    });
}

// Pager / Output Handler
function pipeOutput(content: string, config: any, forceJson: boolean = false, customViewer?: string) {
    const viewerCmd = customViewer || (forceJson ? config.json_viewer : config.markdown_viewer);

    if (viewerCmd) {
        const parts = viewerCmd.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        const viewer = spawn(cmd, args, {
            stdio: ['pipe', process.stdout, process.stderr]
        });
        viewer.stdin.write(content);
        viewer.stdin.end();
        return;
    }

    if (process.stdout.isTTY) {
        const lines = content.split('\n').length;
        if (lines > process.stdout.rows) {
            // Spawn pager
            const pager = spawn('less', ['-R'], {
                stdio: ['pipe', process.stdout, process.stderr]
            });
            pager.stdin.write(content);
            pager.stdin.end();
            return;
        }
    }
    console.log(content);
}

// Overload for JSON
function pipeJsonInternal(data: any, config: any, customViewer?: string, jqFilter?: string) {
    if (jqFilter) {
        // Try to spawn jq
        const jq = spawn('jq', [jqFilter], {
            stdio: ['pipe', process.stdout, process.stderr]
        });
        jq.stdin.write(JSON.stringify(data));
        jq.stdin.end();
        return;
    }

    // If config has a specific JSON viewer (like jless), use it even if TTY
    if (config.json_viewer || customViewer) {
        pipeOutput(JSON.stringify(data, null, 2), config, true, customViewer);
        return;
    }

    if (process.stdout.isTTY) {
        const colored = colorizeJson(data);
        pipeOutput(colored, config, true);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}


async function handleInput(input: string, options: any) {
    await engine.loadPacks();
    const coordinator = new Coordinator(engine, browserAdapter);

    const coordinatorOpts = {
        verbose: options.verbose,
        rendered: options.rendered,
        mode: options.mode as 'auto' | 'thread' | 'article',
        json: options.json
    };

    const { doc, trace, payload } = await coordinator.process(input, coordinatorOpts);
    const renderer = new Renderer();

    return { doc, trace, renderer, payload };
}

async function runAction(input: string, options: any, cmd: Command) {
    // Retrieve global options from the parent program
    const globalOpts = cmd.parent ? cmd.parent.opts() : {};
    const finalOpts = { ...globalOpts, ...options };
    const config = await ConfigManager.load();

    try {
        const { doc, trace, renderer, payload } = await handleInput(input, finalOpts);

        const modality = finalOpts.modality || 'cli';

        if (modality === 'tui') {
            await startTui(doc, renderer, finalOpts);
            return;
        }

        if (finalOpts.explain) {
            console.error(chalk.blue(`\n--- Trace for ${input} ---`));
            trace.steps.forEach((s: any) => {
                console.error(`${chalk.gray(new Date(s.timestamp).toLocaleTimeString())} [${chalk.yellow(s.name)}] ${s.decision}: ${s.reason}`);
            });
            console.error(chalk.cyan('\n--- SIGNALS ---'));
            console.error(`${chalk.dim('[Root Selector]')} ${trace.signals.rootSelector}`);
            console.error(`${chalk.dim('[Item Selector]')} ${trace.signals.itemSelector}`);
            console.error(`${chalk.dim('[Block Count] ')} ${trace.signals.blockCount}`);
            console.error(chalk.yellow('------------------------\n'));
        }

        if (doc.meta.jsonLd) {
            console.error(chalk.green(`[i] Metadata extracted via JSON-LD`));
        }

        if (finalOpts.json || finalOpts.filter) {
            pipeJsonInternal({ doc, trace }, config, finalOpts.viewer, finalOpts.filter);
        } else {
            pipeOutput(renderer.render(doc, finalOpts), config, false, finalOpts.viewer);
        }

    } catch (e: any) {
        console.error(chalk.red(`[!] Error: ${e.message}`));
        if (finalOpts.verbose) console.error(e.stack);
        process.exit(1);
    }
}

// TUI Implementation (Moved logic here)
async function startTui(doc: PageDoc, renderer: Renderer, options: any) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const config = await ConfigManager.load();

    const showMenu = () => {
        process.stdout.write(chalk.cyan('\n--- TUI OPERATING OPTIONS ---\n'));
        process.stdout.write(`${chalk.yellow('v')} : View contents\n`);
        process.stdout.write(`${chalk.yellow('h')} : HTML preview\n`);
        process.stdout.write(`${chalk.yellow('o')} : Open URL\n`);
        process.stdout.write(`${chalk.yellow('q')} : Quit\n`);
        process.stdout.write(chalk.blue('\n> Option: '));
    };

    console.log(chalk.bold.green(`\nDAGifier TUI: ${doc.title}`));
    showMenu();

    for await (const line of rl) {
        const cmd = line.trim().toLowerCase();
        if (cmd === 'q') break;

        if (cmd === 'v') {
            // TUI view always uses paging if needed
            const content = renderer.render(doc, { ...options, modality: 'text' });
            // TUI shouldn't use external viewers by default for 'v' command? 
            // Or maybe it should? 'v' is "view contents". 
            // Let's stick to simple paging for TUI to keep it self-contained, 
            // or pass empty config to force internal pager.
            pipeOutput(content, {}, false);
        } else if (cmd === 'h') {
            const html = renderer.render(doc, { ...options, modality: 'web' });
            const tempPath = path.join(process.cwd(), 'preview.html');
            await fs.writeFile(tempPath, html);
            process.stdout.write(chalk.green(`[+] Saved to ${tempPath}\n`));
            const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
            require('child_process').exec(`${opener} "${tempPath}"`);
        } else if (cmd === 'o') {
            if (doc.url) {
                const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
                require('child_process').exec(`${opener} "${doc.url}"`);
            } else process.stdout.write(chalk.red('[!] No URL.\n'));
        } else {
            process.stdout.write(chalk.red(`[!] Unknown: ${cmd}\n`));
        }
        showMenu();
    }
    rl.close();
}

// Tooling implementations (Record, Query, Diff)
async function runRecord(url: string, name: string, options: any, cmd: Command) {
    try {
        const globalOpts = cmd.parent ? cmd.parent.opts() : {};
        const finalOpts = { ...globalOpts, ...options };
        const { doc, renderer, payload } = await handleInput(url, finalOpts);
        const output = renderer.render(doc, { full: true });
        const fixturePath = path.join(process.cwd(), 'tests/fixtures', `${name}.html`);
        const goldenPath = path.join(process.cwd(), 'tests/goldens', `${name}.txt`);

        await fs.mkdir(path.dirname(fixturePath), { recursive: true });
        await fs.mkdir(path.dirname(goldenPath), { recursive: true });
        await fs.writeFile(fixturePath, payload.rawContent);
        await fs.writeFile(goldenPath, output);

        console.error(chalk.green(`[+] Recorded fixture & golden for ${name}`));
        process.exit(0);
    } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
    }
}

async function runQuery(url: string, selector: string, options: any, cmd: Command) {
    try {
        const globalOpts = cmd.parent ? cmd.parent.opts() : {};
        const finalOpts = { ...globalOpts, ...options };

        const ingestor = new Ingestor();
        const payload = await ingestor.ingest(url);
        let html = payload.rawContent.toString('utf-8');
        if (finalOpts.rendered) html = await browserAdapter.render(url);

        const { document } = linkedom.parseHTML(html);
        const matches = document.querySelectorAll(selector);

        console.error(chalk.cyan(`[i] Found ${matches.length} matches`));
        Array.from(matches).slice(0, 10).forEach((el: any, i) => {
            console.log(chalk.yellow(`--- Match ${i + 1} ---`));
            console.log(el.textContent?.trim());
        });
        process.exit(0);
    } catch (e: any) {
        console.error(chalk.red(e.message));
        await browserAdapter.close();
        process.exit(1);
    }
}

async function runDiff(url: string, name: string, options: any, cmd: Command) {
    try {
        const globalOpts = cmd.parent ? cmd.parent.opts() : {};
        const finalOpts = { ...globalOpts, ...options };
        const config = await ConfigManager.load();

        const { doc, renderer } = await handleInput(url, finalOpts);
        const currentOutput = renderer.render(doc, { full: true });

        const goldenPath = path.join(process.cwd(), 'tests/goldens', `${name}.txt`);
        const goldenOutput = await fs.readFile(goldenPath, 'utf-8');

        // Check if external differ is configured
        if (config.differ) {
            const tempCurrent = path.join(os.tmpdir(), `dagifier_current_${Date.now()}.txt`);
            const tempGolden = path.join(os.tmpdir(), `dagifier_golden_${Date.now()}.txt`);

            await fs.writeFile(tempCurrent, currentOutput);
            await fs.writeFile(tempGolden, goldenOutput);

            const differCmd = config.differ.split(' ');
            const bin = differCmd[0];
            const args = [...differCmd.slice(1), tempGolden, tempCurrent];

            const child = spawn(bin, args, { stdio: 'inherit' });
            child.on('exit', (code) => {
                // Clean up ? 
                process.exit(code || 0);
            });
            return;
        }

        const diff = diffLines(goldenOutput, currentOutput);
        let changed = false;
        diff.forEach(part => {
            if (part.added || part.removed) {
                changed = true;
                const color = part.added ? chalk.green : chalk.red;
                process.stdout.write(color(part.value));
            }
        });
        if (!changed) console.error(chalk.green('[✓] Verified.'));
        else console.error(chalk.yellow('[!] Changes detected.'));
        process.exit(0);
    } catch (e: any) {
        console.error(chalk.red(e.message));
        process.exit(1);
    }
}


async function runEdit(input: string, options: any, cmd: Command) {
    try {
        const globalOpts = cmd.parent ? cmd.parent.opts() : {};
        const finalOpts = { ...globalOpts, ...options };
        const config = await ConfigManager.load();

        const { doc, renderer } = await handleInput(input, finalOpts);
        const content = renderer.render(doc, { ...finalOpts, modality: 'text', full: true });

        const tempFile = path.join(os.tmpdir(), `dagifier_edit_${Date.now()}.md`);
        await fs.writeFile(tempFile, content);

        const editor = process.env.EDITOR || config.editor || 'vi';

        // Spawn editor
        const child = spawn(editor, [tempFile], {
            stdio: 'inherit'
        });

        child.on('exit', async (code) => {
            if (code === 0) {
                // Future: Prompt to save/ingest?
                console.log(chalk.gray(`[i] Edited content saved to ${tempFile}`));
            } else {
                console.error(chalk.red(`[!] Editor exited with code ${code}`));
            }
            await browserAdapter.close();
            process.exit(code || 0);
        });
    } catch (e: any) {
        console.error(chalk.red(`[!] Error: ${e.message}`));
        process.exit(1);
    }
}

async function runTree(input: string, options: any, cmd: Command) {
    try {
        const globalOpts = cmd.parent ? cmd.parent.opts() : {};
        const finalOpts = { ...globalOpts, ...options };

        // 1. Check for lstr
        try {
            execSync('command -v lstr', { stdio: 'ignore' });
        } catch (e) {
            console.error(chalk.red('[!] lstr not found. Install it with: brew install lstr'));
            console.error(chalk.yellow('Or run: dagifier doctor --fix'));
            process.exit(1);
        }

        // 2. Fetch data
        const { doc, payload } = await handleInput(input, finalOpts);

        // 3. Materialize
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dagifier-lstr-'));
        const root = path.join(tempDir, 'json');
        await fs.mkdir(root);

        const treeDoc = prepareDocForLstr(doc);
        materializeJsonForLstr(root, treeDoc);

        console.log(chalk.green(`[+] Tree materialized at ${root}`));

        // 4. Spawn lstr
        const child = spawn('lstr', ['interactive', root], { stdio: 'inherit' });
        child.on('exit', (code) => {
            // Cleanup? jsoned usually keeps it or cleans up on exit. 
            // We can leave it for debug or clean it up.
            // fs.rm(tempDir, { recursive: true, force: true });
            process.exit(code || 0);
        });

    } catch (e: any) {
        console.error(chalk.red(`[!] Error: ${e.message}`));
        process.exit(1);
    }
}

// --- Main Entry ---
if (require.main === module) {
    const program = createProgram();
    program.parse(process.argv);
}

export { createProgram }; // Export for testing
