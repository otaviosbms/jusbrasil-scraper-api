// Login manual e único no Jusbrasil pra habilitar a camada de sessão autenticada
// (ver docs/AUTH.md). Roda com `npm run login`, que carrega o .env via `node
// --env-file`. Não é chamado pelo servidor: é um passo separado, deliberado, que
// você roda quando decide usar essa camada — o servidor só reaproveita o perfil.
//
// De propósito headed (headless: false) e com timeout generoso pra manual: se o
// Jusbrasil pedir verificação anti-bot, 2FA ou "Continuar com Google", este
// script não tenta resolver nada sozinho — ele espera você completar na janela
// que abre.
//
// Não existe passo explícito de "salvar sessão": o browser já foi aberto com
// userDataDir apontando pro perfil persistente (mesmo usado em produção via
// BrowserService), então tudo que acontecer na janela — cookies, localStorage,
// o desafio do Cloudflare resolvido manualmente — já fica salvo em disco quando
// o Chromium fecha.
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const EMAIL = process.env.JUSBRASIL_EMAIL;
const PASSWORD = process.env.JUSBRASIL_PASSWORD;
const PROFILE_DIR = process.env.JUSBRASIL_PROFILE_DIR || '.jusbrasil-browser-profile';
const MANUAL_STEP_TIMEOUT_MS = 5 * 60 * 1000;

if (!EMAIL || !PASSWORD) {
  console.error(
    'Defina JUSBRASIL_EMAIL e JUSBRASIL_PASSWORD no .env antes de rodar `npm run login` (ver docs/AUTH.md).',
  );
  process.exit(1);
}

const browser = await puppeteer.launch({ headless: false, userDataDir: PROFILE_DIR });
const page = await browser.newPage();
await page.setUserAgent(USER_AGENT);
await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

console.log('Abrindo a página de login do Jusbrasil...');
await page.goto('https://www.jusbrasil.com.br/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

await page.type('input[type="email"][name="email"]', EMAIL);
await page.click('button[type="submit"]');
console.log('E-mail enviado. Aguardando campo de senha (até 15s)...');

const passwordAppeared = await page
  .waitForSelector('input[type="password"]', { timeout: 15000 })
  .then(() => true)
  .catch(() => false);

if (passwordAppeared) {
  await page.type('input[type="password"]', PASSWORD);
  const submitButtons = await page.$$('button[type="submit"]');
  await submitButtons[submitButtons.length - 1].click();
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
  console.error('Login não concluído (ainda em /login). Rode `npm run login` de novo.');
  await browser.close();
  process.exit(1);
}

console.log(`Login concluído. Sessão salva no perfil persistente em ${PROFILE_DIR}.`);
console.log(
  'A partir de agora, a API/MCP reaproveita essa sessão automaticamente em toda navegação. ' +
    'Essa pasta contém cookies de sessão — trate como uma senha: não commite, não compartilhe.',
);
console.log('Se a sessão expirar (ex: respostas voltarem a vir sem conteúdo de assinante), rode `npm run login` de novo.');

await browser.close();
process.exit(0);
