import { CategoryConfig } from '../scraping.types';

const RESULT_SELECTOR = 'article[class*="SearchSnippetBase"]';
const TITLE_SELECTOR = 'h2 a';

export const legislacaoConfig: CategoryConfig = {
  name: 'legislacao',
  buildUrl: (query, page) =>
    `https://www.jusbrasil.com.br/legislacao/busca?q=${encodeURIComponent(query)}&p=${page}`,
  waitForSelector: RESULT_SELECTOR,
  resultSelector: RESULT_SELECTOR,
  mapItem: ($el, $) => {
    const titleEl = $el.find(TITLE_SELECTOR).first();
    const title = titleEl.text().trim();
    const link = titleEl.attr('href');
    const snippet = $el.find('[class*="snippet-content_root"]').first().text().trim();
    const [docType, authority] = $el
      .find('[class*="shared-styles_caption__"] > span')
      .map((_, span) => $(span).text().trim())
      .get()
      .filter(Boolean);

    // Resultados aninhados (artigos específicos dentro da mesma lei) não têm h2 próprio e são descartados aqui.
    if (!title && !link) return null;

    return {
      title: title || null,
      link: link ? new URL(link, 'https://www.jusbrasil.com.br').toString() : null,
      docType: docType || null,
      authority: authority || null,
      snippet: snippet || null,
    };
  },
};
