import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScrapingModule } from '../scraping/scraping.module';

// Módulo mínimo pro contexto do servidor MCP: só o necessário pra instanciar
// o ScraperService (browser + cache + throttle), sem HTTP nem rate-limit guard.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScrapingModule],
})
export class McpBootstrapModule {}
