#!/usr/bin/env node
// Valida SEO nas rotas /atendimento/* e /atendimento/:cidade/:bairro.
// Regras: 1 <h1>, <title> não vazio/genérico, <meta name="description"> com >=50 chars,
// e >=1 <script type="application/ld+json"> por rota. Falha CI em regressão.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

const cidadesSrc = readFileSync(resolve("src/lib/servicoCidadeData.ts"), "utf8");
const cidades = [
  ...cidadesSrc.match(/export const CIDADES[\s\S]*?\];/)[0]
    .matchAll(/slug:\s*"([^"]+)"/g),
].map((m) => m[1]);

const bairrosSrc = readFileSync(resolve("src/lib/atendimentoBairrosData.ts"), "utf8");
const bairrosByCidade = {};
for (const m of bairrosSrc.matchAll(/"?([a-z0-9-]+)"?\s*:\s*\[([^\]]*)\]/g)) {
  bairrosByCidade[m[1]] = [...m[2].matchAll(/slug:\s*"([^"]+)"/g)].map((b) => b[1]);
}

const routes = ["/atendimento"];
for (const c of cidades) {
  routes.push(`/atendimento/${c}`);
  for (const b of bairrosByCidade[c] || []) routes.push(`/atendimento/${c}/${b}`);
}

const GENERIC_TITLES = ["Lovable App", "Vite + React + TS", ""];
const SITE = "https://tecnicocuritiba.com.br";
const baseUrl = new URL(BASE);
const isLocalPreview = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
const failures = [];

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
    const res = await fetch(url);
    if (!res.ok) {
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
  const h1s = [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/gi)];

  if (!title || GENERIC_TITLES.includes(title)) failures.push(route + ': title inválido "' + title + '"');
  if (!desc || desc.length < 50) failures.push(route + ": description curta/ausente (" + desc.length + "c)");
  if (h1s.length !== 1) failures.push(route + ": H1 count=" + h1s.length + " (esperado 1)");
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

if (failures.length) {
  console.error(`\n❌ ${failures.length} regressão(ões) SEO em /atendimento:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✅ SEO OK em ${routes.length} rotas /atendimento`);
