import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpBootstrapModule } from './mcp-bootstrap.module';
import { ScraperService } from '../scraping/scraper.service';
import { registerJusbrasilTools } from './register-tools';

// Entrypoint stdio pra uso local (ex: Claude Desktop, ver docs/MCP.md) — spawna um
// processo Nest à parte. Pra uso remoto/online, ver o endpoint HTTP em
// src/mcp/mcp-http.controller.ts, exposto no mesmo processo da API REST.
async function main() {
  // logger: false — nada de log do Nest pode ir pro stdout, é o canal usado
  // pelo transporte MCP stdio pra falar JSON-RPC com o cliente.
  const appContext = await NestFactory.createApplicationContext(McpBootstrapModule, {
    logger: false,
  });
  const scraper = appContext.get(ScraperService);

  const server = new McpServer({
    name: 'jusbrasil-scraper-api',
    version: '1.0.0',
  });
  registerJusbrasilTools(server, scraper);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await appContext.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor MCP:', err);
  process.exit(1);
});
