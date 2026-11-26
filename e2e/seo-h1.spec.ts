import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { abs } from "./utils/baseUrl";

// SEO gate — cada URL indexável deve ter exatamente 1 <h1>.
// Amostra 50 URLs do sitemap para manter o CI rápido.

const readSitemapUrls = async (): Promise<string[]> => {
  const publicDir = path.resolve(process.cwd(), "public");
  const indexPath = path.join(publicDir, "sitemap-index.xml");
  if (!fs.existsSync(indexPath)) throw new Error("sitemap-index.xml não encontrado em /public");
  const indexXml = fs.readFileSync(indexPath, "utf8");
  const childSitemaps = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .map((u) => u.replace(/^https?:\/\/[^/]+/, ""))
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
  const ordered = [...arr].sort((a, b) => String(a).localeCompare(String(b)));
  if (ordered.length <= n) return ordered;
  return Array.from({ length: n }, (_, i) =>
    ordered[Math.floor(((i + 0.5) * ordered.length) / n)],
  );
};

test.describe("SEO: cada URL indexável tem exatamente 1 <h1>", () => {
  test("amostra determinística de 50 URLs do sitemap", async ({ page }) => {
    test.setTimeout(120_000);
    const all = await readSitemapUrls();
    expect(all.length, "sitemap deve ter URLs").toBeGreaterThan(0);
    const sampled = sample(all, 50);
    const failures: Array<{ url: string; count: number; error?: string }> = [];

    for (const url of sampled) {
      const routePage = await page.context().newPage();
      try {
        const res = await routePage.goto(isolatedUrl(url), { waitUntil: "domcontentloaded", timeout: 15000 });
        if (!res || !res.ok()) {
          failures.push({ url, count: -1, error: `HTTP ${res?.status() ?? "sem resposta"}` });
          continue;
        }
        await routePage.waitForFunction(() => document.documentElement.dataset.hydrated === "1", undefined, { timeout: 15000 });
        await expect(routePage.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10000 });
        const count = await routePage.locator("h1").count();
        if (count !== 1) failures.push({ url, count });
      } catch (error) {
        failures.push({ url, count: -1, error: error instanceof Error ? error.message : String(error) });
      } finally {
        await routePage.close();
      }
    }

    if (failures.length) {
      console.error("H1 issues:\n" + failures.map((f) => `  ${f.count} h1 → ${f.url}${f.error ? ` — ${f.error}` : ""}`).join("\n"));
    }
    expect(failures, `URLs sem 1 h1 único: ${failures.length}`).toHaveLength(0);
  });
});
