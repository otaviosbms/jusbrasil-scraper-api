# Arquitetura de busca: snippet + id + recuperação sob demanda

As buscas (`jusbrasil_jurisprudencia`, `jusbrasil_artigos`, etc., e seus
equivalentes REST em `docs/API.md`) retornam uma lista compacta de
candidatos — não o conteúdo completo de cada resultado. O objetivo é permitir
que o LLM/consumidor avalie relevância pelo `title`/`snippet` antes de pagar o
custo (tokens, latência, mais uma navegação real ao Jusbrasil) de buscar o
teor completo de algo que pode nem ser usado.

## Por quê

Uma busca que já retornasse o HTML/texto completo de cada resultado:

- multiplicaria por vários o volume de tokens de uma única chamada de busca;
- misturaria, no mesmo retorno, resultados relevantes e irrelevantes;
- exigiria uma navegação Playwright por resultado **antes** de saber se ele
  vale a pena — e cada navegação passa pelo throttle (~12–20s, ver
  `docs/ANTI_BOT.md`), então isso seria caro demais pra fazer "por garantia".

Separar descoberta (busca, barata) de recuperação (sob demanda, cara) resolve
os três pontos.

## Como funciona aqui

1. **Busca** (`ScraperService.run`, em `src/scraping/scraper.service.ts`):
   além dos campos específicos de cada categoria (ver `docs/SCRAPERS.md`),
   cada item do array `results` ganha um `id` — string opaca gerada por
   `encodeDocumentId(categoria, link)` (`src/scraping/document-id.ts`), ou
   `null` quando o item não tem `link`. Não é um ID de banco de dados: é só o
   par categoria+link codificado em base64url, o suficiente para reconstruir
   a navegação depois.

2. **Recuperação sob demanda** (`ScraperService.getDocument`, mesmo arquivo):
   dado um `id`, decodifica categoria+link, navega até a página real com o
   mesmo `BrowserService`/`CacheService`/`ThrottleService` das buscas (mesma
   detecção de desafio anti-bot, mesmo cache, mesmo throttle compartilhado) e
   extrai `title` + `content` (texto integral, heurístico — ver nota em
   `docs/API.md`).

   Exposta como:
   - REST: `GET /api/document?id=...`
   - MCP: tool `jusbrasil_get_document({ id })`

## Fluxo esperado de um agente/LLM

```text
jusbrasil_jurisprudencia({ q: "..." })
   ↓
lista de { id, title, snippet, ... }
   ↓
título/snippet já respondem? → responde direto
   │
   └── não → jusbrasil_get_document({ id }) do(s) item(ns) relevante(s)
                ↓
             { title, content }
                ↓
             responde
```

Não existe uma etapa intermediária de "contexto ao redor do trecho" (como um
`get_context` com chunks vizinhos) porque não há chunking aqui: cada resultado
de busca já é uma página inteira no Jusbrasil, então a única recuperação
adicional possível é a página completa via `get_document`.

## Por que reaproveita tudo

Igual ao restante do projeto (ver `docs/MCP.md`): `getDocument` não duplica
`BrowserService`/`CacheService`/`ThrottleService` — usa exatamente as mesmas
instâncias injetadas em `ScraperService`, então cache, throttle entre
navegações e detecção de desafio anti-bot valem igual para busca e para
recuperação de documento.
