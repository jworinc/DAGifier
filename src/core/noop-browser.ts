
import { IBrowserAdapter } from '../types';

export class NoOpBrowserAdapter implements IBrowserAdapter {
    async render(url: string): Promise<string> {
        throw new Error("Browser rendering is not available in this environment (NoOpAdapter active).");
    }

    async close() {
        // no-op
    }
}
