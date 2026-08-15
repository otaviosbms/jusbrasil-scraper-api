import { existsSync } from 'node:fs';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Browser, chromium, Page } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DEFAULT_AUTH_STATE_PATH = '.jusbrasil-auth-state.json';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly config: ConfigService) {}

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
      });
    }
    return this.browserPromise;
  }

  // Caminho da sessão salva por `npm run login` (docs/AUTH.md). Sem login feito
  // (arquivo ausente), retorna undefined e o Playwright cria um contexto anônimo
  // normalmente — nada muda pra quem não usa a camada de login.
  private authStatePath(): string | undefined {
    const path = this.config.get<string>('JUSBRASIL_AUTH_STATE_PATH') || DEFAULT_AUTH_STATE_PATH;
    return existsSync(path) ? path : undefined;
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'pt-BR',
      viewport: { width: 1366, height: 768 },
      storageState: this.authStatePath(),
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
