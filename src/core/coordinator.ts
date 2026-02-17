import { Ingestor } from './ingestor';
import { ExtractionPipeline } from './pipeline';
import { PatternEngine } from './patterns';
import { PageDoc, Trace, IngestionPayload, IBrowserAdapter } from '../types';

export interface CoordinatorOptions {
    verbose?: boolean;
    rendered?: boolean; // Force rendered
    mode?: 'auto' | 'thread' | 'article';
    json?: boolean; // If true, don't force render on thin content automatically ?? actually CLI handles JSON output, we just need to know if we should be aggressive.
}

export interface CoordinatorResult {
    doc: PageDoc;
    trace: Trace;
    payload: IngestionPayload;
}

export class Coordinator {
    private ingestor: Ingestor;
    private pipeline: ExtractionPipeline;
    private engine: PatternEngine;
    private browserAdapter: IBrowserAdapter;

    constructor(engine: PatternEngine, browserAdapter: IBrowserAdapter) {
        this.engine = engine;
        this.ingestor = new Ingestor();
        this.pipeline = new ExtractionPipeline();
        this.browserAdapter = browserAdapter;
    }

    async process(input: string, options: CoordinatorOptions = {}): Promise<CoordinatorResult> {
        if (options.verbose) {
            console.error(`[*] Ingesting: ${input}`);
        }

        // 1. Initial Ingestion (Fetch or File)
        let payload = await this.ingestor.ingest(input);
        let usedBrowser = false;
        let provider: 'fetch' | 'playwright' = 'fetch';

        // 2. Check Domain State / Force Render
        if (payload.source === 'url') {
            const domainState = await this.engine.getDomainState(payload.identifier);

            // Heuristic: If we forced render, or domain is known to need it
            if (options.rendered || (domainState?.needsRendering && !options.json)) {
                if (options.verbose) console.error(`[*] Rendering via browser (Policy: ${options.rendered ? 'Forced' : 'Prior Knowledge'})...`);
                const html = await this.browserAdapter.render(payload.identifier);
                payload.rawContent = Buffer.from(html);
                usedBrowser = true;
                provider = 'playwright';
            }
        }

        // 3. Pattern Matching
        let pack;
        if (payload.source === 'url') {
            pack = this.engine.getPackForUrl(payload.identifier);
        } else {
            pack = this.engine.getPackForUrl(input);
        }

        // 4. Extraction
        let { doc, trace } = await this.pipeline.process(payload, pack, {
            forceReadability: options.mode === 'article'
        });

        // 5. Fallback Ladder (Thin Content)
        // If content is thin (< 3 blocks), it's likely JS-heavy or blocked.
        // Retry with Playwright if we haven't already.
        const isThin = doc.content.length < 3;
        const canRetry = (payload.source === 'url' || payload.source === 'file') && !usedBrowser && options.mode !== 'article'; // Don't retry in strict article mode? actually auto mode usually allows it.

        if (isThin && canRetry) {
            if (options.verbose) console.error(`[*] Thin content detected (${doc.content.length} blocks). Escalating to Playwright...`);
            try {
                const html = await this.browserAdapter.render(payload.identifier);
                payload.rawContent = Buffer.from(html);
                usedBrowser = true;
                provider = 'playwright';

                const retryResult = await this.pipeline.process(payload, pack, {
                    forceReadability: options.mode === 'article'
                });
                doc = retryResult.doc;
                trace = retryResult.trace;

                // Persist the need for rendering
                if (doc.content.length >= 3 && payload.source === 'url') {
                    const domain = new URL(payload.identifier).hostname.replace('www.', '');
                    await this.engine.saveDomainState(domain, {
                        needsRendering: true,
                        provider: 'playwright',
                        score: doc.content.length
                    });
                }
            } catch (e: any) {
                if (options.verbose) console.error(`[!] Browser retry failed: ${e.message}`);
            }
        }

        // 6. Final State Persistence
        if (payload.source === 'url') {
            const domain = new URL(payload.identifier).hostname.replace('www.', '');
            await this.engine.saveDomainState(domain, {
                lastSuccess: new Date().toISOString(),
                provider: provider,
                packVersion: pack?.domain // Simplified version tracking
            });
        }

        return { doc, trace, payload };
    }

    async close() {
        await this.browserAdapter.close();
    }
}
