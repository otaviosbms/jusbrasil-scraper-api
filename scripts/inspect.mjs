import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const URLS = {
  'consulta-processual': (q) => `https://www.jusbrasil.com.br/consulta-processual/busca?q=${encodeURIComponent(q)}`,
  jurisprudencia: (q) => `https://www.jusbrasil.com.br/jurisprudencia/busca?q=${encodeURIComponent(q)}`,
  doutrina: (q) => `https://www.jusbrasil.com.br/doutrina/busca?q=${encodeURIComponent(q)}`,
  artigos: (q) => `https://www.jusbrasil.com.br/artigos/busca?q=${encodeURIComponent(q)}`,
  legislacao: (q) => `https://www.jusbrasil.com.br/legislacao/busca?q=${encodeURIComponent(q)}`,
  diarios: (q) => `https://www.jusbrasil.com.br/diarios/busca?q=${encodeURIComponent(q)}`,
};

const [, , category, ...queryParts] = process.argv;
const query = queryParts.join(' ') || 'dano moral';

if (!URLS[category]) {
  console.error(`Categoria inválida. Use uma de: ${Object.keys(URLS).join(', ')}`);
  process.exit(1);
}

const url = URLS[category](query);
console.log(`Abrindo ${url} ...`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'pt-BR' });
const page = await context.newPage();

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
const outFile = `scripts/output-${category}.html`;
await writeFile(outFile, await page.content(), 'utf-8');
console.log(`HTML salvo em ${outFile}. Abra no navegador ou inspecione para achar os seletores reais`);
console.log('e atualize as constantes em src/scraping/configs/<categoria>.config.ts.');

await browser.close();
process.exit(0);
