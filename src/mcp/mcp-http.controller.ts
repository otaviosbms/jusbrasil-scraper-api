import { Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ScraperService } from '../scraping/scraper.service';
import { registerJusbrasilTools } from './register-tools';

const METHOD_NOT_ALLOWED = {
  jsonrpc: '2.0' as const,
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
};

// Endpoint MCP remoto (Streamable HTTP, ver docs/MCP.md) — modo stateless: cada
// requisição cria seu próprio McpServer + transport, sem sessão entre chamadas.
//
// Limite próprio (30/min, bem mais generoso que o padrão de 4/min das buscas)
// em vez de @SkipThrottle(): o handshake MCP (initialize, tools/list) sozinho
// já usa 2+ requisições por sessão de cliente, e não deve competir pela mesma
// cota apertada das buscas. A navegação real ao Jusbrasil continua limitada de
// verdade pelo ThrottleService (12-20s por navegação, injetado no
// ScraperService) — esse limite aqui é só contra abuso bruto de HTTP no
// endpoint em si, agora que o servidor está exposto publicamente (docs/DEPLOY.md).
@Controller('mcp')
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class McpHttpController {
  constructor(private readonly scraper: ScraperService) {}

  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response) {
    try {
      const server = new McpServer({ name: 'jusbrasil-scraper-api', version: '1.0.0' });
      registerJusbrasilTools(server, this.scraper);

      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  // Sem stream SSE nem sessão pra encerrar em modo stateless.
  @Get()
  handleGet(@Res() res: Response) {
    res.status(405).json(METHOD_NOT_ALLOWED);
  }

  @Delete()
  handleDelete(@Res() res: Response) {
    res.status(405).json(METHOD_NOT_ALLOWED);
  }
}
