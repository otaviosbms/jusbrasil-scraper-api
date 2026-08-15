# Camada de compatibilidade MCP

Além da API REST (`src/main.ts`, `GET /api/*`), o projeto expõe as mesmas
buscas como um servidor [MCP](https://modelcontextprotocol.io) via stdio —
para uso direto por clientes MCP (Claude Desktop, outros agentes), sem passar
por HTTP.

## Por que reaproveita tudo

O servidor MCP (`src/mcp/mcp.server.ts`) **não duplica** lógica de scraping.
Ele sobe um `NestFactory.createApplicationContext` mínimo (só `ConfigModule` +
`ScrapingModule`, sem HTTP, sem `ThrottlerModule`/guard — que só faz sentido
pra requisições HTTP) e injeta o mesmo `ScraperService` usado pelo
`SearchController`. Cache, throttle entre navegações e detecção de desafio
anti-bot (ver `docs/ANTI_BOT.md`) continuam valendo exatamente do mesmo jeito.

## Ferramentas expostas

Uma tool MCP de busca por categoria, definidas em `src/mcp/mcp.tools.ts`,
mais uma tool de recuperação registrada diretamente em `src/mcp/mcp.server.ts`:

| Tool | Categoria |
|---|---|
| `jusbrasil_consulta_processual` | nome/CPF/CNPJ → pessoas/empresas |
| `jusbrasil_jurisprudencia` | jurisprudência |
| `jusbrasil_doutrina` | doutrina |
| `jusbrasil_artigos` | artigos |
| `jusbrasil_legislacao` | legislação |
| `jusbrasil_diarios` | diários oficiais |
| `jusbrasil_get_document` | recupera o conteúdo completo de um item retornado por uma das buscas acima |

As tools de busca aceitam os mesmos parâmetros: `q` (obrigatório) e `page`
(opcional, padrão 1). O retorno é o mesmo JSON da API REST (`{ query, page,
count, results, source }`), serializado como um bloco de texto no `content`
da resposta MCP. Cada item de `results` inclui um `id` — ver
`docs/SNIPPET_ID.md` para a arquitetura de busca compacta (snippet) +
recuperação sob demanda.

`jusbrasil_get_document` aceita apenas `id` (o valor retornado num item de
busca anterior) e devolve `{ id, category, title, content, source }` com o
texto completo da página. Em caso de erro (query vazia, `id` inválido ou
desafio anti-bot detectado), qualquer tool responde com `isError: true` e uma
mensagem, em vez de derrubar o processo.

## Rodando

```bash
npm run build
npm run start:mcp     # sobe o servidor MCP via stdio (dist/mcp/mcp.server.js)
```

Não há porta HTTP nem endpoint — a comunicação é inteiramente por
stdin/stdout no formato JSON-RPC do MCP. Por isso o bootstrap usa
`logger: false` no `createApplicationContext`: qualquer log do Nest no stdout
quebraria o protocolo.

## Configurando num cliente MCP

Exemplo de entrada em `mcpServers` (formato usado por Claude Desktop e
compatíveis):

```json
{
  "mcpServers": {
    "jusbrasil-scraper": {
      "command": "node",
      "args": ["/caminho/absoluto/para/jusbrasil-scraper-api/dist/mcp/mcp.server.js"],
      "env": {
        "SCRAPE_MIN_DELAY_MS": "12000",
        "SCRAPE_JITTER_MS": "8000",
        "SCRAPE_COOLDOWN_MS": "300000"
      }
    }
  }
}
```

Rode `npm run build` antes de apontar o cliente pro `dist/`, e mantenha o
`.env`/variáveis de ambiente coerentes com o resto do projeto (mesmas
variáveis de throttle descritas em `docs/ANTI_BOT.md`).

## Limitação importante pro uso via agente/MCP

Um cliente MCP pode disparar várias chamadas de tool em sequência rápida
(ex: um agente iterando por várias categorias). Como o throttle é
compartilhado (uma fila só, no processo do servidor MCP), essas chamadas são
serializadas com o mesmo espaçamento mínimo da API REST — ou seja, N tools
chamadas em sequência levam pelo menos N × ~12–20s pra completar. Isso é
proposital (ver `docs/ANTI_BOT.md`); não é um bug de performance a corrigir
paralelizando as chamadas ao Jusbrasil.

## Nota sobre a versão do SDK

`@modelcontextprotocol/sdk` está fixado em `1.13.3` (não em range `^`) de
propósito: versões mais novas (a partir de ~1.14) introduzem uma camada de
compatibilidade Zod 3/4 (`ZodRawShapeCompat`) cujos tipos TypeScript
disparam `TS2589 (Type instantiation is excessively deep)` ao registrar as 6
tools num loop, mesmo isolando a inferência em funções auxiliares tipadas
explicitamente. Antes de atualizar essa dependência, valide que `npm run
build` continua passando.
