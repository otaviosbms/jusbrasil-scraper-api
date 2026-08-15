# Referência da API

Todos os endpoints de busca aceitam `q` (obrigatório) e `page` (opcional, padrão `1`).

| Endpoint | Categoria | Formato da query |
|---|---|---|
| `GET /api/consulta-processual` | Consulta processual | nome, CPF ou CNPJ |
| `GET /api/jurisprudencia` | Jurisprudência | texto livre |
| `GET /api/doutrina` | Doutrina | texto livre |
| `GET /api/artigos` | Artigos | texto livre |
| `GET /api/legislacao` | Legislação | texto livre |
| `GET /api/diarios` | Diários oficiais | texto livre |
| `GET /api/document` | Recuperação sob demanda | `id` de um item retornado numa busca acima |

`GET /health` → `{ "status": "ok" }`

## Resposta de sucesso (busca)

```json
{
  "query": "dano moral",
  "page": 1,
  "count": 10,
  "results": [ { "id": "...", "...": "demais campos variam por categoria, ver docs/SCRAPERS.md" } ],
  "source": "https://www.jusbrasil.com.br/jurisprudencia/busca?q=dano+moral&p=1"
}
```

Cada item de `results` traz um `id` (string opaca, ou `null` quando o item não tem
`link`) junto com `title`/`snippet`/demais campos da categoria — ver
`docs/SNIPPET_ID.md` para o raciocínio por trás dessa arquitetura de busca +
recuperação sob demanda.

## Recuperação sob demanda: `GET /api/document?id=...`

Recupera o conteúdo completo (`title` + `content` com o texto integral, sem o
HTML) da página vinculada a um resultado de busca anterior, usando o `id`
retornado naquele resultado. Pensado para ser chamado só quando o
`title`/`snippet` do item já obtido pela busca não bastarem para responder —
evita trazer o teor completo de resultados que não serão usados.

```json
{
  "id": "anVyaXNwcnVkZW5jaWE6Omh0dHBzOi8v...",
  "category": "jurisprudencia",
  "title": "TJ-GO - Apelação Cível: ...",
  "content": "texto completo extraído da página...",
  "source": "https://www.jusbrasil.com.br/jurisprudencia/..."
}
```

A extração de `content` é heurística (não calibrada seletor a seletor por
categoria como as buscas — ver `docs/SCRAPERS.md`): entre os candidatos que
casam com `article, main, [class*="content"], [class*="text"]` (após remover
script/style/nav/header/footer), fica com o que tiver mais texto — não o
primeiro do DOM, que costuma ser só um link de acessibilidade ("Pular para
conteúdo principal"). Fallback pro `<body>` inteiro se nada casar. Para
`jurisprudencia`, se a página do resultado tiver um link de "inteiro teor"
(o acórdão completo, separado da ementa/resumo), esse link é seguido antes de
extrair o conteúdo. Mesmo assim pode trazer ruído dependendo do template da
página de destino.

## Respostas de erro

| Status | Quando |
|---|---|
| `400` | `q` ausente ou vazio (buscas), ou `id` ausente/inválido (`/api/document`) |
| `429` | verificação anti-bot do Jusbrasil detectada nessa busca, ou rate limit da própria API estourado |
| `502` | qualquer outra falha na navegação/extração, incluindo quando `/api/document` não consegue extrair nenhum texto da página |

## Rate limiting

4 requisições/min por instância da API (`ThrottlerModule`, configurado em
`src/app.module.ts` e aplicado globalmente via `ThrottlerGuard`), independente
do espaçamento interno das navegações reais ao Jusbrasil (ver `docs/ANTI_BOT.md`).
`GET /health` fica fora desse limite.
