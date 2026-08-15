import { CategoryConfig } from '../scraping.types';

const RESULT_SELECTOR = 'article[class*="SearchSnippetBase"]';
const TITLE_SELECTOR = 'h2 a';

export const artigosConfig: CategoryConfig = {
  name: 'artigos',
  buildUrl: (query, page) =>
    `https://www.jusbrasil.com.br/artigos/busca?q=${encodeURIComponent(query)}&p=${page}`,
  waitForSelector: RESULT_SELECTOR,
  resultSelector: RESULT_SELECTOR,
  mapItem: ($el, $) => {
    const titleEl = $el.find(TITLE_SELECTOR).first();
    const title = titleEl.text().trim();
    const link = titleEl.attr('href');
    const snippet = $el.find('[class*="snippet-content_root"]').first().text().trim();
    const [docType, published, author] = $el
      .find('[class*="shared-styles_caption__"] > span')
      .map((_, span) => $(span).text().trim())
      .get()
      .filter(Boolean);

    if (!title && !link) return null;

    return {
      title: title || null,
      link: link ? new URL(link, 'https://www.jusbrasil.com.br').toString() : null,
      docType: docType || null,
      published: published || null,
      author: author || null,
      snippet: snippet || null,
    };
  },
};
