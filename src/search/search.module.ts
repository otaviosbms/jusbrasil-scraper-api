import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { SearchController } from './search.controller';

@Module({
  imports: [ScrapingModule],
  controllers: [SearchController],
})
export class SearchModule {}
