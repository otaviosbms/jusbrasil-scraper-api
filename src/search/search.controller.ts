import { Controller, Get, Query } from '@nestjs/common';
import { ScraperService } from '../scraping/scraper.service';

@Controller('api')
export class SearchController {
  constructor(private readonly scraper: ScraperService) {}

  private parsePage(page?: string): number {
    const parsed = Number(page);
    return parsed > 0 ? parsed : 1;
  }

  @Get('consulta-processual')
  consultaProcessual(@Query('q') q: string, @Query('page') page?: string) {
    return this.scraper.search(q, this.parsePage(page)).consultaProcessual();
  }

  @Get('jurisprudencia')
  jurisprudencia(@Query('q') q: string, @Query('page') page?: string) {
    return this.scraper.search(q, this.parsePage(page)).jurisprudencia();
  }

  @Get('doutrina')
  doutrina(@Query('q') q: string, @Query('page') page?: string) {
    return this.scraper.search(q, this.parsePage(page)).doutrina();
  }

  @Get('artigos')
  artigos(@Query('q') q: string, @Query('page') page?: string) {
    return this.scraper.search(q, this.parsePage(page)).artigos();
  }

  @Get('legislacao')
  legislacao(@Query('q') q: string, @Query('page') page?: string) {
    return this.scraper.search(q, this.parsePage(page)).legislacao();
  }

  @Get('diarios')
  diarios(@Query('q') q: string, @Query('page') page?: string) {
    return this.scraper.search(q, this.parsePage(page)).diarios();
  }
}
