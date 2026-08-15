// Login manual e único no Jusbrasil pra habilitar a camada de sessão autenticada
// (ver docs/AUTH.md). Roda com `npm run login`, que carrega o .env via `node
// --env-file`. Não é chamado pelo servidor: é um passo separado, deliberado, que
// você roda quando decide usar essa camada — o servidor só lê a sessão salva.
//
// De propósito headed (headless: false) e com timeout generoso pra manual: se o
// Jusbrasil pedir verificação anti-bot, 2FA ou "Continuar com Google", este
// script não tenta resolver nada sozinho — ele espera você completar na janela
// que abre, do mesmo jeito que o resto do projeto reage a desafio anti-bot sem
// tentar contornar (ver docs/ANTI_BOT.md).
import { chromium } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const EMAIL = process.env.JUSBRASIL_EMAIL;
const PASSWORD = process.env.JUSBRASIL_PASSWORD;
const STATE_PATH = process.env.JUSBRASIL_AUTH_STATE_PATH || '.jusbrasil-auth-state.json';
const MANUAL_STEP_TIMEOUT_MS = 5 * 60 * 1000;

if (!EMAIL || !PASSWORD) {
  console.error(
    'Defina JUSBRASIL_EMAIL e JUSBRASIL_PASSWORD no .env antes de rodar `npm run login` (ver docs/AUTH.md).',
  );
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'pt-BR' });
const page = await context.newPage();

console.log('Abrindo a página de login do Jusbrasil...');
await page.goto('https://www.jusbrasil.com.br/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

await page.fill('input[type="email"][name="email"]', EMAIL);
await page.click('button[type="submit"]');
console.log('E-mail enviado. Aguardando campo de senha (até 15s)...');

const passwordAppeared = await page
  .waitForSelector('input[type="password"]', { timeout: 15000 })
  .then(() => true)
  .catch(() => false);

if (passwordAppeared) {
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('button[type="submit"]').last().click();
} else {
  console.log(
    'Não apareceu campo de senha automaticamente — pode ser verificação anti-bot, ' +
      '"Continuar com Google" ou outro fluxo. Complete o login manualmente na janela ' +
      'do navegador que abriu.',
  );
}

console.log(
  `Aguardando o login terminar (até ${MANUAL_STEP_TIMEOUT_MS / 1000}s). ` +
    'Se precisar resolver captcha, 2FA ou confirmar algo, faça isso na janela agora.',
);
await page
  .waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: MANUAL_STEP_TIMEOUT_MS })
  .catch(() => null);

if (page.url().includes('/login')) {
  console.error('Login não concluído (ainda em /login). Sessão não foi salva — rode de novo.');
  await browser.close();
  process.exit(1);
}

await context.storageState({ path: STATE_PATH });
console.log(`Sessão salva em ${STATE_PATH}.`);
console.log(
  'A partir de agora, a API/MCP reaproveita essa sessão automaticamente em toda navegação. ' +
    'Esse arquivo contém cookies de sessão — trate como uma senha: não commite, não compartilhe.',
);
console.log('Se a sessão expirar (ex: respostas voltarem a vir sem conteúdo de assinante), rode `npm run login` de novo.');

await browser.close();
process.exit(0);
