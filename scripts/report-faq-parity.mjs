#!/usr/bin/env node
/**
 * Relatório público de paridade FAQ visível × JSON-LD FAQPage por localidade.
 *
 * Saída:
 *   public/relatorios/faq-parity.csv   (público, linkável)
 *   docs/seo/faq-parity.md             (resumo com status de correção)
 *
 * Uso:
 *   BASE_URL=http://localhost:8080 node scripts/report-faq-parity.mjs
 *   FAIL_ON_DIFF=1 ...   # falha o build quando houver divergência
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { stubPublicExternalDependencies } from "./stub-public-external-dependencies.mjs";

const SITE = "https://tecnicocuritiba.com.br";
const BASE = (process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const SAMPLE = Number(process.env.SAMPLE || 0); // 0 = todas
const FAIL_ON_DIFF = process.env.FAIL_ON_DIFF === "1";

const norm = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .trim()
    .toLowerCase();

function localRoutes() {
  const dir = path.resolve("public");
  const files = fs.readdirSync(dir).filter((f) => /^sitemap.*\.xml$/.test(f) && f !== "sitemap-images.xml");
  const out = new Set();
  for (const f of files) {
    const xml = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1].trim();
      if (!loc.startsWith(SITE) || /sitemap[\w-]*\.xml$/.test(loc)) continue;
      const p = loc.slice(SITE.length).replace(/\/$/, "") || "/";
      if (/^\/(bairros|atendimento)\//.test(p)) out.add(p);
    }
  }
  const all = [...out].sort();
  return SAMPLE > 0 ? all.slice(0, SAMPLE) : all;
}

const routes = localRoutes();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
const rows = [];

for (const route of routes) {
  const page = await ctx.newPage();
  let visible = [];
  let structured = [];
  let status = "ok";
  try {
    await stubPublicExternalDependencies(page);
    const url = new URL(route, BASE);
    url.searchParams.set("entry_popup", "0");
    const res = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!res || !res.ok()) status = `http_${res ? res.status() : "erro"}`;
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 10000 });
    // Ativa seções sob demanda; espera o contrato real, não um sleep fixo.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => {
      const questions = [...document.querySelectorAll("[data-faq-question], details > summary")]
        .filter((el) => (el.textContent || "").trim().endsWith("?"));
      const hasFaqPage = [...document.querySelectorAll('script[type="application/ld+json"]')].some((el) => {
        try {
          const json = JSON.parse(el.textContent || "");
          const nodes = Array.isArray(json) ? json : json["@graph"] || [json];
          return nodes.some((node) => node["@type"] === "FAQPage" && Array.isArray(node.mainEntity));
        } catch { return false; }
      });
      return questions.length > 0 && hasFaqPage;
    }, null, { timeout: 10000 });
  } catch (err) {
    status = `erro: ${err.message.slice(0, 60)}`;
  }

  // Coleta também em caso de timeout para produzir diagnóstico útil no CSV.
  try {
    visible = await page.$eval("[data-faq-question], details > summary", (els) =>
      els.map((e) => e.textContent || "").filter((t) => t.trim().endsWith("?")),
    );
    structured = await page.$eval('script[type="application/ld+json"]', (els) => {
      const qs = [];
      for (const el of els) {
        try {
          const json = JSON.parse(el.textContent || "");
          const nodes = Array.isArray(json) ? json : json["@graph"] || [json];
          for (const node of nodes) {
            if (node["@type"] === "FAQPage" && Array.isArray(node.mainEntity)) {
              for (const q of node.mainEntity) qs.push(q.name || "");
            }
          }
        } catch { /* ignore malformed independent schema */ }
      }
      return qs;
    });
  } catch (err) {
    if (status === "ok") status = `erro: ${err.message.slice(0, 60)}`;
  }
  await page.close();

  const v = new Set(visible.map(norm));
  const s = new Set(structured.map(norm));
  const soLd = [...s].filter((q) => !v.has(q));
  const soVisivel = [...v].filter((q) => !s.has(q));
  const paridade = status === "ok" && s.size > 0 && soLd.length === 0 && soVisivel.length === 0;

  rows.push({
    url: SITE + route,
    visiveis: v.size,
    jsonld: s.size,
    somente_jsonld: soLd.length,
    somente_visivel: soVisivel.length,
    paridade: paridade ? "ok" : s.size === 0 ? "sem_faqpage" : "divergente",
    status,
    exemplo_divergencia: (soLd[0] || soVisivel[0] || "").slice(0, 120),
  });
  process.stdout.write(paridade ? "." : "x");
}
await browser.close();
console.log("");

// ------------------------------------------------------------------ saídas
const csvHead = "url,faqs_visiveis,faqs_jsonld,somente_jsonld,somente_visivel,paridade,status,exemplo_divergencia";
const csv = [
  csvHead,
  ...rows.map((r) =>
    [r.url, r.visiveis, r.jsonld, r.somente_jsonld, r.somente_visivel, r.paridade, r.status, r.exemplo_divergencia]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(","),
  ),
].join("\n");

fs.mkdirSync(path.resolve("public/relatorios"), { recursive: true });
fs.writeFileSync(path.resolve("public/relatorios/faq-parity.csv"), csv + "\n", "utf8");

const div = rows.filter((r) => r.paridade !== "ok");
const md = [
  "# Paridade FAQ visível × JSON-LD FAQPage",
  "",
  `- Localidades auditadas: **${rows.length}**`,
  `- Em paridade 1:1: **${rows.length - div.length}**`,
  `- Com divergência: **${div.length}**`,
  "",
  "CSV público: `/relatorios/faq-parity.csv`",
  "",
  "## Localidades com inconsistência",
  "",
  div.length ? "| URL | Visíveis | JSON-LD | Situação | Exemplo |" : "_Nenhuma inconsistência._",
  div.length ? "| --- | --- | --- | --- | --- |" : "",
  ...div.map((r) => `| ${r.url} | ${r.visiveis} | ${r.jsonld} | ${r.paridade} | ${r.exemplo_divergencia} |`),
].join("\n");

fs.mkdirSync(path.resolve("docs/seo"), { recursive: true });
fs.writeFileSync(path.resolve("docs/seo/faq-parity.md"), md + "\n", "utf8");

console.log(`Paridade FAQ: ${rows.length - div.length}/${rows.length} localidades 1:1.`);
console.log("CSV: public/relatorios/faq-parity.csv | Resumo: docs/seo/faq-parity.md");
if (div.length && FAIL_ON_DIFF) {
  div.slice(0, 20).forEach((r) => console.error(` - ${r.url}: ${r.paridade} (${r.exemplo_divergencia})`));
  process.exit(1);
}
