import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { BrowserService } from '../common/browser.service';
import { CacheService } from '../common/cache.service';
import { ThrottleService } from '../common/throttle.service';
import { CategoryConfig, SearchResponse } from './scraping.types';
import { consultaProcessualConfig } from './configs/consulta-processual.config';
import { jurisprudenciaConfig } from './configs/jurisprudencia.config';
import { doutrinaConfig } from './configs/doutrina.config';
import { artigosConfig } from './configs/artigos.config';
import { legislacaoConfig } from './configs/legislacao.config';
import { diariosConfig } from './configs/diarios.config';

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

          return {
            query,
            page,
            count: items.length,
            results: items,
            source: url,
          };
        }),
      ),
    );
  }
}
