# Referência da API

Todos os endpoints aceitam `q` (obrigatório) e `page` (opcional, padrão `1`).

| Endpoint | Categoria | Formato da query |
|---|---|---|
| `GET /api/consulta-processual` | Consulta processual | nome, CPF ou CNPJ |
| `GET /api/jurisprudencia` | Jurisprudência | texto livre |
| `GET /api/doutrina` | Doutrina | texto livre |
| `GET /api/artigos` | Artigos | texto livre |
| `GET /api/legislacao` | Legislação | texto livre |
| `GET /api/diarios` | Diários oficiais | texto livre |

`GET /health` → `{ "status": "ok" }`

## Resposta de sucesso

```json
{
  "query": "dano moral",
  "page": 1,
  "count": 10,
  "results": [ { "...": "campos variam por categoria, ver docs/SCRAPERS.md" } ],
  "source": "https://www.jusbrasil.com.br/jurisprudencia/busca?q=dano+moral&p=1"
}
```

## Respostas de erro

| Status | Quando |
|---|---|
| `400` | `q` ausente ou vazio |
| `429` | verificação anti-bot do Jusbrasil detectada nessa busca, ou rate limit da própria API estourado |
| `502` | qualquer outra falha na navegação/extração |

## Rate limiting

4 requisições/min por instância da API (`src/utils/rateLimit.js`), independente
do espaçamento interno das navegações reais ao Jusbrasil (ver `docs/ANTI_BOT.md`).
