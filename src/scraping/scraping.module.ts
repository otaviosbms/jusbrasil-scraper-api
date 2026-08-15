import { Module } from '@nestjs/common';
import { BrowserService } from '../common/browser.service';
import { CacheService } from '../common/cache.service';
import { ThrottleService } from '../common/throttle.service';
import { ScraperService } from './scraper.service';

@Module({
  providers: [BrowserService, CacheService, ThrottleService, ScraperService],
  exports: [ScraperService],
})
export class ScrapingModule {}
