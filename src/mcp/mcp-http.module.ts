import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { McpHttpController } from './mcp-http.controller';

@Module({
  imports: [ScrapingModule],
  controllers: [McpHttpController],
})
export class McpHttpModule {}
