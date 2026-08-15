# Deploy numa VPS própria

Este projeto precisa de um processo Node **sempre ligado** (Puppeteer real +
perfil de navegador persistente em disco + fila de throttle em memória) — não
roda em serverless (Vercel, Lambda etc.), ver a explicação no README. Uma VPS
com acesso root/SSH cobre isso sem precisar adaptar nada da arquitetura.

## Pré-requisitos na VPS

- Docker + Docker Compose (`docker compose version` — se não tiver, instale
  pelo [método oficial](https://docs.docker.com/engine/install/) da sua distro).
- Uma porta liberada no firewall pra a API (padrão `3000`, ou coloque atrás
  de um reverse proxy com TLS — ver seção abaixo).

Não precisa de Node instalado na VPS: o Docker cuida disso.

## Deploy

```bash
git clone https://github.com/<seu-usuario>/jusbrasil-scraper-api.git
cd jusbrasil-scraper-api
cp .env.example .env
# edite .env se quiser mudar PORT, throttle, etc. — os padrões já funcionam

docker compose up -d --build
```

Isso builda a imagem (`Dockerfile`, multi-stage: compila TS numa stage,
instala Chromium via `apt` na stage final — ver comentários no próprio
arquivo) e sobe o container em background, reiniciando sozinho se cair
(`restart: unless-stopped`).

Confirma que subiu:

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl "http://localhost:3000/api/jurisprudencia?q=dano+moral"
```

Logs: `docker compose logs -f` — estruturados via `Logger` do Nest: log de
acesso HTTP (método, rota, status, duração) pra toda requisição, mais logs de
negócio (início/fim/erro de cada busca e recuperação de documento, chamadas
de tool MCP). Parar: `docker compose down` (o perfil do navegador não é
apagado, ver próxima seção).

## Chromium em container: `--no-sandbox`

O `Dockerfile` já seta `CHROME_NO_SANDBOX=true`, que faz
`src/common/browser.service.ts` acrescentar `--no-sandbox
--disable-setuid-sandbox` ao lançar o Chromium — necessário porque o sandbox
de kernel do Chromium não funciona dentro de um container comum sem
`--cap-add=SYS_ADMIN`. Fora de container (`npm run start:prod` direto numa
VPS sem Docker, ou localmente) isso fica desativado por padrão, porque reduz
o isolamento do processo que renderiza páginas — só é um tradeoff aceitável
porque o container já é o próprio limite de isolamento nesse caso.

## Sessão de login (`npm run login`) numa VPS sem tela

`npm run login` abre um Chromium **visível** (`headless: false`) de
propósito — não dá pra rodar isso direto numa VPS sem ambiente gráfico. O
jeito mais simples:

1. Rode `npm run login` **localmente** (numa máquina com tela — onde você já
   testou que funciona).
2. Isso cria `.jusbrasil-browser-profile/` na raiz do projeto local.
3. Copie essa pasta pro caminho que o `docker-compose.yml` mapeia na VPS:
   ```bash
   scp -r .jusbrasil-browser-profile/. usuario@sua-vps:/caminho/jusbrasil-scraper-api/data/browser-profile/
   ```
4. `docker compose restart` na VPS.

Sem isso, a API/MCP na VPS funciona normalmente em modo anônimo — login é
opcional (`docs/AUTH.md`).

## Reinício abrupto do container (OOM, `docker kill`, crash do host)

`main.ts` chama `app.enableShutdownHooks()`, então um `docker stop`/restart
normal (SIGTERM) fecha o Chromium antes do container morrer. Mas se o
container for morto sem passar por aí — OOM, `docker kill -9`, crash do
host — o Chromium não fecha direito e deixa um `SingletonLock` preso no
profile em `./data/browser-profile`, que sobrevive ao container. Como o
hostname do container muda a cada recriação, o próximo Chromium recusa
reabrir esse profile ("appears to be in use by another Chromium process"),
mesmo o processo anterior já não existindo.

`BrowserService` detecta esse erro especificamente e remove o lock sozinho
antes de tentar de novo (logando um aviso) — não precisa apagar
`./data/browser-profile` manualmente nem reiniciar o container à mão pra
recuperar disso.

## TLS / domínio (recomendado, não obrigatório)

Um cliente MCP remoto tipicamente espera uma URL `https://`. Rodar direto em
`http://ip:3000` funciona pra testar, mas expõe tráfego sem criptografia. O
jeito mais simples de resolver isso é um [Caddy](https://caddyserver.com/) na
frente, que gerencia certificado TLS automaticamente:

```caddyfile
# /etc/caddy/Caddyfile
seu-dominio.com {
    reverse_proxy localhost:3000
}
```

Com um domínio apontando pro IP da VPS e o Caddy instalado (`apt install
caddy` na maioria das distros, ou container oficial), isso já basta —
Let's Encrypt automático, sem configurar nada de certificado manualmente.

## Atualizando

```bash
git pull
docker compose up -d --build
```

O perfil do navegador (`./data/browser-profile`) não é afetado por rebuild —
é uma pasta no host, fora da imagem.
