# Comportamento anti-bot do Jusbrasil e como este projeto lida com isso

## O que foi observado

Em teste real (não suposição): as primeiras ~6 buscas em poucos minutos
passaram normalmente. Depois disso, o Jusbrasil passou a servir uma página
de desafio Cloudflare Turnstile ("Um momento…") em vez do HTML de resultado,
para **todas** as categorias — inclusive as que tinham funcionado segundos
antes. Isso indica scoring por comportamento/frequência da sessão, não um
bloqueio permanente de IP.

## ⚠️ Mudança de postura (histórico)

Até uma versão anterior deste projeto, a política aqui era explícita e
deliberada: **não** tentar evadir a proteção anti-bot de jeito nenhum —
nenhum solver de captcha, nenhum browser "undetected", nenhum spoofing de
fingerprint. O raciocínio (mantido aqui por transparência, mesmo não sendo
mais a política atual): *a autorização para contornar a proteção pertence ao
Jusbrasil, não a quem roda o scraper*.

Essa política mudou: o projeto agora usa `puppeteer-extra-plugin-stealth`
(ver `src/common/browser.service.ts`), que aplica ativamente técnicas de
evasão de fingerprinting de automação (esconde `navigator.webdriver`, ajusta
propriedades do Chrome headless que entregam a automação, etc.) — uma decisão
tomada conscientemente, sabendo que ela é o oposto direto do raciocínio
acima. Isso **eleva o risco jurídico e de bloqueio de conta** descrito no
aviso legal do README além do que a raspagem anônima sem evasão já
representava. Ver também `docs/AUTH.md` para o mesmo tipo de risco aplicado
à camada de login.

## O que este projeto faz (e não faz) hoje

- **Evade fingerprinting de automação** via stealth plugin, mas **não
  resolve o desafio interativo do Cloudflare** (Turnstile) quando ele
  aparece — isso continua sem solver automatizado. Se o desafio aparecer
  mesmo com stealth, o comportamento é o mesmo de antes: erro explícito, não
  uma tentativa de resolver.
- **Espaça as requisições reais** (`src/common/throttle.service.ts`): fila
  serializada com espera mínima configurável (padrão 12s) + jitter aleatório
  (padrão até 8s) entre cada navegação ao site. Isso reduz a *frequência* de
  gatilho, independente do stealth.
- **Detecta o desafio explicitamente** em vez de devolver silenciosamente uma
  lista vazia: a resposta HTTP vira `429` com mensagem clara.
- **Cooldown adaptativo:** ao detectar um desafio, todas as próximas buscas
  esperam um período extra (padrão 5 min, `SCRAPE_COOLDOWN_MS`) antes de
  tentar de novo.
- **Perfil de navegador persistente** (`JUSBRASIL_PROFILE_DIR`, ver
  `docs/AUTH.md`): além de habilitar a camada de login, também persiste
  cookies de clearance do Cloudflare entre execuções, o que tende a reduzir
  desafios repetidos independente do stealth.

## Variáveis de ambiente relevantes

| Variável | Padrão | Efeito |
|---|---|---|
| `SCRAPE_MIN_DELAY_MS` | 12000 | espera mínima antes de cada navegação real |
| `SCRAPE_JITTER_MS` | 8000 | jitter aleatório somado à espera mínima |
| `SCRAPE_COOLDOWN_MS` | 300000 (5 min) | espera extra imposta a todas as buscas após um desafio ser visto |

## Limite do que dá pra garantir

Mesmo com esse espaçamento e o stealth plugin, o Jusbrasil pode acionar o
desafio interativo a qualquer momento — a heurística de scoring é deles, não
é algo que se possa prever ou controlar de fora, e stealth reduz a chance de
detecção por fingerprint, não a elimina. Se `count: 0` ou erro `429`
aparecer com frequência, a resposta correta continua sendo esperar mais
entre usos, não tentar contornar o desafio interativo em si (isso continua
fora do escopo deste projeto).
