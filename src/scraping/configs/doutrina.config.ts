import { CategoryConfig } from '../scraping.types';

const RESULT_SELECTOR = '[class*="doctrine-cover_snippet"]';
const TITLE_SELECTOR = 'h2 a';

export const doutrinaConfig: CategoryConfig = {
  name: 'doutrina',
  buildUrl: (query, page) =>
    `https://www.jusbrasil.com.br/doutrina/busca?q=${encodeURIComponent(query)}&p=${page}`,
  waitForSelector: RESULT_SELECTOR,
  resultSelector: RESULT_SELECTOR,
  mapItem: ($el, $) => {
    const titleEl = $el.find(TITLE_SELECTOR).first();
    const title = titleEl.text().trim();
    const link = titleEl.attr('href');
    const [publisher, published, author] = $el
      .find('[class*="shared-styles_caption__"] > span')
      .map((_, span) => $(span).text().trim())
      .get()
      .filter(Boolean);

    if (!title && !link) return null;

    return {
      title: title || null,
      link: link ? new URL(link, 'https://www.jusbrasil.com.br').toString() : null,
      publisher: publisher || null,
      published: published || null,
      author: author || null,
    };
  },
};
