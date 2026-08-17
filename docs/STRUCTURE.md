# Estrutura do projeto (NestJS)

```
jusbrasil-scraper-api/
├── .env / .env.example         # PORT + throttle (SCRAPE_MIN_DELAY_MS, SCRAPE_JITTER_MS,
│                                 SCRAPE_COOLDOWN_MS) + login opcional (docs/AUTH.md)
├── docker-compose.yml / Dockerfile   # deploy numa VPS própria, ver docs/DEPLOY.md
├── package.json                 # NestJS, puppeteer-extra (+ stealth), cheerio, node-cache
├── scripts/
│   ├── inspect.mjs              # ferramenta de dev: abre uma busca real no Jusbrasil via
│   │                              Puppeteer e salva o HTML em disco, pra recalibrar seletores
│   └── login.mjs                # login manual opcional, ver docs/AUTH.md
├── src/
│   ├── main.ts                  # bootstrap HTTP: Nest app, LoggingInterceptor global,
│   │                              enableShutdownHooks() (fecha o Chromium no SIGTERM)
│   ├── app.module.ts            # ConfigModule global + ThrottlerModule (rate limit 4/min,
│   │                              via APP_GUARD) + SearchModule + HealthModule + McpHttpModule
│   ├── common/
│   │   ├── browser.service.ts   # Chromium compartilhado (Puppeteer + stealth), perfil
│   │   │                          persistente (docs/AUTH.md); recupera sozinho um lock de
│   │   │                          profile travado por um container anterior morto sem passar
│   │   │                          por onModuleDestroy
│   │   ├── cache.service.ts     # cache em memória (node-cache), TTL 15 min
│   │   ├── throttle.service.ts  # fila serializada com espera mínima + jitter entre
│   │   │                          navegações reais; cooldown adaptativo após desafio anti-bot
│   │   └── logging.interceptor.ts   # log de acesso HTTP (método, rota, status, duração)
│   ├── scraping/
│   │   ├── scraper.service.ts   # search(query, page) devolve um objeto com um método por
│   │   │                          categoria (builder); getDocument(id) recupera o conteúdo
│   │   │                          completo. Ambos: cache -> throttle -> browser -> parse,
│   │   │                          com log de início/fim/erro de cada operação
│   │   ├── scraping.module.ts
│   │   ├── scraping.types.ts
│   │   ├── document-id.ts       # encode/decode do id opaco (categoria + link) usado por getDocument
│   │   └── configs/*.config.ts  # URL + seletores + mapItem por categoria (docs/SCRAPERS.md)
│   ├── search/
│   │   ├── search.controller.ts # as 6 rotas GET /api/* + GET /api/document
│   │   └── search.module.ts
│   ├── health/
│   │   ├── health.controller.ts # GET /health (fora do rate limit)
│   │   └── health.module.ts
│   └── mcp/
│       ├── mcp.server.ts          # entrypoint stdio separado (uso local, não sobe HTTP)
│       ├── mcp-bootstrap.module.ts   # contexto Nest mínimo pro stdio: ConfigModule + ScrapingModule
│       ├── mcp-http.controller.ts    # POST /mcp — mesmas tools via Streamable HTTP (uso remoto)
│       ├── mcp-http.module.ts
│       ├── register-tools.ts         # registro das 7 tools, compartilhado entre stdio e HTTP;
│       │                               loga cada chamada de tool via stderr (console.error)
│       └── mcp.tools.ts               # definição das 6 tools de busca (nome, descrição, método do ScraperService)
└── README.md
```

Ver `docs/MCP.md` para por que stdio e HTTP reaproveitam `register-tools.ts` sem duplicar
lógica, e `docs/DEPLOY.md` para como `docker-compose.yml`/`Dockerfile` empacotam tudo isso.

## Fluxo de uma requisição REST

```
GET /api/jurisprudencia?q=dano+moral
        │
        ▼
LoggingInterceptor         loga método/rota/status/duração no fim (common/logging.interceptor.ts)
        │
        ▼
SearchController            valida "page", monta "filters" a partir de dateFrom/dateTo/jurisType
                             (só em jurisprudencia), chama scraper.search(q, page, filters).jurisprudencia()
        │
        ▼
ScraperService.search(...).jurisprudencia()   → método privado run(config, query, page, filters)
        │
        ▼
ScraperService.run (privado)
   1. valida "filters" contra config.filterKeys (whitelist por categoria, ver docs/SCRAPERS.md)
   2. CacheService     — já tem resultado pra essa (categoria, query, página, filtros)? retorna direto
   3. ThrottleService  — espera a vez na fila (mín. delay + jitter; mais tempo se houve desafio recente)
   4. BrowserService   — abre uma aba isolada no Chromium compartilhado (withPage)
   5. goto(config.buildUrl(query, page, filters)) + waitForSelector opcional do config da categoria
   6. checa se é a página de desafio Cloudflare ("Um momento…") -> se for, aciona cooldown e lança 429
   7. parseia o HTML com Cheerio, aplica mapItem por card encontrado, gera o id de cada item
        │
        ▼
SearchController  responde JSON { query, page, filters?, count, results, source }
```

`GET /api/document?id=...` segue o mesmo caminho de cache/throttle/browser, mas via
`ScraperService.getDocument(id)` — decodifica o `id`, navega até a página do resultado e, se
for jurisprudência com link de "inteiro teor", navega até essa página em seguida antes de
extrair o conteúdo (ver `docs/SCRAPERS.md` e `docs/SNIPPET_ID.md`). Cada chamada de
`run`/`getDocument` loga início, fim (com duração) e erro via `Logger` do Nest.

## Fluxo via MCP

Igual ao REST a partir do `ScraperService` pra baixo (mesmo cache/throttle/browser). A
diferença é só a camada de entrada: `register-tools.ts` chama os mesmos métodos do
`ScraperService` e serializa o resultado como texto na resposta MCP, em vez de JSON HTTP —
ver `docs/MCP.md`.
