import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { BrowserService } from '../common/browser.service';
import { CacheService } from '../common/cache.service';
import { ThrottleService } from '../common/throttle.service';
import { CategoryConfig, DocumentResponse, SearchResponse } from './scraping.types';
import { decodeDocumentId, encodeDocumentId } from './document-id';
import { consultaProcessualConfig } from './configs/consulta-processual.config';
import { jurisprudenciaConfig } from './configs/jurisprudencia.config';
import { doutrinaConfig } from './configs/doutrina.config';
import { artigosConfig } from './configs/artigos.config';
import { legislacaoConfig } from './configs/legislacao.config';
import { diariosConfig } from './configs/diarios.config';

// Elementos de "chrome" da página (navegação, scripts, propaganda) removidos antes de
// extrair o texto do documento completo — mantém get_document focado no conteúdo real.
const NON_CONTENT_SELECTOR = 'script, style, noscript, svg, nav, header, footer, aside';
// Contêiner mais provável do conteúdo principal nas páginas de detalhe do Jusbrasil,
// em ordem de preferência. Sem seletores calibrados por categoria (ver docs/SCRAPERS.md);
// é uma extração heurística, não garantida a sobreviver a mudanças de marcação.
const MAIN_CONTENT_SELECTOR = 'article, main, [class*="content"], [class*="text"]';

function isChallengePage($: cheerio.CheerioAPI, title: string): boolean {
  return (
    title.trim() === 'Um momento…' ||
    $('script[src*="challenges.cloudflare.com"]').length > 0
  );
}

@Injectable()
export class ScraperService {
  constructor(
    private readonly browser: BrowserService,
    private readonly cache: CacheService,
    private readonly throttle: ThrottleService,
  ) {}

  search(query: string, page = 1) {
    return {
      consultaProcessual: () => this.run(consultaProcessualConfig, query, page),
      jurisprudencia: () => this.run(jurisprudenciaConfig, query, page),
      doutrina: () => this.run(doutrinaConfig, query, page),
      artigos: () => this.run(artigosConfig, query, page),
      legislacao: () => this.run(legislacaoConfig, query, page),
      diarios: () => this.run(diariosConfig, query, page),
    };
  }

  private async run(config: CategoryConfig, query: string, page: number): Promise<SearchResponse> {
    if (!query || !query.trim()) {
      throw new HttpException('Parâmetro de busca "q" é obrigatório', HttpStatus.BAD_REQUEST);
    }

    const cacheKey = `${config.name}:${query}:${page}`;

    return this.cache.cached(cacheKey, () =>
      this.throttle.throttled(() =>
        this.browser.withPage(async (browserPage) => {
          const url = config.buildUrl(query, page);
          await browserPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

          if (config.waitForSelector) {
            await browserPage
              .waitForSelector(config.waitForSelector, { timeout: 15000 })
              .catch(() => null);
          }

          const html = await browserPage.content();
          const $ = cheerio.load(html);
          const title = await browserPage.title();

          if (isChallengePage($, title)) {
            this.throttle.reportChallengeSeen();
            throw new HttpException(
              'O Jusbrasil está exibindo uma verificação anti-bot no momento. ' +
                'O intervalo entre buscas foi aumentado automaticamente — tente novamente em alguns minutos.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          const items: Record<string, unknown>[] = [];
          $(config.resultSelector).each((_, el) => {
            const item = config.mapItem($(el), $);
            if (item) items.push(item);
          });

          // id vem primeiro no objeto por convenção (ver docs/API.md); usado depois
          // com getDocument() para recuperar o conteúdo completo desse resultado.
          const results = items.map((item) =>
            typeof item.link === 'string'
              ? { id: encodeDocumentId(config.name, item.link), ...item }
              : { id: null, ...item },
          );

          return {
            query,
            page,
            count: results.length,
            results,
            source: url,
          };
        }),
      ),
    );
  }

  async getDocument(id: string): Promise<DocumentResponse> {
    let category: string;
    let link: string;
    try {
      ({ category, link } = decodeDocumentId(id));
    } catch {
      throw new HttpException('Parâmetro "id" inválido', HttpStatus.BAD_REQUEST);
    }

    const cacheKey = `document:${id}`;

    return this.cache.cached(cacheKey, () =>
      this.throttle.throttled(() =>
        this.browser.withPage(async (browserPage) => {
          await browserPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });

          const html = await browserPage.content();
          const $ = cheerio.load(html);
          const pageTitle = await browserPage.title();

          if (isChallengePage($, pageTitle)) {
            this.throttle.reportChallengeSeen();
            throw new HttpException(
              'O Jusbrasil está exibindo uma verificação anti-bot no momento. ' +
                'O intervalo entre buscas foi aumentado automaticamente — tente novamente em alguns minutos.',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          $(NON_CONTENT_SELECTOR).remove();
          const heading = $('h1').first().text().trim();
          const main = $(MAIN_CONTENT_SELECTOR).first();
          const content = (main.length ? main.text() : $('body').text())
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n+/g, '\n')
            .trim();

          if (!content) {
            throw new HttpException(
              'Não foi possível extrair o conteúdo dessa página',
              HttpStatus.BAD_GATEWAY,
            );
          }

          return {
            id,
            category,
            title: heading || pageTitle,
            content,
            source: link,
          };
        }),
      ),
    );
  }
}
