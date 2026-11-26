import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { abs } from "./utils/baseUrl";

// SEO gate — nenhuma página indexável pode ter <title> duplicado com outra.
// Amostra 50 URLs. Em falha, salva CSV para inspeção.

const readSitemapUrls = (): string[] => {
  const publicDir = path.resolve(process.cwd(), "public");
  const indexPath = path.join(publicDir, "sitemap-index.xml");
  if (!fs.existsSync(indexPath)) throw new Error("sitemap-index.xml não encontrado");
  const indexXml = fs.readFileSync(indexPath, "utf8");
  const childSitemaps = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""))
    .map((rel) => path.join(publicDir, rel.replace(/^\/+/, "")))
    .filter((p) => fs.existsSync(p));
  const urls = new Set<string>();
  for (const sm of childSitemaps) {
    const xml = fs.readFileSync(sm, "utf8");
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      urls.add(m[1].replace(/^https?:\/\/[^/]+/, ""));
    }
  }
  return [...urls];
};

const isolatedUrl = (url: string) => {
  const target = new URL(abs(url));
  target.searchParams.set("entry_popup", "0");
  return target.toString();
};

const sample = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

test.describe("SEO: <title> único por URL", () => {
  test("amostra de 50 URLs do sitemap", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const all = readSitemapUrls();
    expect(all.length).toBeGreaterThan(0);
    const sampled = sample(all, 50);
    const rows: Array<{ url: string; title: string }> = [];

    for (const url of sampled) {
      const res = await page.goto(isolatedUrl(url), { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
      expect(res?.ok(), `HTTP inválido em ${url}`).toBe(true);
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1", undefined, { timeout: 10000 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Um title não vazio pode ser apenas o fallback estático da home.
      if (url !== "/") {
        await expect(page).not.toHaveTitle("Técnico de Informática em Curitiba | Conserto de PC e Notebook");
      }
      const title = await page.title();
      expect(title.trim().length, `title vazio em ${url}`).toBeGreaterThan(0);
      rows.push({ url, title });
    }

    // Dedup check
    const seen = new Map<string, string[]>();
    for (const r of rows) {
      const list = seen.get(r.title) ?? [];
      list.push(r.url);
      seen.set(r.title, list);
    }
    const duplicates = [...seen.entries()].filter(([, urls]) => urls.length > 1);

    // Dump CSV sempre (inspeção manual).
    const outDir = path.join(testInfo.project.outputDir, "..", "..");
    const csvPath = path.join(outDir, "titles-dump.csv");
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(
      csvPath,
      "url,title\n" +
        rows.map((r) => `"${r.url}","${r.title.replace(/"/g, '""')}"`).join("\n"),
    );

    if (duplicates.length) {
      console.error("Títulos duplicados:\n" + duplicates.map(([t, u]) => `  "${t}" → ${u.join(", ")}`).join("\n"));
    }
    expect(duplicates, `Títulos duplicados encontrados: ${duplicates.length}`).toHaveLength(0);
  });
});
