import { chromium, Browser, Page } from 'playwright';
import { IBrowserAdapter } from '../types';
import path from 'path';

export class BrowserAdapter implements IBrowserAdapter {
    private browser: Browser | null = null;

    async render(url: string): Promise<string> {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
        }

        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        try {
            const targetUrl = (url.startsWith('http') || url.startsWith('file://'))
                ? url
                : `file://${path.resolve(url)}`;

            // Wait for network idle or a reasonable timeout
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

            // Extract the fully rendered HTML
            const html = await page.content();
            return html;
        } finally {
            await page.close();
            await context.close();
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
