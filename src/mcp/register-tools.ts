import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ScraperService } from '../scraping/scraper.service';
import { SearchResponse } from '../scraping/scraping.types';
import { JURISPRUDENCIA_JURIS_TYPES, JURISPRUDENCIA_TRIBUNALS } from '../scraping/configs/jurisprudencia.config';
import { MCP_TOOLS, McpToolDefinition } from './mcp.tools';

// console.error (stderr), não Logger do Nest: o entrypoint stdio (mcp.server.ts)
// reserva stdout inteiro pro protocolo JSON-RPC do MCP, então nenhum log de
// negócio pode ir por ali — mesmo no transporte HTTP, que não tem essa restrição
// mas compartilha este módulo.
function logToolCall(tool: string, ms: number, outcome: 'ok' | 'error', detail?: string): void {
  const suffix = detail ? ` — ${detail}` : '';
  console.error(`[MCP] tool=${tool} outcome=${outcome} +${ms}ms${suffix}`);
}

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
    const start = Date.now();
    try {
      const result = await invokeTool(scraper, tool, args.q, args.page ?? 1);
      logToolCall(tool.name, Date.now() - start, 'ok', `query="${args.q}"`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logToolCall(tool.name, Date.now() - start, 'error', message);
      return { content: [{ type: 'text', text: `Erro: ${message}` }], isError: true };
    }
  }

  for (const tool of MCP_TOOLS.filter((t) => t.name !== 'jusbrasil_jurisprudencia')) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema },
      (args: { q: string; page?: number }) => handler(tool, args),
    );
  }

  const jurisprudenciaTool = MCP_TOOLS.find((t) => t.name === 'jusbrasil_jurisprudencia')!;
  const jurisprudenciaInputSchema = {
    ...inputSchema,
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Data inicial do julgado, formato AAAA-MM-DD'),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Data final do julgado, formato AAAA-MM-DD'),
    jurisType: z
      .enum(JURISPRUDENCIA_JURIS_TYPES)
      .optional()
      .describe('Tipo de julgado: ' + JURISPRUDENCIA_JURIS_TYPES.join(', ')),
    tribunal: z
      .array(z.enum(JURISPRUDENCIA_TRIBUNALS))
      .optional()
      .describe(
        'Um ou mais tribunais/órgãos julgadores para restringir a busca: ' +
          JURISPRUDENCIA_TRIBUNALS.join(', '),
      ),
  };

  server.registerTool(
    jurisprudenciaTool.name,
    { description: jurisprudenciaTool.description, inputSchema: jurisprudenciaInputSchema },
    async (args: {
      q: string;
      page?: number;
      dateFrom?: string;
      dateTo?: string;
      jurisType?: string;
      tribunal?: string[];
    }) => {
      const start = Date.now();
      const { q, page, tribunal, ...rawFilters } = args;
      const filters: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawFilters)) {
        if (value) filters[key] = value;
      }
      if (tribunal && tribunal.length > 0) filters.tribunal = tribunal.join(',');
      try {
        const result = await scraper.search(q, page ?? 1, filters).jurisprudencia();
        logToolCall(jurisprudenciaTool.name, Date.now() - start, 'ok', `query="${q}"`);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logToolCall(jurisprudenciaTool.name, Date.now() - start, 'error', message);
        return { content: [{ type: 'text' as const, text: `Erro: ${message}` }], isError: true };
      }
    },
  );

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
      const start = Date.now();
      try {
        const result = await scraper.getDocument(id);
        logToolCall('jusbrasil_get_document', Date.now() - start, 'ok', `id=${id}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logToolCall('jusbrasil_get_document', Date.now() - start, 'error', message);
        return { content: [{ type: 'text', text: `Erro: ${message}` }], isError: true };
      }
    },
  );
}
