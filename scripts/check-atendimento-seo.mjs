#!/usr/bin/env node
// Valida SEO nas rotas /atendimento/* e /atendimento/:cidade/:bairro.
// Regras: 1 <h1>, <title> não vazio/genérico, <meta name="description"> com >=50 chars,
// e >=1 <script type="application/ld+json"> por rota. Falha CI em regressão.
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { resolve } from "node:path";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

const cidadesSrc = readFileSync(resolve("src/lib/servicoCidadeData.ts"), "utf8");
const cityStart = cidadesSrc.indexOf("export const CIDADES");
const cityEnd = cidadesSrc.indexOf("];", cityStart);
if (cityStart < 0 || cityEnd < 0) throw new Error("CIDADES canônicas não encontradas");
const cityRecords = [...cidadesSrc.slice(cityStart, cityEnd).matchAll(/\{\s*slug:\s*"([^"]+)"\s*,\s*nome:\s*"([^"]+)"/g)];
const cidades = cityRecords.map((m) => m[1]);
const cityNamesBySlug = new Map(cityRecords.map((m) => [m[1], m[2]]));

const bairrosSrc = readFileSync(resolve("src/lib/atendimentoBairrosData.ts"), "utf8");
const bairrosStart = bairrosSrc.indexOf("export const BAIRROS_ATENDIMENTO");
const bairrosEnd = bairrosSrc.indexOf("\n};", bairrosStart);
if (bairrosStart < 0 || bairrosEnd < 0) throw new Error("BAIRROS_ATENDIMENTO canônicos não encontrados");
const bairrosBlock = bairrosSrc.slice(bairrosStart, bairrosEnd);
const bairrosByCidade = {};
const bairroNamesByKey = new Map();
const cityKeys = /^\s*(?:"([^"]+)"|([a-z0-9-]+)):\s*\[/gm;
for (const match of bairrosBlock.matchAll(cityKeys)) {
  const citySlug = match[1] || match[2];
  const open = bairrosBlock.indexOf("[", match.index);
  let depth = 0;
  let close = -1;
  for (let i = open; i < bairrosBlock.length; i++) {
    if (bairrosBlock[i] === "[") depth++;
    else if (bairrosBlock[i] === "]") {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close < 0) throw new Error(`Lista de bairros sem fechamento: ${citySlug}`);
  const entries = [...bairrosBlock.slice(open + 1, close).matchAll(/\{\s*slug:\s*"([^"]+)"\s*,\s*nome:\s*"([^"]+)"/g)];
  bairrosByCidade[citySlug] = entries.map((m) => m[1]);
  for (const entry of entries) bairroNamesByKey.set(`${citySlug}/${entry[1]}`, entry[2]);
}

const routes = ["/atendimento"];
for (const c of cidades) {
  routes.push(`/atendimento/${c}`);
  for (const b of bairrosByCidade[c] || []) routes.push(`/atendimento/${c}/${b}`);
}
if (routes.length !== 69) throw new Error(`Esperadas 69 rotas de atendimento; encontradas ${routes.length}`);

function expectedH1For(route) {
  const segs = route.split("/").filter(Boolean);
  if (segs.length === 1) return "Atendimento técnico na Grande Curitiba";
  const city = cityNamesBySlug.get(segs[1]);
  if (!city) throw new Error(`Cidade sem nome canônico: ${segs[1]}`);
  if (segs.length === 2) return `Atendimento Técnico em ${city}`;
  const bairro = bairroNamesByKey.get(`${segs[1]}/${segs[2]}`);
  if (!bairro) throw new Error(`Bairro sem nome canônico: ${segs[1]}/${segs[2]}`);
  return `Atendimento Técnico em ${bairro}, ${city}`;
}

const GENERIC_TITLES = ["Lovable App", "Vite + React + TS", ""];
const SITE = "https://tecnicocuritiba.com.br";
const baseUrl = new URL(BASE);
const isLocalPreview = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
const failures = [];
const initialH1Missing = [];
const expectedMetadata = new Map();

function canonicalOf(html) {
  return (html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) || [, ""])[1];
}

function jsonLdErrors(html) {
  const nodes = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (!nodes.length) return ["JSON-LD ausente"];
  const errors = [];
  for (const [, raw] of nodes) {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") errors.push("JSON-LD sem objeto ou array");
    } catch {
      errors.push("JSON-LD com JSON inválido");
    }
  }
  return errors;
}

for (const route of routes) {
  const url = new URL(route, BASE);
  const expectedCanonical = SITE + route;
  let html = "";
  try {
    const res = await fetch(url, { redirect: "manual" });
    if (res.status !== 200) {
      failures.push(route + ": HTTP " + res.status);
      continue;
    }
    html = await res.text();
    // Mesmo comportamento já utilizado pelo gate de rotas piloto:
    // o preview local do Vite pode servir o shell SPA sem a barra final.
    // Nunca substituir uma falha HTTP nem aceitar o shell como página correta.
    if (isLocalPreview && (canonicalOf(html) !== expectedCanonical || jsonLdErrors(html).length)) {
      const alternate = await fetch(new URL(route + "/", BASE), { redirect: "manual" });
      if (alternate.ok) {
        const candidate = await alternate.text();
        if (canonicalOf(candidate) === expectedCanonical) html = candidate;
      }
    }
  } catch (e) {
    failures.push(route + ": fetch falhou (" + e.message + ")");
    continue;
  }

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1].trim();
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [, ""])[1].trim();
  // O shell inicial é uma SPA: não contar H1 de <noscript> nem confundir
  // ausência no HTML bruto com ausência no DOM renderizado pelo React.
  const htmlWithoutNoscript = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const h1s = [...htmlWithoutNoscript.matchAll(/<h1[\s>][\s\S]*?<\/h1>/gi)];
  const expectedH1 = expectedH1For(route);

  if (!title || GENERIC_TITLES.includes(title)) failures.push(route + ': title inválido "' + title + '"');
  if (!desc || desc.length < 50) failures.push(route + ": description curta/ausente (" + desc.length + "c)");
  if (h1s.length > 1) failures.push(route + ": H1 count=" + h1s.length + " no HTML inicial (máximo 1)");
  if (h1s.length === 0) initialH1Missing.push(route);
  else {
    const serverH1 = h1s[0][0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (serverH1 !== expectedH1) failures.push(route + `: H1 do HTML inicial divergente "${serverH1}" (esperado "${expectedH1}")`);
  }
  expectedMetadata.set(route, { title, description: desc, canonical: expectedCanonical, h1: expectedH1 });
  if (canonicalOf(html) !== expectedCanonical) failures.push(route + ": canônico HTTP divergente/ausente");
  for (const error of jsonLdErrors(html)) failures.push(route + ": HTTP: " + error);

  // A PR #11 também valida o artefato prerenderizado. Ele é obrigatório
  // no preview local: todas as 69 rotas constam no sitemap de serviços.
  // Não usamos o artefato para mascarar a ausência de JSON-LD no HTTP.
  if (isLocalPreview) {
    const artifactPath = resolve("dist", ...route.split("/").filter(Boolean), "index.html");
    if (!existsSync(artifactPath)) {
      failures.push(route + ": artefato prerender ausente");
    } else {
      const artifact = readFileSync(artifactPath, "utf8");
      if (canonicalOf(artifact) !== expectedCanonical) failures.push(route + ": canônico do artefato divergente/ausente");
      for (const error of jsonLdErrors(artifact)) failures.push(route + ": artefato: " + error);
    }
  }
}

// Verifica o DOM depois da montagem React, sem sleeps fixos.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const route of routes) {
    const expected = expectedMetadata.get(route);
    if (!expected) continue;
    const browserPath = isLocalPreview ? `${route}/` : route;
    const browserUrl = new URL(browserPath, BASE);
    browserUrl.searchParams.set("entry_popup", "0");
    try {
      const response = await page.goto(browserUrl.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
      if (!response?.ok()) {
        failures.push(route + ": DOM hidratado HTTP " + (response?.status() ?? "sem resposta"));
        continue;
      }
      const h1 = page.locator("h1");
      await h1.first().waitFor({ state: "visible", timeout: 12000 });
      const count = await h1.count();
      if (count !== 1) failures.push(route + ": DOM hidratado H1 count=" + count + " (esperado 1)");
      const actualH1 = (await h1.first().innerText()).replace(/\s+/g, " ").trim();
      if (actualH1 !== expected.h1) failures.push(route + `: H1 hidratado "${actualH1}" (esperado "${expected.h1}")`);
      await page.waitForFunction((meta) => {
        const canonicals = [...document.querySelectorAll('link[rel="canonical"]')];
        const descriptions = [...document.querySelectorAll('meta[name="description"]')];
        return document.title === meta.title &&
          canonicals.length === 1 && canonicals[0].href === meta.canonical &&
          descriptions.length === 1 && descriptions[0].content === meta.description;
      }, { title: expected.title, canonical: expected.canonical, description: expected.description }, { timeout: 12000 });
    } catch (error) {
      failures.push(route + ": falha após hidratação (" + error.message + ")");
    }
  }
} finally {
  await browser.close();
}

if (initialH1Missing.length) {
  console.log(`ℹ H1 ausente no HTML inicial em ${initialH1Missing.length}/${routes.length} rotas SPA; H1 visível, único e semanticamente correto será exigido no DOM hidratado.`);
}

if (failures.length) {
  console.error(`\n❌ ${failures.length} regressão(ões) SEO em /atendimento:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✅ SEO OK em ${routes.length} rotas /atendimento — HTML inicial, DOM hidratado, H1, canonical, title, description e JSON-LD`);
