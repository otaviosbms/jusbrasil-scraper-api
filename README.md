# jusbrasil-scraper-api

API não oficial (NestJS + Playwright + Cheerio) que expõe buscas no Jusbrasil
tanto via REST quanto via [MCP](https://modelcontextprotocol.io) (stdio). O
site tem proteção anti-bot (Cloudflare) e bloqueia requisições HTTP
simples/curl, por isso a extração usa um navegador real (Chromium headless
via Playwright) para renderizar as páginas antes de extrair os resultados
com Cheerio.

Documentação detalhada em [`docs/`](./docs):
- [`docs/STRUCTURE.md`](./docs/STRUCTURE.md) — estrutura de pastas e fluxo de uma requisição
- [`docs/SCRAPERS.md`](./docs/SCRAPERS.md) — seletores e formato de resultado por categoria
- [`docs/ANTI_BOT.md`](./docs/ANTI_BOT.md) — como o throttle e a detecção de desafio funcionam
- [`docs/API.md`](./docs/API.md) — referência completa dos endpoints REST
- [`docs/MCP.md`](./docs/MCP.md) — camada de compatibilidade MCP: tools, configuração num cliente, limitações
- [`docs/SNIPPET_ID.md`](./docs/SNIPPET_ID.md) — arquitetura de busca (id + snippet) e recuperação sob demanda do conteúdo completo
- [`docs/AUTH.md`](./docs/AUTH.md) — camada opcional de login (sessão autenticada), incluindo por que eleva o risco do aviso legal abaixo

## ⚠️ Aviso legal

- Isto **não é** uma API oficial do Jusbrasil e não tem relação com a empresa.
- Os Termos de Uso do Jusbrasil restringem raspagem automatizada do site. Este projeto foi criado para **estudo/uso pessoal**, com rate limit baixo e espaçamento entre requisições por padrão. Uso comercial, redistribuição dos dados extraídos ou volume alto de requisições pode violar os termos do site e trazer risco jurídico — a responsabilidade de avaliar isso é sua.
- Dados de processos judiciais podem conter informação pessoal sensível (LGPD). Não redistribua nem armazene esses dados sem base legal adequada.
- O projeto **não** contorna a proteção anti-bot do site (sem solver de captcha, sem spoofing, sem proxies) — apenas espaça as requisições reais e reage de forma explícita quando um desafio é detectado. Ver [`docs/ANTI_BOT.md`](./docs/ANTI_BOT.md).
- Existe uma camada **opcional** de login (sessão autenticada numa conta Jusbrasil sua) pra acessar conteúdo de assinante — ela eleva o risco acima descrito (a maioria dos planos pagos proíbe uso automatizado da conta, mesmo por assinante legítimo) e **não deve ser usada** pra redistribuir conteúdo pago. Ver [`docs/AUTH.md`](./docs/AUTH.md) antes de configurar.

## Setup

```bash
cd jusbrasil-scraper-api
npm install          # também baixa o Chromium do Playwright via postinstall
cp .env.example .env
npm run start:dev    # modo watch
# ou
npm run build && npm run start:prod
```

Servidor sobe em `http://localhost:3000`.

## Endpoints

Ver [`docs/API.md`](./docs/API.md) para a referência completa. Resumo:

| Endpoint | Categoria |
|---|---|
| `GET /api/consulta-processual?q=...` | Consulta processual (nome/CPF/CNPJ) |
| `GET /api/jurisprudencia?q=...` | Jurisprudência |
| `GET /api/doutrina?q=...` | Doutrina |
| `GET /api/artigos?q=...` | Artigos |
| `GET /api/legislacao?q=...` | Legislação |
| `GET /api/diarios?q=...` | Diários oficiais |
| `GET /api/document?id=...` | Conteúdo completo de um item retornado numa busca acima |
| `GET /health` | health check |

```bash
curl "http://localhost:3000/api/jurisprudencia?q=dano+moral&page=1"

# id vem no campo "id" de um item do resultado acima
curl "http://localhost:3000/api/document?id=<id-do-resultado>"
```

Cada item de busca já vem com `title`/`snippet`; `/api/document` só deve ser
chamado quando isso não for suficiente — ver
[`docs/SNIPPET_ID.md`](./docs/SNIPPET_ID.md).

## Servidor MCP

Além da API REST, as mesmas buscas ficam disponíveis como tools MCP via
stdio, reaproveitando o mesmo `ScraperService` (mesmo cache, throttle e
detecção de anti-bot):

```bash
npm run build
npm run start:mcp
```

Ver [`docs/MCP.md`](./docs/MCP.md) para a lista de tools, como configurar num
cliente MCP (ex: Claude Desktop) e uma observação importante sobre a versão
fixada do `@modelcontextprotocol/sdk`.

## Login opcional (sessão autenticada)

```bash
# no .env: JUSBRASIL_EMAIL=... e JUSBRASIL_PASSWORD=...
npm run login
```

Abre um navegador visível, faz login uma vez e salva a sessão localmente; a
API e o MCP passam a reaproveitá-la automaticamente em toda navegação, sem
mudar a forma de chamar nada. **Leia [`docs/AUTH.md`](./docs/AUTH.md) antes**
— é um passo opcional que eleva o risco descrito no aviso legal acima.

## Sobre os seletores CSS (importante)

O Jusbrasil não publica documentação da sua marcação HTML, e ela muda sem
aviso. Os seletores usados já foram calibrados contra o HTML real (ver
[`docs/SCRAPERS.md`](./docs/SCRAPERS.md)), mas podem quebrar no futuro. Para
recalibrar:

```bash
npm run inspect -- jurisprudencia "dano moral"
```

Isso salva o HTML real em `scripts/output-jurisprudencia.html`. Compare com
os seletores em `src/scraping/configs/jurisprudencia.config.ts` e ajuste.

## Arquitetura (NestJS)

```
src/
├── main.ts               # bootstrap
├── app.module.ts          # ConfigModule global + ThrottlerModule (rate limit 4/min)
├── common/
│   ├── browser.service.ts   # Chromium compartilhado (Playwright); carrega sessão de login se existir (docs/AUTH.md)
│   ├── cache.service.ts     # cache em memória, TTL 15 min
│   └── throttle.service.ts  # fila serializada + cooldown adaptativo (ver docs/ANTI_BOT.md)
├── scraping/
│   ├── scraper.service.ts    # orquestra cache -> throttle -> browser -> parse, por categoria
│   ├── scraping.module.ts
│   ├── scraping.types.ts
│   ├── document-id.ts         # encode/decode do id opaco (categoria + link) usado por getDocument
│   └── configs/*.config.ts   # URL + seletores + mapItem por categoria (ver docs/SCRAPERS.md)
├── search/
│   ├── search.controller.ts  # as 6 rotas GET /api/* + GET /api/document
│   └── search.module.ts
├── health/
│   ├── health.controller.ts  # GET /health (fora do rate limit)
│   └── health.module.ts
└── mcp/
    ├── mcp.server.ts          # entrypoint stdio separado (não sobe HTTP); registra também jusbrasil_get_document
    ├── mcp-bootstrap.module.ts   # contexto Nest mínimo: ConfigModule + ScrapingModule
    └── mcp.tools.ts               # definição das 6 tools de busca (nome, descrição, método do ScraperService)
```

## Limitações conhecidas

Ver [`docs/ANTI_BOT.md`](./docs/ANTI_BOT.md) e [`docs/SCRAPERS.md`](./docs/SCRAPERS.md) para detalhes. Resumo:

- Cloudflare pode bloquear sob uso repetido — comportamento esperado e documentado, não um bug.
- `legislacao`: resultados aninhados (artigos dentro de uma lei) são descartados, só a lei "pai" aparece.
- `consulta-processual`: espera nome/CPF/CNPJ, não busca full-text; não segue automaticamente o link para a página de processos de cada pessoa/empresa (pode ser recuperado sob demanda via `GET /api/document`/`jusbrasil_get_document`, ver `docs/SNIPPET_ID.md`).
- `GET /api/document`/`jusbrasil_get_document`: extração de conteúdo completo é heurística (seletor genérico, não calibrado por categoria como as buscas) — ver `docs/SCRAPERS.md`.
- Sem paginação "carregar mais" via scroll infinito, só o parâmetro `page`/`p` na URL.
- Sem autenticação/login — apenas conteúdo público de busca.
