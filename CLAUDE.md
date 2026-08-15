# CLAUDE.md

Guia rápido pra quem (humano ou Claude) for manter ou evoluir este projeto.
Contexto detalhado sempre vive em [`docs/`](./docs) e no [`README.md`](./README.md)
— este arquivo não duplica isso, só reúne comandos e convenções práticas.

## Visão geral

API não oficial (NestJS + Puppeteer + Cheerio) que expõe buscas no Jusbrasil
via REST e MCP (stdio + HTTP). Ver `README.md` para o aviso legal completo
antes de qualquer mudança que aumente volume de requisições, evasão anti-bot
ou acesso a conteúdo de assinante — isso não é um detalhe de rodapé, é uma
restrição real ao escopo do projeto.

## Comandos

```bash
npm run start:dev     # servidor REST+MCP HTTP, modo watch
npm run build          # nest build — único "check" automatizado do projeto hoje
npm run start:prod     # roda o build (dist/main.js)
npm run start:mcp      # servidor MCP via stdio (separado, precisa de build antes)
npm run inspect -- <categoria> <query>   # salva HTML real de uma busca, pra recalibrar seletores
npm run login          # login manual opcional no Jusbrasil (docs/AUTH.md)
```

Não há suíte de testes automatizada nem linter configurado neste projeto —
`npm run build` (checagem de tipos via `tsc`) é o único gate antes de
commitar. Rode sempre antes de finalizar uma mudança.

## Arquitetura

Estrutura de pastas e fluxo de uma requisição (REST e MCP), detalhados em
[`docs/STRUCTURE.md`](./docs/STRUCTURE.md). Resumo: `SearchController`/tools
MCP → `ScraperService` (orquestra cache → throttle → browser → parse) →
`BrowserService`/`CacheService`/`ThrottleService` compartilhados via DI. Não
duplique essas instâncias nem a lógica de scraping entre REST e MCP — os dois
transportes já reaproveitam o mesmo `ScraperService`/`register-tools.ts`
(ver `docs/MCP.md`).

## Boas práticas de manutenção

- **Seletores nunca são suposição.** O Jusbrasil não documenta a marcação
  HTML e ela muda sem aviso. Antes de calibrar ou corrigir um seletor, rode
  `npm run inspect -- <categoria> <query>` contra uma busca real e inspecione
  o HTML salvo — não adivinhe pela memória de como a página "costuma ser"
  (ver `docs/SCRAPERS.md`).
- **Extração de documento completo (`getDocument`) é heurística por
  natureza**, não calibrada seletor a seletor como as buscas. Ao ajustá-la,
  prefira melhorar a heurística genérica (ex: "candidato com mais texto") a
  criar um caso especial por categoria, a menos que uma categoria específica
  se mostre consistentemente ruim o suficiente pra justificar isso.
- **Variável de ambiente nova:** sempre adicione em `.env.example` com um
  comentário explicando o efeito, e documente no `docs/*.md` pertinente
  (`ANTI_BOT.md` pra throttle, `AUTH.md` pra login, `DEPLOY.md` pra deploy).
- **Mudança em `Dockerfile`/`docker-compose.yml`:** reflita em
  `docs/DEPLOY.md` no mesmo commit — é o único lugar que descreve o deploy
  fim a fim.
- **Nunca commitar** `.jusbrasil-browser-profile/`, `data/` ou `.env` — já
  cobertos pelo `.gitignore`, mas confirme se renomear essas pastas ou mudar
  `JUSBRASIL_PROFILE_DIR`. Depois de `npm run login`, o perfil equivale a uma
  senha (ver `docs/AUTH.md`).
- **Identidade de git** pode não estar configurada em ambientes/sandboxes
  novos. Configure `user.name`/`user.email` localmente (`git config --local`,
  nunca `--global`) coerente com o autor dos commits anteriores do
  repositório antes de commitar — não pule isso criando um autor genérico.

## Manter a documentação atualizada

Sempre que uma mudança de código tocar em algo já descrito em `docs/` —
seletores, endpoints, variáveis de ambiente, arquitetura, comportamento de
deploy, logging — **atualize o documento correspondente no mesmo commit**,
não depois. Documentação desatualizada nesse projeto é pior que ausente,
porque parece autoritativa. Ao encontrar um trecho de doc que descreve um
comportamento antigo (ex: um retrato de uma versão anterior da arquitetura,
uma nota de sessão que não se aplica mais), reescreva-o ou remova-o — não
deixe como "nota histórica" permanente a menos que o próprio conteúdo exija
esse contexto (ex: `docs/ANTI_BOT.md` explica uma mudança de postura de
propósito, porque o raciocínio anterior ainda é relevante). Mantenha
`README.md` e `docs/*.md` consistentes entre si — evite duplicar a mesma
informação em dois lugares que podem divergir com o tempo; prefira um único
lugar com a informação e um link a partir do outro.
