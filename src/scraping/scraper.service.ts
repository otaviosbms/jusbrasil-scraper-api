import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { BrowserService } from '../common/browser.service';
import { CacheService } from '../common/cache.service';
import { ThrottleService } from '../common/throttle.service';
import { CategoryConfig, DocumentResponse, SearchResponse } from './scraping.types';
import { decodeDocumentId, encodeDocumentId } from './document-id';
import { consultaProcessualConfig } from './configs/consulta-processual.config';
import {
  jurisprudenciaConfig,
  JURISPRUDENCIA_JURIS_TYPES,
  JURISPRUDENCIA_TRIBUNALS,
} from './configs/jurisprudencia.config';
import { doutrinaConfig } from './configs/doutrina.config';
import { artigosConfig } from './configs/artigos.config';
import { legislacaoConfig } from './configs/legislacao.config';
import { diariosConfig } from './configs/diarios.config';

const DATE_FILTER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Elementos de "chrome" da página (navegação, scripts, propaganda) removidos antes de
// extrair o texto do documento completo — mantém get_document focado no conteúdo real.
const NON_CONTENT_SELECTOR = 'script, style, noscript, svg, nav, header, footer, aside';
// Contêiner mais provável do conteúdo principal nas páginas de detalhe do Jusbrasil.
// Sem seletores calibrados por categoria (ver docs/SCRAPERS.md); é uma extração
// heurística, não garantida a sobreviver a mudanças de marcação — por isso
// pickMainContent() abaixo pega o candidato com mais texto em vez do primeiro
// match no DOM: o primeiro elemento a bater com `[class*="content"]` costuma ser
// um link de acessibilidade ("Pular para conteúdo principal"), não o conteúdo.
const MAIN_CONTENT_SELECTOR = 'article, main, [class*="content"], [class*="text"]';

function isChallengePage($: cheerio.CheerioAPI, title: string): boolean {
  return (
    title.trim() === 'Um momento…' ||
    $('script[src*="challenges.cloudflare.com"]').length > 0
  );
}

function pickMainContent($: cheerio.CheerioAPI): string {
  let best = '';
  $(MAIN_CONTENT_SELECTOR).each((_, el) => {
    const text = $(el).text();
    if (text.length > best.length) best = text;
  });
  return best || $('body').text();
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  constructor(
    private readonly browser: BrowserService,
    private readonly cache: CacheService,
    private readonly throttle: ThrottleService,
  ) {}

  search(query: string, page = 1, filters: Record<string, string> = {}) {
    return {
      consultaProcessual: () => this.run(consultaProcessualConfig, query, page, filters),
      jurisprudencia: () => this.run(jurisprudenciaConfig, query, page, filters),
      doutrina: () => this.run(doutrinaConfig, query, page, filters),
      artigos: () => this.run(artigosConfig, query, page, filters),
      legislacao: () => this.run(legislacaoConfig, query, page, filters),
      diarios: () => this.run(diariosConfig, query, page, filters),
    };
  }

  private validateFilters(config: CategoryConfig, filters: Record<string, string>): void {
    const allowed = config.filterKeys ?? [];
    for (const key of Object.keys(filters)) {
      if (!allowed.includes(key)) {
        throw new HttpException(
          `Filtro "${key}" não é suportado pela categoria "${config.name}"`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (config.name === 'jurisprudencia') {
      for (const key of ['dateFrom', 'dateTo'] as const) {
        if (filters[key] && !DATE_FILTER_PATTERN.test(filters[key])) {
          throw new HttpException(`Filtro "${key}" deve estar no formato AAAA-MM-DD`, HttpStatus.BAD_REQUEST);
        }
      }
      if (filters.jurisType && !JURISPRUDENCIA_JURIS_TYPES.includes(filters.jurisType as never)) {
        throw new HttpException(
          `Filtro "jurisType" deve ser um de: ${JURISPRUDENCIA_JURIS_TYPES.join(', ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (filters.tribunal) {
        const invalid = filters.tribunal.split(',').map((t) => t.trim()).filter(
          (t) => !JURISPRUDENCIA_TRIBUNALS.includes(t as never),
        );
        if (invalid.length > 0) {
          throw new HttpException(
            `Filtro "tribunal" contém valor(es) inválido(s): ${invalid.join(', ')}. Use um ou mais de: ${JURISPRUDENCIA_TRIBUNALS.join(', ')}`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  private async run(
    config: CategoryConfig,
    query: string,
    page: number,
    filters: Record<string, string> = {},
  ): Promise<SearchResponse> {
    if (!query || !query.trim()) {
      throw new HttpException('Parâmetro de busca "q" é obrigatório', HttpStatus.BAD_REQUEST);
    }
    this.validateFilters(config, filters);

    const cacheKey = `${config.name}:${query}:${page}:${JSON.stringify(filters)}`;
    const start = Date.now();
    this.logger.log(`Busca iniciada: categoria=${config.name} query="${query}" page=${page}`);

    try {
      const response = await this.cache.cached(cacheKey, () =>
        this.throttle.throttled(() =>
          this.browser.withPage(async (browserPage) => {
            const url = config.buildUrl(query, page, filters);
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
              ...(Object.keys(filters).length > 0 ? { filters } : {}),
              count: results.length,
              results,
              source: url,
            };
          }),
        ),
      );

      this.logger.log(
        `Busca concluída: categoria=${config.name} query="${query}" count=${response.count} +${Date.now() - start}ms`,
      );
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Busca falhou: categoria=${config.name} query="${query}" +${Date.now() - start}ms — ${message}`,
      );
      throw err;
    }
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
    const start = Date.now();
    this.logger.log(`Documento solicitado: categoria=${category} id=${id}`);

    try {
      const response = await this.cache.cached(cacheKey, () =>
        this.throttle.throttled(() =>
          this.browser.withPage(async (browserPage) => {
            await browserPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });

            let html = await browserPage.content();
            let $ = cheerio.load(html);
            let pageTitle = await browserPage.title();

            if (isChallengePage($, pageTitle)) {
              this.throttle.reportChallengeSeen();
              throw new HttpException(
                'O Jusbrasil está exibindo uma verificação anti-bot no momento. ' +
                  'O intervalo entre buscas foi aumentado automaticamente — tente novamente em alguns minutos.',
                HttpStatus.TOO_MANY_REQUESTS,
              );
            }

            // Jurisprudência: a página do resultado mostra só a ementa (resumo);
            // o texto integral do acórdão vive numa página separada, linkada por
            // essa aba. Sem seguir esse link, get_document devolve só o resumo.
            let source = link;
            const inteiroTeorHref = $('a[href*="/inteiro-teor-"]').first().attr('href');
            if (inteiroTeorHref) {
              source = new URL(inteiroTeorHref, link).toString();
              this.logger.debug(`Seguindo link de inteiro teor: ${source}`);
              await browserPage.goto(source, { waitUntil: 'domcontentloaded', timeout: 30000 });
              html = await browserPage.content();
              $ = cheerio.load(html);
              pageTitle = await browserPage.title();

              if (isChallengePage($, pageTitle)) {
                this.throttle.reportChallengeSeen();
                throw new HttpException(
                  'O Jusbrasil está exibindo uma verificação anti-bot no momento. ' +
                    'O intervalo entre buscas foi aumentado automaticamente — tente novamente em alguns minutos.',
                  HttpStatus.TOO_MANY_REQUESTS,
                );
              }
            }

            $(NON_CONTENT_SELECTOR).remove();
            const heading = $('h1').first().text().trim();
            const content = pickMainContent($)
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
              source,
            };
          }),
        ),
      );

      this.logger.log(`Documento obtido: categoria=${category} id=${id} +${Date.now() - start}ms`);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Documento falhou: categoria=${category} id=${id} +${Date.now() - start}ms — ${message}`);
      throw err;
    }
  }
}
