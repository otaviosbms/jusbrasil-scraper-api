import { CategoryConfig } from '../scraping.types';

// Diferente das outras buscas: aqui a query é nome/CPF/CNPJ e o resultado é uma lista
// de pessoas/empresas que "batem" com o termo, cada uma linkando para a página de
// processos vinculados — não é busca full-text de conteúdo de processo.
const RESULT_SELECTOR = 'a[class*="person-summary_card__"]';

export const consultaProcessualConfig: CategoryConfig = {
  name: 'consulta-processual',
  buildUrl: (query, page) =>
    `https://www.jusbrasil.com.br/consulta-processual/busca?q=${encodeURIComponent(query)}&p=${page}`,
  waitForSelector: RESULT_SELECTOR,
  resultSelector: RESULT_SELECTOR,
  mapItem: ($el, $) => {
    const link = $el.attr('href');
    const name = $el
      .find('[class*="person-summary_card__name__title__OUGft"] span')
      .first()
      .text()
      .trim();
    const subtitle = $el
      .find('[class*="person-summary_card__name__title__caption"]')
      .first()
      .text()
      .trim();
    const isCompany = $el.find('[class*="person-summary_icon--company"]').length > 0;
    const infoParts = $el
      .find('[class*="person-summary_card__info__"] [class*="shared-styles_caption__"] > span')
      .map((_, span) => $(span).text().trim())
      .get()
      .filter(Boolean);

    if (!name && !link) return null;

    return {
      name: name || null,
      type: isCompany ? 'empresa' : 'pessoa',
      document: isCompany ? infoParts[0] || null : null,
      relatedName: subtitle || null,
      location: infoParts[infoParts.length - 1] || null,
      link: link ? new URL(link, 'https://www.jusbrasil.com.br').toString() : null,
    };
  },
};
