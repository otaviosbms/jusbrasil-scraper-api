import { Injectable, Logger } from '@nestjs/common';
import NodeCache from 'node-cache';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly cache = new NodeCache({ stdTTL: 60 * 15, checkperiod: 60 });

  async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get<T>(key);
    if (hit) {
      this.logger.debug(`Cache hit: ${key}`);
      return hit;
    }
    this.logger.debug(`Cache miss: ${key}`);
    const value = await fn();
    this.cache.set(key, value);
    return value;
  }
}
