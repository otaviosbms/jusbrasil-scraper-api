import { Injectable } from '@nestjs/common';
import NodeCache from 'node-cache';

@Injectable()
export class CacheService {
  private readonly cache = new NodeCache({ stdTTL: 60 * 15, checkperiod: 60 });

  async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get<T>(key);
    if (hit) return hit;
    const value = await fn();
    this.cache.set(key, value);
    return value;
  }
}
