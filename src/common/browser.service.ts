import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Browser, chromium, Page } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
      });
    }
    return this.browserPromise;
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'pt-BR',
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();
    try {
      return await fn(page);
    } finally {
      await context.close();
    }
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }
}
