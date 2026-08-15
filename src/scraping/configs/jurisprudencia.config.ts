import { CategoryConfig } from '../scraping.types';

const RESULT_SELECTOR = 'article[class*="SearchSnippetBase"]';
const TITLE_SELECTOR = 'h2 a, [class*="search-snippet-base_title"] a';

export const jurisprudenciaConfig: CategoryConfig = {
  name: 'jurisprudencia',
  buildUrl: (query, page) =>
    `https://www.jusbrasil.com.br/jurisprudencia/busca?q=${encodeURIComponent(query)}&p=${page}`,
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
