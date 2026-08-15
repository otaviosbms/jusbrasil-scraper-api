import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ScraperService } from '../scraping/scraper.service';
import { SearchResponse } from '../scraping/scraping.types';
import { MCP_TOOLS, McpToolDefinition } from './mcp.tools';

// Isolada da chamada genérica server.tool(...) de propósito: indexar
// scraper.search(...) por uma chave em união dentro do mesmo contexto de
// inferência do .tool() estoura o limite de profundidade do TS (TS2589).
function invokeTool(
  scraper: ScraperService,
  tool: McpToolDefinition,
  q: string,
  page: number,
): Promise<SearchResponse> {
  return scraper.search(q, page)[tool.method]();
}

// Compartilhado entre o entrypoint stdio (src/mcp/mcp.server.ts, uso local — ex:
// Claude Desktop) e o endpoint HTTP (src/mcp/mcp-http.controller.ts, uso remoto) —
// mesmas 7 tools, mesmo comportamento, só o transporte muda.
export function registerJusbrasilTools(server: McpServer, scraper: ScraperService): void {
  const inputSchema: { q: z.ZodString; page: z.ZodOptional<z.ZodNumber> } = {
    q: z.string().min(1).describe('Termo de busca (texto livre, ou nome/CPF/CNPJ na consulta processual)'),
    page: z.number().int().positive().optional().describe('Número da página, padrão 1'),
  };

  async function handler(
    tool: McpToolDefinition,
    args: { q: string; page?: number },
  ): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
    try {
      const result = await invokeTool(scraper, tool, args.q, args.page ?? 1);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Erro: ${message}` }], isError: true };
    }
  }

  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema },
      (args: { q: string; page?: number }) => handler(tool, args),
    );
  }

  server.registerTool(
    'jusbrasil_get_document',
    {
      description:
        'Recupera o conteúdo completo (título + texto integral) de um resultado retornado por ' +
        'uma das buscas jusbrasil_*, usando o "id" presente em cada item da lista de resultados. ' +
        'Use quando o snippet/título do resultado não forem suficientes para responder à pergunta.',
      inputSchema: {
        id: z.string().min(1).describe('id de um item retornado por uma busca jusbrasil_* anterior'),
      },
    },
    async ({ id }: { id: string }) => {
      try {
        const result = await scraper.getDocument(id);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Erro: ${message}` }], isError: true };
      }
    },
  );
}
