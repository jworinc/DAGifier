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

    program
        .option('-j, --json', 'Emit PageDoc + Trace as JSON')
        .option('--ndjson', 'Emit NDJSON (Newline Delimited JSON) for batch processing')
        .option('-e, --explain', 'Print human-readable extraction diagnostics to stderr')
        .option('-x, --extract', 'Emit only cleaned text blocks')
        .option('--no-fallback', 'Disable browser fallback (fastest execution)')
        .option('--metadata-only', 'Extract only metadata (skip content)')
        .option('--silent', 'Suppress all stderr output')
        .option('-w, --wikilinks', 'Use wikilinks [[styling]] for Obsidian/wikis')
        .option('--compact', 'Compact mode: Limit 150 chars, max depth 2 (ideal for threads)');

    // Rendering Options
    program
        .option('-m, --mode <mode>', 'Rendering mode (auto, thread, article)', 'auto')
        .option('--modality <name>', 'Interface modality (text, html, tui)', 'text')
        .option('-f, --full', 'Disable text truncation')
        .option('-l, --limit <n>', 'Set character limit for blocks', (v) => parseInt(v), 300)
        .option('--viewer <cmd>', 'Pipe output to external viewer command')
        .option('--filter <jq_query>', 'Filter JSON output using jq (requires jq installed)')
        .option('--format <fmt>', 'Output format (text, md, html, json)', 'text')
        .option('--section <name>', 'Extract specific section by heading')
        .option('--author <name>', 'Filter content by author')
        .option('--internal-only', 'Links: Internal only')
        .option('--external-only', 'Links: External only')
        .option('--stats', 'Show structural statistics')
        .option('--highlight <term>', 'Highlight search term in output')
        .option('--no-color', 'Disable colors (ASCII only mode implies this usually, but we have strict ascii-only flag)')
        .option('--ascii-only', 'Force ASCII-only output (strip unicode)')
        .option('--sort <method>', 'Sort thread items (newest, oldest)')
        // Resource Limits (Manifesto)
        .option('--max-depth <n>', 'Maximum depth for thread items', (v) => parseInt(v), 10)
        .option('--max-length <n>', 'Maximum content length per block (0 = unlimited)', (v) => parseInt(v), 0)
        .option('--timeout <ms>', 'Processing timeout in milliseconds', (v) => parseInt(v), 30000);


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
            const defaults = { mode: 'thread', maxDepth: 5 };
            // If global compact is set, it overrides defaults
            if (cmd.parent?.opts().compact) {
                defaults.maxDepth = 2;
            }
            await runAction(input, defaults, cmd);
        });

    program
        .command('links')
        .description('Extract and list all links with reference IDs.')
        .argument('<input>', 'URL or file')
        .action(async (input, options, cmd) => {
            await runLinks(input, options, cmd);
        });

    program
        .command('diff')
        .description('Show structural differences between two inputs')
        .argument('<inputA>', 'URL or file A')
        .argument('<inputB>', 'URL or file B')
        .action(async (inputA, inputB, options, cmd) => {
            await runDiff(inputA, inputB, options, cmd);
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
        .command('self-test')
        .description('Validate system health and determinism')
        .action(runSelfTest);

    // (Old diff command removed)

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
        json: options.json,
        noFallback: options.noFallback,
        maxDepth: options.maxDepth,
        maxLength: options.maxLength,
        timeout: options.timeout
    };

    // Timeout Race
    const processPromise = coordinator.process(input, coordinatorOpts);
    const timeoutPromise = new Promise((_, reject) => {
        if (options.timeout && options.timeout > 0) {
            setTimeout(() => reject(new Error(`Operation timed out after ${options.timeout}ms`)), options.timeout);
        }
    });

    // @ts-ignore
    const { doc, trace, payload } = await Promise.race([processPromise, timeoutPromise]);
    const renderer = new Renderer();

    return { doc, trace, renderer, payload };
}

async function processSingleInput(input: string, finalOpts: any, config: any) {
    if (finalOpts.verbose) {
        console.error(`[Debug] processSingleInput options: ndjson=${finalOpts.ndjson}, silent=${finalOpts.silent}, metadataOnly=${finalOpts.metadataOnly}`);
    }
    const { doc, trace, renderer } = await handleInput(input, finalOpts);
    await outputResult(doc, trace, finalOpts, config, renderer);
}

async function runAction(input: string, options: any, cmd: Command) {
    const globalOpts = cmd.parent ? cmd.parent.opts() : {};
    // Explicitly merge local options (from the command) and global options
    let finalOpts = { ...globalOpts, ...options, ...cmd.opts() };

    // Handle --compact shortcut
    if (finalOpts.compact) {
        finalOpts.limit = 150;
        finalOpts.full = false;
        if (!finalOpts.maxDepth) finalOpts.maxDepth = 2;
    }

    if (finalOpts.verbose || finalOpts.explain) {
        // console.error('Debug: Options keys:', Object.keys(finalOpts));
    }

    const config = await ConfigManager.load();

    try {
        // Handle Stdin Batch Mode with Streaming Detection
        if (input === '-') {
            // We need to peek at the first chunk to decide if this is a batch list or a single file
            const stdin = process.stdin;
            const firstChunk = await new Promise<Buffer | null>((resolve) => {
                const onReadable = () => {
                    const chunk = stdin.read();
                    if (chunk) {
                        stdin.removeListener('readable', onReadable);
                        resolve(chunk);
                    }
                };
                if (stdin.readableLength > 0) {
                    resolve(stdin.read());
                } else {
                    stdin.on('readable', onReadable);
                    stdin.on('end', () => resolve(null));
                }
            });

            if (!firstChunk) return; // Empty stdin

            const firstStr = firstChunk.toString('utf-8');
            const trimmedStart = firstStr.trimStart();

            // Heuristic: If it starts with <, it's likely HTML/XML -> Single File (Buffer it)
            // If it starts with http or /, it's likely a list -> Streaming Batch
            const isLikelyHtml = trimmedStart.startsWith('<') || trimmedStart.startsWith('<!');

            if (isLikelyHtml) {
                // Buffer the rest for standard single-file processing
                const ingestor = new Ingestor();
                // We need to feed the first chunk back + the rest
                const rest = await ingestor.fromStdin(); // This waits for end
                const fullBuffer = Buffer.concat([firstChunk, rest.rawContent]);

                await engine.loadPacks();
                const coordinator = new Coordinator(engine, browserAdapter);
                const coordinatorOpts = {
                    verbose: finalOpts.verbose,
                    rendered: finalOpts.rendered,
                    mode: finalOpts.mode as 'auto' | 'thread' | 'article',
                    json: finalOpts.json,
                    noFallback: finalOpts.noFallback,
                    maxDepth: finalOpts.maxDepth,
                    maxLength: finalOpts.maxLength,
                    timeout: finalOpts.timeout
                };

                const result = await coordinator.processPayload({
                    source: 'stdin', identifier: '-', rawContent: fullBuffer, mimeType: 'text/html' // Assume HTML if fallback
                }, coordinatorOpts);

                const { doc, trace } = result;
                const renderer = new Renderer();

                await outputResult(doc, trace, finalOpts, config, renderer);
                return;
            } else {
                // STREAMING BATCH MODE
                if (finalOpts.verbose && !finalOpts.silent) console.error(chalk.cyan(`[i] Streaming batch mode detected`));

                const readline = require('readline');

                // Simpler: Process first chunk lines, then stream rest of stdin
                const linesFromFirst = firstStr.split(/\r?\n/);
                let lastPartial = linesFromFirst.pop() || ''; // The last line might be incomplete

                const batchOpts = { ...finalOpts };

                // Process complete lines from first chunk
                for (const line of linesFromFirst) {
                    if (line.trim()) await processSingleInput(line.trim(), batchOpts, config);
                }

                // Stream the rest
                const rl = readline.createInterface({
                    input: stdin,
                    crlfDelay: Infinity,
                    terminal: false
                });

                let isFirstRlLine = true;
                for await (const line of rl) {
                    let fullLine = line;
                    if (isFirstRlLine) {
                        fullLine = lastPartial + line;
                        isFirstRlLine = false;
                    }
                    if (fullLine.trim()) await processSingleInput(fullLine.trim(), batchOpts, config);
                }
                return;
            }
        }

        // Standard single input (URL/File arg)
        await processSingleInput(input, finalOpts, config);

    } catch (e: any) {
        console.error(chalk.red(`[!] Error: ${e.message}`));
        if (finalOpts.verbose) console.error(e.stack);
        process.exit(1);
    }
}

// Helper to consolidate output logic
async function outputResult(doc: PageDoc, trace: any, finalOpts: any, config: any, renderer: Renderer) {
    if (finalOpts.ndjson) {
        if (finalOpts.metadataOnly) {
            console.log(JSON.stringify({ doc: { title: doc.title, meta: doc.meta, url: doc.url }, trace }));
        } else {
            console.log(JSON.stringify({ doc, trace }));
        }
        return;
    }

    if (finalOpts.explain) {
        console.error(chalk.bold('\n--- Extraction Trace ---'));
        trace.steps.forEach((step: any) => {
            const color = step.decision.includes('Success') ? chalk.green : chalk.yellow;
            console.error(`${chalk.cyan(step.name)}: ${color(step.decision)} - ${chalk.dim(step.reason)}`);
            if (step.data) console.error(chalk.dim(JSON.stringify(step.data)));
        });
        console.error('');
        console.error(`Duration: ${trace.durationMs}ms`);
    }

    const shouldStop = await processDocFilters(doc, finalOpts);
    if (shouldStop) return;

    if (finalOpts.json || finalOpts.filter) {
        pipeJsonInternal({ doc, trace }, config, finalOpts.viewer, finalOpts.filter);
        return;
    }

    if (finalOpts.metadataOnly) {
        if (!finalOpts.silent) {
            console.log(chalk.bold(doc.title));
            console.log(chalk.dim(`Source: ${doc.url}`));
            console.log(chalk.dim(`Author: ${doc.meta.author || 'N/A'}`));
            console.log(chalk.dim(`Published: ${doc.meta.published || 'N/A'}`));
        }
        return;
    }

    const modality = finalOpts.modality || 'cli';
    if (modality === 'tui') {
        await startTui(doc, new Renderer(), finalOpts);
        return;
    }

    const renderOpts = {
        ...finalOpts,
        format: finalOpts.format,
        asciiOnly: finalOpts.asciiOnly,
        highlight: finalOpts.highlight
    };

    pipeOutput(new Renderer().render(doc, renderOpts), config, false, finalOpts.viewer);
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

// (Old runDiff removed)

// (Old runDiff removed)


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

// --- New Command Actions ---

async function runLinks(input: string, options: any, cmd: Command) {
    const globalOpts = cmd.parent ? cmd.parent.opts() : {};
    const finalOpts = { ...globalOpts, ...options };
    const { doc } = await handleInput(input, finalOpts);

    let output = `${chalk.bold(`Links for ${doc.title}`)}\n`;
    output += '='.repeat(40) + '\n';

    doc.links.forEach((link: any) => {
        output += `[${chalk.yellow(link.id)}] ${chalk.cyan(link.text)} -> ${chalk.blue(link.url)}\n`;
    });

    pipeOutput(output, {}, false, finalOpts.viewer);
}

async function runDiff(inputA: string, inputB: string, options: any, cmd: Command) {
    const globalOpts = cmd.parent ? cmd.parent.opts() : {};
    const finalOpts = { ...globalOpts, ...options };

    const [resA, resB] = await Promise.all([
        handleInput(inputA, finalOpts),
        handleInput(inputB, finalOpts)
    ]);

    const renderer = new Renderer();
    const textA = renderer.render(resA.doc, { ...finalOpts, modality: 'text' });
    const textB = renderer.render(resB.doc, { ...finalOpts, modality: 'text' });

    const diff = diffLines(textA, textB);

    diff.forEach(part => {
        const color = part.added ? chalk.green :
            part.removed ? chalk.red : chalk.grey;
        if (part.added || part.removed) {
            process.stdout.write(color(part.value));
        }
    });
}

// --- Main Entry ---
if (require.main === module) {
    const program = createProgram();
    program.parse(process.argv);
}

export { createProgram }; // Export for testing

// Shared Filtering Logic
async function processDocFilters(doc: PageDoc, finalOpts: any): Promise<boolean> {
    // 1. Stats Mode
    if (finalOpts.stats) {
        const stats = {
            title: doc.title,
            blocks: doc.content.length,
            links: doc.links.length,
            depthMax: Math.max(...doc.content.map(b => (b.type === 'thread-item' ? b.depth : 0))),
            authors: new Set(doc.content.map(b => (b.type === 'thread-item' ? b.author : undefined)).filter(Boolean)).size,
            duration: doc.metadata.durationMs,
            signature: doc.structural_signature,
            confidence: doc.meta.confidence
        };
        if (finalOpts.json) {
            console.log(JSON.stringify(stats, null, 2));
        } else {
            console.log(chalk.bold('--- Document Statistics ---'));
            console.log(`Title: ${stats.title}`);
            console.log(`Blocks: ${stats.blocks}`);
            console.log(`Links: ${stats.links}`);
            console.log(`Max Depth: ${stats.depthMax}`);
            console.log(`Authors: ${stats.authors}`);
            console.log(`Extraction Time: ${stats.duration}ms`);
            console.log(`Confidence: ${Math.floor(stats.confidence * 100)}%`);
            console.log(`Structural Signature: ${stats.signature}`);
            console.log('---------------------------');
        }
        return true; // Stop processing/rendering
    }

    // 2. Section Filtering
    if (finalOpts.section) {
        const sectionName = finalOpts.section.toLowerCase();
        const newContent: ContentBlock[] = [];
        let capturing = false;
        let captureLevel = 0;

        for (const block of doc.content) {
            if (block.type === 'heading') {
                if (block.text.toLowerCase().includes(sectionName)) {
                    capturing = true;
                    captureLevel = block.level; // Heading still has level
                    newContent.push(block);
                    continue;
                }
                if (capturing && block.level <= captureLevel) {
                    capturing = false;
                }
            }
            if (capturing) {
                newContent.push(block);
            }
        }
        doc.content = newContent;
    }

    // 3. Content/Author Filtering
    if (finalOpts.author) {
        const authorName = finalOpts.author.toLowerCase();

        // Deep filter for threads
        const filterThreads = (blocks: ContentBlock[]): ContentBlock[] => {
            return blocks.filter((b): boolean => {
                if (b.type !== 'thread-item') return true;

                const authorVal = b.author || 'anonymous';
                const match = authorVal.toLowerCase().includes(authorName);
                if (b.children) {
                    b.children = filterThreads(b.children);
                }
                // Keep if match OR children has match
                return !!match || (!!b.children && b.children.length > 0);
            });
        };
        doc.content = filterThreads(doc.content);
    }

    // 4. Link Filtering
    if (finalOpts.internalOnly || finalOpts.externalOnly) {
        const urlObj = doc.url ? new URL(doc.url) : null;
        const host = urlObj ? urlObj.hostname : '';

        doc.links = doc.links.filter(l => {
            try {
                const linkHost = new URL(l.url).hostname;
                const isInternal = linkHost === host || linkHost.endsWith('.' + host);
                if (finalOpts.internalOnly) return isInternal;
                if (finalOpts.externalOnly) return !isInternal;
            } catch {
                return finalOpts.internalOnly; // Treat relative/invalid as internal
            }
            return true;
        });
    }

    // 5. Sorting
    if (finalOpts.sort === 'newest') {
        doc.content = doc.content.reverse();
    }

    return false; // Continue processing
}

async function runSelfTest() {
    console.log(chalk.bold.blue("Dagifier Self-Test"));
    console.log("=".repeat(40));

    try {
        // 1. Validator: Pattern Engine
        console.log(chalk.cyan("1. Pattern Engine..."));
        await engine.loadPacks();
        console.log(chalk.green("   [OK] Packs loaded."));

        // 2. Validator: Schema Consistency
        console.log(chalk.cyan("2. Schema Determinism..."));
        const fixturePath = path.join(__dirname, '../tests/fixtures/core8/batch_thread.html');
        const content = await fs.readFile(fixturePath);
        const coordinator = new Coordinator(engine, browserAdapter);
        const { doc: doc1 } = await coordinator.processPayload({
            source: 'file',
            identifier: fixturePath,
            rawContent: content,
            mimeType: 'text/html'
        }, { mode: 'thread' });

        const { doc: doc2 } = await coordinator.processPayload({
            source: 'file',
            identifier: fixturePath,
            rawContent: content,
            mimeType: 'text/html'
        }, { mode: 'thread' });

        if (doc1.structural_signature === doc2.structural_signature) {
            console.log(chalk.green("   [OK] Deterministic output."));
        } else {
            throw new Error("Divergent output in consecutive runs!");
        }

        // 3. Validator: Metadata
        if (doc1.version && doc1.meta.confidence !== undefined) {
            console.log(chalk.green("   [OK] Schema compliance verified."));
        } else {
            throw new Error("Missing critical schema fields (version/confidence).");
        }

        console.log("=".repeat(40));
        console.log(chalk.bold.green("Result: SUCCESS"));
    } catch (e: any) {
        console.log("=".repeat(40));
        console.log(chalk.bold.red("Result: FAILED"));
        console.error(chalk.red(`Reason: ${e.message}`));
        process.exit(1);
    }
}
