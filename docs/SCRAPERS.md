# Seletores e formato de resultado por categoria

Todos calibrados contra o HTML real do Jusbrasil (não são suposições) rodando
`scripts/inspect.js` e inspecionando com Cheerio. As classes CSS usam CSS
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

## Detecção de bloqueio anti-bot

Página de desafio Cloudflare identificada por:
- `<title>` igual a `"Um momento…"`, ou
- presença de `<script src*="challenges.cloudflare.com">`

Quando detectada, o scraper **não tenta resolver nada** — lança um erro
explícito e aciona o cooldown do throttle (ver `docs/ANTI_BOT.md`).
