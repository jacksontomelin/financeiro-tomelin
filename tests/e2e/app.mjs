// Testes da tela: abre o sistema de verdade no Chromium, entra, passa por todas as
// telas e faz as ações principais. Qualquer erro de JavaScript derruba o teste.
import { chromium } from "playwright";

const URL = process.env.APP_URL_TESTE || "http://127.0.0.1:8000";
const EMAIL = process.env.ADMIN_EMAIL || "admin@tomelin.com.br";
const SENHA = process.env.ADMIN_SENHA;
const erros = [];
let ok = 0;
const passo = async (nome, fn) => {
  try { await fn(); ok++; console.log(`  ok  ${nome}`); }
  catch (e) { erros.push(`${nome}: ${e.message.split("\n")[0]}`); console.log(`  FALHOU  ${nome}: ${e.message.split("\n")[0]}`); }
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
for (const [disp, viewport] of [["celular", { width: 390, height: 844 }], ["computador", { width: 1280, height: 860 }]]) {
  console.log(`\n# ${disp}`);
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("tom_tour_visto", "1"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erros.push(`[${disp}] erro de JS: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erros.push(`[${disp}] console: ${m.text()}`); });

  await passo("login", async () => {
    await page.goto(URL);
    await page.fill("#l-email", EMAIL);
    await page.fill("#l-senha", SENHA);
    await page.click("#l-btn");
    await page.waitForSelector(".sidebar, .app", { timeout: 15000 });
  });
  await passo("abertura do dia aparece e fecha", async () => {
    await page.waitForSelector("#bv.aberta", { timeout: 8000 });
    await page.click(".bv-x");
    await page.waitForSelector("#bv", { state: "detached", timeout: 5000 });
  });
  const telas = ["dashboard", "vencimentos", "pagar", "receber", "lancamentos", "compras", "fatura", "metas", "contas",
                 "categorias", "contatos", "veiculos", "relatorios", "orcamento", "documentos", "whatsapp", "usuarios", "configuracoes"];
  for (const t of telas) {
    await passo(`tela ${t}`, async () => {
      await page.evaluate((t) => setView(t), t);
      await espera(900);
      const txt = await page.evaluate(() => document.querySelector("#view")?.innerText || "");
      if (!txt.trim()) throw new Error("tela vazia");
      if (/is not a function|is not defined|Cannot read/.test(txt)) throw new Error("erro na tela: " + txt.slice(0, 120));
    });
  }
  await passo("cria despesa pelo formulário", async () => {
    await page.evaluate(() => setView("pagar")); await espera(700);
    await page.evaluate(() => formLancamento(null, "despesa")); await espera(500);
    const desc = `Teste tela ${disp} ${Date.now() % 100000}`;
    await page.fill("#f-desc", desc);
    await page.fill("#f-valor", "42.50");
    await page.evaluate((id) => salvarLanc(null), null);
    await page.waitForFunction((d) => document.body.innerText.includes(d), desc, { timeout: 8000 });
  });
  await passo("lança sem internet e sobe quando volta", async () => {
    await page.evaluate(() => formLancamento(null, "despesa")); await espera(500);
    const desc = `Offline ${disp} ${Date.now() % 100000}`;
    await page.fill("#f-desc", desc);
    await page.fill("#f-valor", "9.90");
    await ctx.setOffline(true);
    await page.evaluate(() => salvarLanc(null));
    await page.waitForSelector("#fila-off", { timeout: 6000 });
    await ctx.setOffline(false);
    await page.evaluate(() => _offEnviar(true));
    await page.waitForSelector("#fila-off", { state: "detached", timeout: 10000 });
    await page.evaluate(() => _offEnviar(true));   // de novo: não pode duplicar
    const n = await page.evaluate(async (d) => (await api(`/api/lancamentos?busca=${encodeURIComponent(d)}`)).length, desc);
    if (n !== 1) throw new Error(`entrou ${n} vez(es)`);
  });
  await passo("menu do lançamento e histórico", async () => {
    const id = await page.evaluate(() => [..._LANC_CACHE.keys()][0]);
    await page.evaluate((id) => _menuLanc(id), id); await espera(400);
    await page.evaluate((id) => { _folhaFechar(); verHistoricoLanc(id); }, id);
    await page.waitForSelector(".hi-lista, #hist-corpo .empty", { timeout: 6000 });
    await page.evaluate(() => fecharModal());
  });
  await passo("folha do WhatsApp e IR", async () => {
    await page.evaluate(() => abrirZap()); await page.waitForSelector(".folha-zap.aberta", { timeout: 4000 });
    await page.evaluate(() => _folhaFechar()); await espera(300);
    await page.evaluate(() => abrirIR()); await page.waitForSelector(".ir-total, .empty", { timeout: 6000 });
    await page.evaluate(() => fecharModal());
  });
  await passo("cadastro de compra abre com fornecedor", async () => {
    await page.evaluate(async () => { await carregarRefs(); abrirFormCompra(); });
    await page.waitForSelector("#fc-forn-busca", { timeout: 4000 });
    await page.evaluate(() => fecharModal());
  });
  await passo("tema escuro", async () => {
    await page.evaluate(() => toggleTema()); await espera(600);
    if (!(await page.evaluate(() => document.documentElement.classList.contains("dark")))) throw new Error("não ficou escuro");
    await page.evaluate(() => toggleTema());
  });
  await ctx.close();
}
await browser.close();
console.log(`\n${ok} passos ok, ${erros.length} problema(s)`);
if (erros.length) { console.log(erros.join("\n")); process.exit(1); }
