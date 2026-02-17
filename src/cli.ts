#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { Ingestor } from './core/ingestor';
import { ExtractionPipeline } from './core/pipeline';
import { Renderer } from './core/renderer';
import { PatternEngine } from './core/patterns';

const program = new Command();
const patternsDir = path.join(__dirname, '../patterns');
const engine = new PatternEngine(patternsDir);

program
    .name('dagifier')
    .description('CLI-first low-bandwidth ASCII page viewer')
    .version('1.0.0')
    .option('--extract', 'Emit only cleaned text blocks')
    .option('--verbose', 'Verbose output')
    .option('--pack <domain>', 'Manually specify a domain pattern pack');

program
    .command('record')
    .description('Record HTML and ASCII golden for a URL')
    .argument('<url>', 'URL to record')
    .argument('<name>', 'Name for the snapshot (e.g. reddit/case1)')
    .action(async (url, name) => {
        try {
            await engine.loadPacks();
            const ingestor = new Ingestor();
            const pipeline = new ExtractionPipeline();
            const renderer = new Renderer();

            console.error(chalk.blue(`[*] Recording: ${url} -> ${name}`));
            const payload = await ingestor.fromUrl(url);

            const pack = engine.getPackForUrl(url);
            const { doc, trace } = await pipeline.process(payload, pack);
            const output = renderer.render(doc);

            const fixturePath = path.join(process.cwd(), 'fixtures', `${name}.html`);
            const goldenPath = path.join(process.cwd(), 'goldens', `${name}.txt`);

            await fs.mkdir(path.dirname(fixturePath), { recursive: true });
            await fs.mkdir(path.dirname(goldenPath), { recursive: true });

            await fs.writeFile(fixturePath, payload.rawContent);
            await fs.writeFile(goldenPath, output);

            console.error(chalk.green(`[+] Saved fixture: ${fixturePath}`));
            console.error(chalk.green(`[+] Saved golden: ${goldenPath}`));
        } catch (error: any) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program
    .argument('[input]', 'URL, file path, or "-" for stdin')
    .option('--mode <mode>', 'Rendering mode (auto, thread, article)', 'auto')
    .option('--json', 'Emit PageDoc + Trace as JSON')
    .option('--explain', 'Print human-readable extraction diagnostics')
    .action(async (input, options) => {
        if (!input) {
            program.help();
            return;
        }
        try {
            await engine.loadPacks();
            const ingestor = new Ingestor();
            const pipeline = new ExtractionPipeline();
            const renderer = new Renderer();

            if (options.verbose) console.error(chalk.blue(`[*] Ingesting: ${input}`));
            const payload = await ingestor.ingest(input);

            let pack;
            if (options.pack) {
                pack = engine.getPackForUrl(`https://${options.pack}`);
            } else if (payload.source === 'url') {
                pack = engine.getPackForUrl(payload.identifier);
            }

            if (options.verbose) console.error(chalk.blue(`[*] Extracting content...`));
            const { doc, trace } = await pipeline.process(payload, pack);

            if (pack) {
                await engine.saveDomainState(pack.domain, { success: true });
            }

            if (options.json) {
                console.log(JSON.stringify({ doc, trace }, null, 2));
                return;
            }

            if (options.explain) {
                console.error(chalk.yellow('\n--- EXTRACTION TRACE ---'));
                trace.steps.forEach(step => {
                    console.error(chalk.dim(`[${step.name}]`), chalk.white(step.decision), chalk.grey(`(${step.reason})`));
                });
                console.error(chalk.yellow('------------------------\n'));
            }

            if (options.extract) {
                doc.content.forEach(block => {
                    if ('text' in block) console.log(block.text);
                });
                return;
            }

            const output = renderer.render(doc, options.mode as any);
            console.log(output);

        } catch (error: any) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    });

program.parse(process.argv);
