# Seletores e formato de resultado por categoria

Todos calibrados contra o HTML real do Jusbrasil (não são suposições) rodando
`scripts/inspect.mjs` e inspecionando com Cheerio. As classes CSS usam CSS
Modules com hash (`heading_root__J_K7z`) — por isso os seletores usam
`[class*="..."]` (contém) em vez de igualdade exata, para sobreviver a
pequenas mudanças de build. Isso **não é garantia** de estabilidade: o
Jusbrasil não documenta a marcação e pode mudar a estrutura inteira a
qualquer momento.

## Padrão comum (jurisprudência, artigos, legislação, diários)

Card: `article[class*="SearchSnippetBase"]`
Título/link: `h2 a`
Trecho: `[class*="snippet-content_root"]`
Legenda (tipo/data/autor-tribunal): spans não vazios dentro de `[class*="shared-styles_caption__"] > span`

| Categoria | Campos extras na legenda | Observação |
|---|---|---|
| `jurisprudencia` | categoria, tipo de documento (ex: Acórdão) | `court`/tribunal real vem embutido no título (ex: "TJ-GO - ...") |
| `artigos` | tipo, data de publicação, autor | |
| `diarios` | tipo, data de publicação, publicação/tribunal | |
| `legislacao` | tipo, autoridade (ex: Presidência da República) | **resultados aninhados** (artigos específicos dentro da mesma lei) não têm `h2` próprio e são descartados — só a lei "pai" aparece |

## Doutrina (padrão diferente)

Card: `[class*="doctrine-cover_snippet"]`
Título/link: `h2 a`
Legenda: editora, ano de publicação, autor (mesmos spans de legenda, mas sem bloco de trecho — é um livro, não um snippet de texto)

## Consulta processual (formato totalmente diferente)

URL correta: `https://www.jusbrasil.com.br/consulta-processual/busca?q=...`
(**não** `/consulta-processual/?q=...` — essa é a landing page, sem resultados)

Essa busca é por **nome, CPF ou CNPJ**, não busca full-text de conteúdo de
processo. O resultado é uma lista de pessoas/empresas que combinam com o
termo, cada uma linkando para uma página de processos vinculados (que o
scraper não segue automaticamente).

Card: `a[class*="person-summary_card__"]` (o link é o próprio card, não algo aninhado)
Nome: `[class*="person-summary_card__name__title__OUGft"] span`
Nome relacionado (ex: sócio de uma empresa): `[class*="person-summary_card__name__title__caption"]`
Tipo (pessoa/empresa): presença de `[class*="person-summary_icon--company"]`
CNPJ/localização: spans não vazios em `[class*="person-summary_card__info__"] [class*="shared-styles_caption__"] > span`

## `id` de cada resultado e recuperação sob demanda

Além dos campos acima, cada item recebe um `id` (gerado centralmente no
método privado `ScraperService.run`, não em cada `config.ts`) a partir de
`config.name` + `link`, via `encodeDocumentId` em
`src/scraping/document-id.ts`. Itens sem
`link` (não deveria acontecer, mas `mapItem` pode em teoria omitir) recebem
`id: null`.

Esse `id` é o que `ScraperService.getDocument`/`GET /api/document`/tool MCP
`jusbrasil_get_document` usam pra navegar até a página completa depois — ver
`docs/SNIPPET_ID.md`. Diferente dos seletores de listagem acima, a extração
de conteúdo completo (`getDocument`) **não é calibrada por categoria**: usa
`article, main, [class*="content"], [class*="text"]` como heurística genérica,
mas fica com o candidato de **mais texto** entre os que casarem (não o
primeiro do DOM — que costuma ser um link de acessibilidade tipo "Pular para
conteúdo principal"), com fallback pro `<body>` inteiro. Se isso se mostrar
insuficiente pra alguma categoria específica, o próximo passo é calibrar
seletores por categoria do mesmo jeito que os de listagem (rodar
`npm run inspect -- <categoria> <query>` numa página de detalhe real, não só
na busca).

Especificamente pra `jurisprudencia`, a página de resultado normalmente só
mostra a ementa (resumo) do acórdão — o texto integral vive numa página
separada, linkada por um `a[href*="/inteiro-teor-"]`. Quando esse link existe,
`getDocument` navega até ele antes de extrair o conteúdo, então `source` na
resposta aponta pro inteiro teor, não pra página de resultado original.

## Filtro avançado de `jurisprudencia`

A busca web de jurisprudência tem 3 filtros (chips acima da lista de
resultados): "Tipo de julgado", "Tribunal" e uma data. Calibrados navegando a
busca real e lendo a URL resultante de cada opção (não suposição):

| Chip na busca web | Parâmetro de URL | Valores confirmados |
|---|---|---|
| Tipo de julgado | `jurisType` | `sumula`, `acordao`, `decisao`, `sentenca`, `despacho`, `orientacao_jurisprudencial` ("Todos os julgados" = sem parâmetro) |
| (intervalo de data explícito) | `dateFrom` / `dateTo` | `AAAA-MM-DD` |
| Tribunal | `tribunal` (repetível) | ver lista de siglas abaixo |

O chip de data também oferece atalhos relativos ("Último mês", "Último ano"
etc.), que geram um parâmetro `l` (ex: `l=365dias` pra "Último ano") em vez
de `dateFrom`/`dateTo` — não implementado aqui porque `dateFrom`/`dateTo`
(o formato do exemplo original que motivou este filtro) já cobre o mesmo
caso de uso de forma explícita e sem depender da data em que a requisição é
feita.

O chip "Tribunal" abre um diálogo em árvore com uma lista de tribunais/órgãos
julgadores, todos marcados por padrão (equivalente a "sem filtro"). Marcar só
alguns e clicar "Filtrar" gera um parâmetro `tribunal` **repetido na URL** por
item selecionado (ex: `tribunal=stf&tribunal=stj` — não é lista separada por
vírgula na URL do Jusbrasil, embora este projeto aceite vírgula na própria
API, ver `docs/API.md`), confirmado navegando a busca real e depois lendo o
filtro `court`/`operator: "in"` aplicado no lado do servidor
(`__NEXT_DATA__.props.pageProps.variables.filters`). O valor de cada item é a
sigla exibida no diálogo em minúsculas, com `-` trocado por `_`:

`stf, stj, tst, tjs, trfs, trts, tse, tres, stm, tjms, tcu, tces, tat_ms,
tat_sc, tit_sp, cat_go, tnu, tru, cnj, carf, anac, ancine, aneel, antaq,
antt, cade, cfm`

(siglas originais no diálogo, antes da normalização: `STF, STJ, TST, TJs,
TRFs, TRTs, TSE, TREs, STM, TJMs, TCU, TCEs, TAT-MS, TAT-SC, TIT-SP, CAT-GO,
TNU, TRU, CNJ, CARF, ANAC, ANCINE, ANEEL, ANTAQ, ANTT, CADE, CFM`)

`filterKeys` em `CategoryConfig` (`src/scraping/scraping.types.ts`) é a lista
branca de parâmetros de filtro aceitos por categoria — hoje só
`jurisprudencia` define algum. `ScraperService.run` rejeita com `400`
qualquer chave de filtro fora dessa lista (quando o controller da categoria
de fato repassa algum filtro — ver nota em `docs/API.md`), e valida
especificamente o formato de `dateFrom`/`dateTo`, o enum de `jurisType` e a
lista de `tribunal` antes de montar a URL. `jurisprudencia.config.ts` traduz
o `tribunal` separado por vírgula da API deste projeto para o formato de
parâmetro repetido que o Jusbrasil espera.

## Detecção de bloqueio anti-bot

Página de desafio Cloudflare identificada por:
- `<title>` igual a `"Um momento…"`, ou
- presença de `<script src*="challenges.cloudflare.com">`

Quando detectada, o scraper **não tenta resolver nada** — lança um erro
explícito e aciona o cooldown do throttle (ver `docs/ANTI_BOT.md`).
