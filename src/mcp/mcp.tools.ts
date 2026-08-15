import { ScraperService } from '../scraping/scraper.service';

type ScraperMethod = keyof ReturnType<ScraperService['search']>;

export interface McpToolDefinition {
  name: string;
  description: string;
  method: ScraperMethod;
}

// Sufixo comum a todas as tools de busca: reforça pro LLM que o snippet retornado é só
// pra avaliar relevância, e que o conteúdo completo é uma chamada separada sob demanda.
const RETRIEVAL_HINT =
  ' Cada item retornado inclui um "id"; o snippet/título já indicam do que se trata, mas ' +
  'quando isso não for suficiente para responder, use jusbrasil_get_document com esse id ' +
  'para obter o conteúdo completo da página.';

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'jusbrasil_consulta_processual',
    description:
      'Busca pessoas ou empresas no Jusbrasil por nome, CPF ou CNPJ. Retorna uma lista de ' +
      'correspondências (não o conteúdo de processos) — cada item tem um link para a página ' +
      'de processos vinculados à pessoa/empresa.' +
      RETRIEVAL_HINT,
    method: 'consultaProcessual',
  },
  {
    name: 'jusbrasil_jurisprudencia',
    description:
      'Busca jurisprudência (acórdãos e decisões judiciais) no Jusbrasil por texto livre. ' +
      'Retorna id, título e um trecho (snippet) de cada resultado, não o inteiro teor.' +
      RETRIEVAL_HINT,
    method: 'jurisprudencia',
  },
  {
    name: 'jusbrasil_doutrina',
    description: 'Busca doutrina jurídica (livros e obras) no Jusbrasil por texto livre.' + RETRIEVAL_HINT,
    method: 'doutrina',
  },
  {
    name: 'jusbrasil_artigos',
    description:
      'Busca artigos jurídicos publicados no Jusbrasil por texto livre. Retorna id, título e ' +
      'um trecho (snippet) de cada resultado, não o artigo inteiro.' +
      RETRIEVAL_HINT,
    method: 'artigos',
  },
  {
    name: 'jusbrasil_legislacao',
    description:
      'Busca legislação (leis, decretos, normas) no Jusbrasil por texto livre. Retorna id, ' +
      'título e um trecho (snippet) de cada resultado, não o texto integral da norma.' +
      RETRIEVAL_HINT,
    method: 'legislacao',
  },
  {
    name: 'jusbrasil_diarios',
    description:
      'Busca diários oficiais publicados no Jusbrasil por texto livre. Retorna id, título e ' +
      'um trecho (snippet) de cada resultado, não a publicação inteira.' +
      RETRIEVAL_HINT,
    method: 'diarios',
  },
];
