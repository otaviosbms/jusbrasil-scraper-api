# Referência da API

Todos os endpoints de busca aceitam `q` (obrigatório) e `page` (opcional, padrão `1`).

| Endpoint | Categoria | Formato da query |
|---|---|---|
| `GET /api/consulta-processual` | Consulta processual | nome, CPF ou CNPJ |
| `GET /api/jurisprudencia` | Jurisprudência | texto livre — aceita filtros, ver abaixo |
| `GET /api/doutrina` | Doutrina | texto livre |
| `GET /api/artigos` | Artigos | texto livre |
| `GET /api/legislacao` | Legislação | texto livre |
| `GET /api/diarios` | Diários oficiais | texto livre |
| `GET /api/document` | Recuperação sob demanda | `id` de um item retornado numa busca acima |

`GET /health` → `{ "status": "ok" }`

## Filtros de `GET /api/jurisprudencia`

Mesmos parâmetros aceitos pelo filtro avançado da busca web do Jusbrasil
(confirmado navegando a busca real, não suposição — ver `docs/SCRAPERS.md`),
todos opcionais e combináveis entre si:

| Parâmetro | Formato | Efeito |
|---|---|---|
| `dateFrom` | `AAAA-MM-DD` | limita a data do julgado a partir desse dia (inclusive) |
| `dateTo` | `AAAA-MM-DD` | limita a data do julgado até esse dia (inclusive) |
| `jurisType` | um de `sumula`, `acordao`, `decisao`, `sentenca`, `despacho`, `orientacao_jurisprudencial` | limita ao tipo de julgado selecionado |
| `tribunal` | um ou mais de `stf`, `stj`, `tst`, `tjs`, `trfs`, `trts`, `tse`, `tres`, `stm`, `tjms`, `tcu`, `tces`, `tat_ms`, `tat_sc`, `tit_sp`, `cat_go`, `tnu`, `tru`, `cnj`, `carf`, `anac`, `ancine`, `aneel`, `antaq`, `antt`, `cade`, `cfm`, separados por vírgula (ex: `tribunal=stf,stj`) | limita ao(s) tribunal(is)/órgão(s) julgador(es) selecionado(s) |

```bash
curl "http://localhost:3000/api/jurisprudencia?q=dispensa+discriminatoria&dateFrom=2005-11-11&dateTo=2025-11-11&jurisType=sumula&tribunal=tst"
```

Um `jurisType` fora da lista acima, um `tribunal` (ou item de uma lista
separada por vírgula) fora da lista acima, ou uma data fora do formato
`AAAA-MM-DD` devolvem `400`. Quando pelo menos um filtro é aplicado, a
resposta ecoa os filtros efetivamente usados em `filters` (ver formato de
resposta abaixo).

As demais categorias (`consulta-processual`, `doutrina`, `artigos`,
`legislacao`, `diarios`) não têm filtro próprio: seus controllers REST não
declaram `dateFrom`/`jurisType`/`tribunal`/etc., então um parâmetro desses na
URL é simplesmente ignorado pelo NestJS (não chega a validar nem gerar erro)
— comportamento padrão de query string não declarada, não um `400`
proposital. A validação de `400` por filtro não suportado
(`ScraperService.validateFilters`, ver `docs/SCRAPERS.md`) só é alcançável
hoje através de `jurisprudencia`, a única categoria cujo controller de fato
coleta e repassa filtros.

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

O campo `filters` só aparece quando pelo menos um filtro foi aplicado (hoje,
só em `jurisprudencia` — ver seção acima):

```json
{
  "query": "dispensa discriminatoria",
  "page": 1,
  "filters": { "dateFrom": "2005-11-11", "dateTo": "2025-11-11", "jurisType": "sumula", "tribunal": "tst" },
  "count": 1,
  "results": [ "..." ],
  "source": "https://www.jusbrasil.com.br/jurisprudencia/busca?q=dispensa+discriminatoria&p=1&dateFrom=2005-11-11&dateTo=2025-11-11&jurisType=sumula&tribunal=tst"
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
| `400` | `q` ausente ou vazio (buscas), `id` ausente/inválido (`/api/document`), ou filtro de `jurisprudencia` inválido (ver seção de filtros acima) |
| `429` | verificação anti-bot do Jusbrasil detectada nessa busca, ou rate limit da própria API estourado |
| `502` | qualquer outra falha na navegação/extração, incluindo quando `/api/document` não consegue extrair nenhum texto da página |

## Rate limiting

4 requisições/min por instância da API (`ThrottlerModule`, configurado em
`src/app.module.ts` e aplicado globalmente via `ThrottlerGuard`), independente
do espaçamento interno das navegações reais ao Jusbrasil (ver `docs/ANTI_BOT.md`).
`GET /health` fica fora desse limite.
