# Estrutura do projeto (versão Express — pré-migração para NestJS)

Este documento é um retrato da implementação original em Express/JavaScript puro,
mantido como referência histórica da arquitetura e das decisões tomadas antes da
migração para NestJS.

```
jusbrasil-scraper-api/
├── .env / .env.example        # PORT + variáveis do throttle (SCRAPE_MIN_DELAY_MS, SCRAPE_JITTER_MS, SCRAPE_COOLDOWN_MS)
├── package.json                # express, playwright, cheerio, node-cache, express-rate-limit, dotenv
├── scripts/
│   └── inspect.js              # ferramenta de dev: abre uma busca real no Jusbrasil via Playwright
│                                # e salva o HTML em disco, para recalibrar seletores manualmente
├── src/
│   ├── server.js                # bootstrap do Express: monta rate limiter, rotas /api, /health, encerra o browser no SIGTERM/SIGINT
│   ├── routes/
│   │   └── search.js            # 1 rota GET por categoria, delega pro scraper correspondente, mapeia erro -> status HTTP
│   ├── scrapers/
│   │   ├── genericSearch.js     # factory createSearcher(config): cache -> throttle -> browser -> parse -> detecta desafio anti-bot
│   │   ├── consultaProcessual.js
│   │   ├── jurisprudencia.js
│   │   ├── doutrina.js
│   │   ├── artigos.js
│   │   ├── legislacao.js
│   │   └── diarios.js           # cada arquivo só define URL de busca + seletores CSS + mapItem (shape do resultado)
│   └── utils/
│       ├── browser.js           # instância única do Chromium (Playwright), 1 BrowserContext isolado por request
│       ├── cache.js              # cache em memória (node-cache), TTL 15 min, chave (categoria:query:página)
│       ├── rateLimit.js          # express-rate-limit: 4 requisições/min por instância da API
│       └── throttle.js           # fila serializada com espera mínima + jitter entre navegações reais ao site;
│                                  # cooldown adaptativo quando um desafio anti-bot é detectado
└── README.md
```

## Fluxo de uma requisição

```
GET /api/jurisprudencia?q=dano+moral
        │
        ▼
routes/search.js           valida "q", chama o scraper certo, mapeia erro -> status
        │
        ▼
scrapers/jurisprudencia.js  define URL + seletores, delega pro createSearcher
        │
        ▼
scrapers/genericSearch.js
   1. cache.js     — já tem resultado pra essa (categoria, query, página)? retorna direto
   2. throttle.js  — espera a vez na fila (mín. delay + jitter; mais tempo se houve desafio recente)
   3. browser.js   — abre uma aba isolada no Chromium compartilhado
   4. goto(url) + waitForSelector(seletor de resultado)
   5. checa se a página é o desafio Cloudflare ("Um momento…") -> se for, marca cooldown e lança erro
   6. parseia o HTML com Cheerio, aplica mapItem por card encontrado
        │
        ▼
routes/search.js  responde JSON { query, page, count, results, source }
```
