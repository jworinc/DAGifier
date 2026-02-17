
import { Coordinator } from './core/coordinator';
import { PatternEngine } from './core/patterns';
import { NoOpBrowserAdapter } from './core/noop-browser';

// Minimal Worker Entry Point
export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        const url = new URL(request.url);
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
            return new Response("Usage: ?url=<target_url>", { status: 400 });
        }

        try {
            // Initialize Engine (No FS access in Workers, so pass empty dir)
            // TODO: In a real deployment, we'd bundle patterns and call engine.addPack() here.
            const engine = new PatternEngine('/tmp');

            // Initialize Coordinator with NoOp Adapter (no Playwright)
            const coordinator = new Coordinator(engine, new NoOpBrowserAdapter());

            // Process
            // Note: Ingestor uses axios by default which works in Node. 
            // Cloudflare Workers use fetch. We might need a FetchIngestor or rely on axios adapter.
            // For now, assuming axios might fail or need adapter in CF. 
            // But let's try to see if it builds.
            const { doc } = await coordinator.process(targetUrl, { mode: 'auto' });

            return new Response(JSON.stringify(doc, null, 2), {
                headers: { 'content-type': 'application/json' }
            });

        } catch (e: any) {
            return new Response(`Error: ${e.message}`, { status: 500 });
        }
    }
};
