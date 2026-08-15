import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';

// Ver docs/ANTI_BOT.md: diferente da postura anterior (só recuar quando detectado),
// o stealth plugin ativamente evita fingerprinting de headless/automação — decisão
// deliberada e documentada, não um detalhe de implementação.
puppeteer.use(StealthPlugin());

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DEFAULT_PROFILE_DIR = '.jusbrasil-browser-profile';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly config: ConfigService) {}

  // Perfil persistente em disco (cookies, localStorage, cache) — não um diretório
  // temporário. É o que faz a sessão de `npm run login` (docs/AUTH.md) valer entre
  // reinícios do servidor, sem precisar serializar cookies manualmente: o Chromium
  // já persiste tudo sozinho no userDataDir. Sem login feito, o perfil só acumula
  // estado anônimo (inclusive cookies de clearance do Cloudflare, o que também
  // ajuda a evitar desafios repetidos).
  private profileDir(): string {
    return this.config.get<string>('JUSBRASIL_PROFILE_DIR') || DEFAULT_PROFILE_DIR;
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      // Chromium não roda com sandbox de kernel dentro de um container Docker
      // comum (sem --cap-add=SYS_ADMIN) — precisa de --no-sandbox pra não
      // crashar no boot. Só ativado via CHROME_NO_SANDBOX=true (setado no
      // Dockerfile, ver docs/DEPLOY.md); fora de container fica desativado por
      // padrão, já que --no-sandbox reduz o isolamento do processo renderizador.
      const noSandbox = this.config.get<string>('CHROME_NO_SANDBOX') === 'true';
      this.browserPromise = puppeteer.launch({
        headless: true,
        userDataDir: this.profileDir(),
        defaultViewport: { width: 1366, height: 768 },
        args: [
          '--disable-blink-features=AutomationControlled',
          ...(noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        ],
      });
    }
    return this.browserPromise;
  }

  // Uma aba por chamada (não um browser context isolado): o objetivo aqui é reuso
  // de sessão entre requisições via userDataDir, não isolamento entre elas — e o
  // throttle já serializa as navegações reais de qualquer forma.
  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    try {
      return await fn(page);
    } finally {
      await page.close();
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
