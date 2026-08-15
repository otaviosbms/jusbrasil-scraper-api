import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

export interface SearchResponse {
  query: string;
  page: number;
  count: number;
  results: Record<string, unknown>[];
  source: string;
}

export interface CategoryConfig {
  name: string;
  buildUrl: (query: string, page: number) => string;
  resultSelector: string;
  waitForSelector?: string;
  mapItem: (
    $el: Cheerio<AnyNode>,
    $: CheerioAPI,
  ) => Record<string, unknown> | null;
}
