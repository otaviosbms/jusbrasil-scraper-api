import { CategoryConfig } from '../scraping.types';

const RESULT_SELECTOR = 'article[class*="SearchSnippetBase"]';
const TITLE_SELECTOR = 'h2 a, [class*="search-snippet-base_title"] a';

// Valores confirmados clicando cada opção do filtro "Tipo de julgado" na busca
// real e lendo o parâmetro `jurisType` resultante na URL (não são suposição —
// ver docs/SCRAPERS.md). "Todos os julgados" não gera parâmetro (equivale a
// omitir o filtro).
export const JURISPRUDENCIA_JURIS_TYPES = [
  'sumula',
  'acordao',
  'decisao',
  'sentenca',
  'despacho',
  'orientacao_jurisprudencial',
] as const;

// Siglas confirmadas abrindo o diálogo do filtro "Tribunal" na busca real
// (ver docs/SCRAPERS.md). O slug de URL de cada uma é a sigla em minúsculas
// com "-" trocado por "_" (ex: TAT-MS -> tat_ms) — confirmado navegando com
// esse valor e lendo o filtro `court` aplicado no lado do servidor, não é
// suposição aplicada às demais siglas por conveniência.
export const JURISPRUDENCIA_TRIBUNALS = [
  'stf',
  'stj',
  'tst',
  'tjs',
  'trfs',
  'trts',
  'tse',
  'tres',
  'stm',
  'tjms',
  'tcu',
  'tces',
  'tat_ms',
  'tat_sc',
  'tit_sp',
  'cat_go',
  'tnu',
  'tru',
  'cnj',
  'carf',
  'anac',
  'ancine',
  'aneel',
  'antaq',
  'antt',
  'cade',
  'cfm',
] as const;

// Filtros aceitos pela busca de jurisprudência, na mesma sintaxe de query
// string usada pela busca web do Jusbrasil (ver docs/API.md):
// - dateFrom/dateTo: intervalo de data no formato AAAA-MM-DD
// - jurisType: um dos valores de JURISPRUDENCIA_JURIS_TYPES
// - tribunal: um ou mais valores de JURISPRUDENCIA_TRIBUNALS, separados por
//   vírgula (ex: "stf,stj") — o Jusbrasil aceita múltiplos tribunais via
//   parâmetro `tribunal` repetido na URL, não separado por vírgula; a
//   tradução acontece em buildUrl abaixo.
export const JURISPRUDENCIA_FILTER_KEYS = ['dateFrom', 'dateTo', 'jurisType', 'tribunal'] as const;

export const jurisprudenciaConfig: CategoryConfig = {
  name: 'jurisprudencia',
  filterKeys: JURISPRUDENCIA_FILTER_KEYS,
  buildUrl: (query, page, filters) => {
    const params = new URLSearchParams({ q: query, p: String(page) });
    for (const key of JURISPRUDENCIA_FILTER_KEYS) {
      if (!filters[key]) continue;
      if (key === 'tribunal') {
        for (const tribunal of filters[key].split(',')) params.append('tribunal', tribunal.trim());
      } else {
        params.set(key, filters[key]);
      }
    }
    return `https://www.jusbrasil.com.br/jurisprudencia/busca?${params.toString()}`;
  },
  waitForSelector: RESULT_SELECTOR,
  resultSelector: RESULT_SELECTOR,
  mapItem: ($el, $) => {
    const titleEl = $el.find(TITLE_SELECTOR).first();
    const title = titleEl.text().trim();
    const link = titleEl.attr('href');
    const snippet = $el.find('[class*="snippet-content_root"]').first().text().trim();
    const [category, docType] = $el
      .find('[class*="shared-styles_caption__"] > span')
      .map((_, span) => $(span).text().trim())
      .get()
      .filter(Boolean);

    if (!title && !link) return null;

    return {
      title: title || null,
      link: link ? new URL(link, 'https://www.jusbrasil.com.br').toString() : null,
      category: category || null,
      docType: docType || null,
      snippet: snippet || null,
    };
  },
};
