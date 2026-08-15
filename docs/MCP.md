# Camada de compatibilidade MCP

Além da API REST (`src/main.ts`, `GET /api/*`), o projeto expõe as mesmas
buscas como servidor [MCP](https://modelcontextprotocol.io), de **duas**
formas:

| Transporte | Onde | Uso |
|---|---|---|
| Stdio | `src/mcp/mcp.server.ts`, processo separado (`npm run start:mcp`) | local — Claude Desktop e outros clientes que spawnam um processo |
| HTTP (Streamable HTTP) | `src/mcp/mcp-http.controller.ts`, rota `POST /mcp` no mesmo processo da API REST | remoto — qualquer cliente MCP que fale HTTP, incluindo o próprio deploy online |

Ambos expõem exatamente as mesmas 7 tools, com o mesmo comportamento — só o
transporte muda. Não precisa escolher um: os dois ficam disponíveis ao mesmo
tempo (o stdio é opcional, só roda se você chamar `npm run start:mcp`
separadamente).

## Por que reaproveita tudo

Nenhum dos dois transportes duplica lógica de scraping ou de registro de
tools — ambos chamam `registerJusbrasilTools(server, scraper)`
(`src/mcp/register-tools.ts`), que registra as mesmas 7 tools num `McpServer`
recebido de fora. A diferença é só como cada um obtém o `ScraperService` e
qual `Transport` usa:

- **stdio**: sobe um `NestFactory.createApplicationContext` mínimo (só
  `ConfigModule` + `ScrapingModule`, sem HTTP, sem `ThrottlerModule`/guard —
  que só faz sentido pra requisições HTTP) e conecta um `StdioServerTransport`.
- **HTTP**: `McpHttpController` já roda dentro do mesmo processo/contexto Nest
  da API REST, injeta o `ScraperService` normalmente via DI, e conecta um
  `StreamableHTTPServerTransport` por requisição (modo stateless — ver
  abaixo).

Em ambos os casos, cache, throttle entre navegações e detecção de desafio
anti-bot (`docs/ANTI_BOT.md`) continuam valendo exatamente do mesmo jeito,
porque é o mesmo `ScraperService` por trás.

## Ferramentas expostas

Uma tool MCP de busca por categoria, definidas em `src/mcp/mcp.tools.ts`,
mais uma tool de recuperação — todas registradas por
`src/mcp/register-tools.ts`:

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

## Rodando via HTTP (remoto)

Nenhum passo extra: sobe junto com a API REST.

```bash
npm run build
npm run start:prod    # ou start:dev — o endpoint /mcp já sobe junto
```

`POST /mcp` fala [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
— o transporte HTTP atual do protocolo MCP (substitui o antigo SSE-only).
Requer os headers `Content-Type: application/json` e
`Accept: application/json, text/event-stream`. `GET`/`DELETE /mcp` respondem
`405` de propósito: o endpoint roda em **modo stateless**
(`sessionIdGenerator: undefined`) — cada requisição cria seu próprio
`McpServer`/`transport`, sem sessão nem stream compartilhado entre chamadas.
Isso significa que cada chamada de tool é uma requisição HTTP independente,
o que combina bem com o resto do projeto (cache/throttle já vivem no
`ScraperService`, não numa sessão MCP) e evita ter que gerenciar estado de
sessão em memória num servidor que pode reiniciar/escalar.

Exemplo de entrada em `mcpServers` pra um cliente que suporta MCP remoto via
HTTP:

```json
{
  "mcpServers": {
    "jusbrasil-scraper": {
      "url": "https://<seu-deploy>/mcp"
    }
  }
}
```

(O formato exato dessa entrada depende do cliente — alguns usam `url`
diretamente, outros exigem um campo `type: "http"` explícito.)

## Rodando via stdio (local)

```bash
npm run build
npm run start:mcp     # sobe o servidor MCP via stdio (dist/mcp/mcp.server.js)
```

Só stdin/stdout no formato JSON-RPC do MCP, sem porta HTTP nesse processo.
Por isso o bootstrap usa `logger: false` no `createApplicationContext`:
qualquer log do Nest no stdout quebraria o protocolo.

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

## Limitação importante pro uso via agente/MCP (qualquer transporte)

Um cliente MCP pode disparar várias chamadas de tool em sequência rápida
(ex: um agente iterando por várias categorias). Como o throttle é
compartilhado no processo (uma fila só no `ThrottleService`), essas chamadas
são serializadas com o mesmo espaçamento mínimo da API REST — ou seja, N
tools chamadas em sequência levam pelo menos N × ~12–20s pra completar. Isso
é proposital (ver `docs/ANTI_BOT.md`); não é um bug de performance a corrigir
paralelizando as chamadas ao Jusbrasil.

No transporte HTTP isso vale por processo/instância: se o deploy rodar mais
de uma instância sem afinidade de sessão, cada uma tem sua própria fila de
throttle — o espaçamento continua valendo por instância, não globalmente.

## Nota sobre a versão do SDK

`@modelcontextprotocol/sdk` está fixado em `1.13.3` (não em range `^`) de
propósito: versões mais novas (a partir de ~1.14) introduzem uma camada de
compatibilidade Zod 3/4 (`ZodRawShapeCompat`) cujos tipos TypeScript
disparam `TS2589 (Type instantiation is excessively deep)` ao registrar as 7
tools num loop, mesmo isolando a inferência em funções auxiliares tipadas
explicitamente. Antes de atualizar essa dependência, valide que `npm run
build` continua passando.
