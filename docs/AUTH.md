# Camada de login (sessão autenticada)

Opcional. Sem configurar nada, o projeto continua funcionando exatamente como
antes — sessão anônima em toda navegação. Esta camada existe pra quem quer que
as buscas/`get_document` naveguem **logadas** numa conta Jusbrasil, o que pode
expor conteúdo que só aparece pra assinante (inteiro teor completo, sem os
limites que a versão anônima às vezes impõe).

## ⚠️ Isso eleva o risco descrito no aviso legal do README

O aviso legal do projeto já deixa claro que a raspagem anônima pode violar os
Termos de Uso do Jusbrasil. Automatizar uma sessão logada é um passo a mais, e
mais sério, na mesma direção:

- A maioria dos serviços com plano pago proíbe explicitamente uso automatizado
  da conta, mesmo por um assinante legítimo — violar isso é motivo comum de
  **suspensão/banimento da conta**, não só um risco abstrato.
- Extrair sistematicamente conteúdo que só existe atrás do paywall (em vez de
  navegação manual, humana, dentro do que a assinatura permite) tende a ser
  tratado como uso fora do escopo contratado, com exposição jurídica maior do
  que a busca anônima (quebra de contrato; dependendo do volume/uso, também
  direitos autorais sobre o conteúdo extraído).
- **Não redistribua** conteúdo de assinante extraído dessa forma. Isso vale
  ainda mais forte do que a mesma recomendação já feita no README pra dados
  públicos.

Use por sua conta e risco, com uma conta que seja sua, pra uso pessoal. Se a
intenção é uso comercial ou em escala, isso deveria ser resolvido com o
Jusbrasil diretamente (API oficial, se existir, ou licenciamento), não via
scraping autenticado.

## Como funciona

1. **Login é manual e separado do servidor** (`scripts/login.mjs`, rodado uma
   vez com `npm run login`): abre um Chromium **visível** (não headless),
   preenche e-mail/senha vindos de `JUSBRASIL_EMAIL`/`JUSBRASIL_PASSWORD` (do
   `.env`) e submete o formulário de login
   (`https://www.jusbrasil.com.br/login`).

2. **Nada é resolvido automaticamente além do formulário de e-mail/senha.** Se
   aparecer verificação anti-bot, 2FA, ou você usa "Continuar com Google" (sem
   senha), o script não tenta contornar nada — ele só espera (até 5 minutos)
   você completar isso manualmente na janela que abriu. O stealth plugin
   (`docs/ANTI_BOT.md`) reduz a chance disso aparecer, mas quando aparece o
   script não tenta resolver captcha nem 2FA sozinho — só o desafio interativo
   fica de fora da evasão automática.

3. O browser é lançado com `userDataDir` apontando pra
   `JUSBRASIL_PROFILE_DIR` (padrão `.jusbrasil-browser-profile`) — um perfil
   de Chromium persistente em disco. Não existe passo explícito de "salvar
   sessão": cookies, localStorage e cache já ficam gravados nesse perfil
   automaticamente conforme a navegação acontece, inclusive o login.

4. **O servidor (API REST e MCP) não faz login.** `BrowserService`
   (`src/common/browser.service.ts`) sempre lança o Chromium com esse mesmo
   `userDataDir` — com ou sem login feito. Sem `npm run login` rodado antes,
   o perfil só acumula estado anônimo (e ainda assim ajuda: persiste cookies
   de clearance do Cloudflare entre execuções). Não há lógica de "logar
   automaticamente se a sessão expirar" — isso é deliberado, pra login
   continuar sendo um passo manual e visível, não algo que roda sozinho em
   produção.

## Uso

```bash
# no .env:
JUSBRASIL_EMAIL=voce@exemplo.com
JUSBRASIL_PASSWORD=sua-senha

npm run login
```

Depois disso pode até apagar `JUSBRASIL_EMAIL`/`JUSBRASIL_PASSWORD` do `.env`
— só a pasta de perfil (`JUSBRASIL_PROFILE_DIR`) importa pro dia a dia. As
buscas e o `get_document`/`GET /api/document` passam a usar a sessão
automaticamente, sem mudança nenhuma na forma de chamar as tools/endpoints
(o servidor já usa esse mesmo perfil mesmo sem login — só passa a estar
autenticado depois que `npm run login` rodar com sucesso).

Se a sessão expirar (respostas voltarem a vir como se estivesse deslogado),
rode `npm run login` de novo.

## A pasta de perfil é equivalente a uma senha

`.jusbrasil-browser-profile/` (ou o caminho que você configurar) contém
cookies de sessão válidos depois do login — quem tiver essa pasta consegue
navegar logado na sua conta sem saber sua senha. Por isso:

- já está no `.gitignore` (padrão `.jusbrasil-browser-profile/`) — confirme
  isso se mudar o nome da pasta;
- nunca compartilhe, zipe pra enviar em chat, ou suba pra lugar nenhum;
- se vazar, troque a senha da sua conta Jusbrasil (isso invalida a sessão
  salva) e rode `npm run login` de novo.

## Seletores usados no login

Calibrados contra o HTML real de `https://www.jusbrasil.com.br/login`
(mesma metodologia de `docs/SCRAPERS.md`, seletores semânticos em vez de
classes com hash, que quebram mais fácil):

- E-mail: `input[type="email"][name="email"]`
- Senha (aparece só depois de enviar o e-mail): `input[type="password"]`
- Botão de envio: `button[type="submit"]`

O fluxo observado é em duas etapas (e-mail → senha), com validação do e-mail
em tempo real pelo próprio Jusbrasil antes de avançar. Contas criadas via
"Continuar com Google" não têm senha própria — pra essas, complete o login
manualmente na janela quando ela abrir; o script espera do mesmo jeito.
