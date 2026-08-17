import type { CheerioAPI, Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

export interface SearchResponse {
  query: string;
  page: number;
  filters?: Record<string, string>;
  count: number;
  results: Record<string, unknown>[];
  source: string;
}

export interface DocumentResponse {
  id: string;
  category: string;
  title: string;
  content: string;
  source: string;
}

export interface CategoryConfig {
  name: string;
  buildUrl: (query: string, page: number, filters: Record<string, string>) => string;
  resultSelector: string;
  waitForSelector?: string;
  // Chaves de filtro aceitas via query string (ver docs/API.md) — nomes vindos
  // direto dos parâmetros usados pela busca web do Jusbrasil, não inventados.
  // Categorias sem filtro próprio deixam undefined (equivalente a []).
  filterKeys?: readonly string[];
  mapItem: (
    $el: Cheerio<AnyNode>,
    $: CheerioAPI,
  ) => Record<string, unknown> | null;
}
