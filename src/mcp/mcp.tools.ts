import { ScraperService } from '../scraping/scraper.service';

type ScraperMethod = keyof ReturnType<ScraperService['search']>;

export interface McpToolDefinition {
  name: string;
  description: string;
  method: ScraperMethod;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'jusbrasil_consulta_processual',
    description:
      'Busca pessoas ou empresas no Jusbrasil por nome, CPF ou CNPJ. Retorna uma lista de ' +
      'correspondências (não o conteúdo de processos) — cada item tem um link para a página ' +
      'de processos vinculados à pessoa/empresa.',
    method: 'consultaProcessual',
  },
  {
    name: 'jusbrasil_jurisprudencia',
    description: 'Busca jurisprudência (acórdãos e decisões judiciais) no Jusbrasil por texto livre.',
    method: 'jurisprudencia',
  },
  {
    name: 'jusbrasil_doutrina',
    description: 'Busca doutrina jurídica (livros e obras) no Jusbrasil por texto livre.',
    method: 'doutrina',
  },
  {
    name: 'jusbrasil_artigos',
    description: 'Busca artigos jurídicos publicados no Jusbrasil por texto livre.',
    method: 'artigos',
  },
  {
    name: 'jusbrasil_legislacao',
    description: 'Busca legislação (leis, decretos, normas) no Jusbrasil por texto livre.',
    method: 'legislacao',
  },
  {
    name: 'jusbrasil_diarios',
    description: 'Busca diários oficiais publicados no Jusbrasil por texto livre.',
    method: 'diarios',
  },
];
