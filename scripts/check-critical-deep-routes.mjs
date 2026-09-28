#!/usr/bin/env node
/**
 * Regression gate: critical organic routes must exist as physical build artifacts.
 *
 * Why: direct requests from crawlers must not depend on SPA fallback. These routes
 * have real Google Search Console history and were observed returning HTTP 404 in
 * production while still existing in the application.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = "https://tecnicocuritiba.com.br";
const ROUTES = [
  "/servicos",
  "/tecnico-informatica-curitiba",
  "/tecnico-informatica-colombo",
  "/servicos/conserto-placa",
  "/problemas/reparo-placa-principal-tv-curitiba",
  "/problemas/reparo-placa-som-amplificador-curitiba",
  "/blog/como-crimpar-cabo-de-rede-rj45",
  "/servicos/conserto-pc-notebook/portao",
];

const failures = [];

for (const route of ROUTES) {
  const parts = route.split("/").filter(Boolean);
  const file = resolve("dist", ...parts, "index.html");

  if (!existsSync(file)) {
    failures.push(`${route}: ausente em dist/${parts.join("/")}/index.html`);
    continue;
  }

  const html = readFileSync(file, "utf8");
  const canonical = `<link rel="canonical" href="${ORIGIN}${route}">`;
  if (!html.includes(canonical)) {
    failures.push(`${route}: canonical auto-referente ausente no artefato`);
  }

  if (/<meta\s+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) {
    failures.push(`${route}: artefato crítico contém noindex`);
  }
}

if (failures.length) {
  console.error("\n[critical-deep-routes] FALHOU:");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("\nUma build não pode ser publicada com rotas orgânicas críticas ausentes.");
  process.exit(1);
}

console.log(`[critical-deep-routes] OK — ${ROUTES.length} rotas materializadas, self-canonical e indexáveis.`);
