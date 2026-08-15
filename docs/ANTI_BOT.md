# Comportamento anti-bot do Jusbrasil e como este projeto lida com isso

## O que foi observado

Em teste real (não suposição): as primeiras ~6 buscas em poucos minutos
passaram normalmente. Depois disso, o Jusbrasil passou a servir uma página
de desafio Cloudflare Turnstile ("Um momento…") em vez do HTML de resultado,
para **todas** as categorias — inclusive as que tinham funcionado segundos
antes. Isso indica scoring por comportamento/frequência da sessão, não um
bloqueio permanente de IP.

## O que este projeto faz (e não faz)

- **Não resolve o desafio.** Nenhum solver de captcha, browser "undetected",
  spoofing de fingerprint ou proxy rotation. Resolver o desafio
  programaticamente seria evasão de anti-bot, fora do escopo deste projeto
  por decisão deliberada — independente de a finalidade ser pessoal/acadêmica,
  a autorização para contornar a proteção pertence ao Jusbrasil, não a quem
  roda o scraper.
- **Espaça as requisições reais** (`src/utils/throttle.js`): fila serializada
  com espera mínima configurável (padrão 12s) + jitter aleatório (padrão até
  8s) entre cada navegação ao site. Isso reduz a *frequência* de gatilho, não
  a elimina.
- **Detecta o desafio explicitamente** em vez de devolver silenciosamente uma
  lista vazia: a resposta HTTP vira `429` com mensagem clara.
- **Cooldown adaptativo:** ao detectar um desafio, todas as próximas buscas
  esperam um período extra (padrão 5 min, `SCRAPE_COOLDOWN_MS`) antes de
  tentar de novo — o comportamento de um usuário real que "desistiu por
  enquanto", não de um sistema insistindo.

## Variáveis de ambiente relevantes

| Variável | Padrão | Efeito |
|---|---|---|
| `SCRAPE_MIN_DELAY_MS` | 12000 | espera mínima antes de cada navegação real |
| `SCRAPE_JITTER_MS` | 8000 | jitter aleatório somado à espera mínima |
| `SCRAPE_COOLDOWN_MS` | 300000 (5 min) | espera extra imposta a todas as buscas após um desafio ser visto |

## Limite do que dá pra garantir

Mesmo com esse espaçamento, o Jusbrasil pode acionar o desafio a qualquer
momento — a heurística de scoring é deles, não é algo que se possa prever
ou controlar de fora. Se `count: 0` ou erro `429` aparecer com frequência,
a resposta correta é esperar mais entre usos, não tentar aumentar a
"resiliência" do scraper via técnicas de evasão.
