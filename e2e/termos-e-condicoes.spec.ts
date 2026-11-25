import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAP, NAP_PHONE_E164 } from "../src/lib/nap";

const ROUTE = "/termos-e-condicoes";

type Schema = Record<string, unknown> & { "@type"?: string | string[] };

async function collectJsonLd(page: Page): Promise<Schema[]> {
  return await page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.map((n) => {
        try { return JSON.parse(n.textContent || "null"); }
        catch { return null; }
      }).filter(Boolean)
  );
}

const hasType = (schemas: Schema[], type: string) =>
  schemas.find((s) => {
    const t = s["@type"];
    return Array.isArray(t) ? t.includes(type) : t === type;
  });

test.describe("/termos-e-condicoes — schema, canonical, single H1, sitemap consistency", () => {
  test("renders BreadcrumbList, LocalBusiness, FAQPage JSON-LD", async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    const schemas = await collectJsonLd(page);
    const breadcrumb = hasType(schemas, "BreadcrumbList");
    const localBusiness = hasType(schemas, "LocalBusiness");
    const faq = hasType(schemas, "FAQPage");

    expect(breadcrumb, "BreadcrumbList required").toBeTruthy();
    expect(localBusiness, "LocalBusiness required").toBeTruthy();
    expect(faq, "FAQPage required").toBeTruthy();

    // LocalBusiness: Curitiba in areaServed, telephone matches WhatsApp, no postal address
    const area = JSON.stringify((localBusiness as { areaServed?: unknown }).areaServed || "");
    expect(area.toLowerCase()).toContain("curitiba");
    expect((localBusiness as { telephone?: string }).telephone).toBe(NAP_PHONE_E164);
    expect(JSON.stringify(localBusiness)).not.toMatch(/PostalAddress|streetAddress/i);

    // FAQPage: minimum 5 questions
    const mainEntity = (faq as { mainEntity?: Array<{ name?: string; acceptedAnswer?: { text?: string } }> }).mainEntity || [];
    expect(mainEntity.length).toBeGreaterThanOrEqual(5);
    for (const q of mainEntity) {
      expect(q.name).toBeTruthy();
      expect(q.acceptedAnswer?.text).toBeTruthy();
    }

    // BreadcrumbList: at least 2 items, last item matches canonical
    const items = (breadcrumb as { itemListElement?: Array<{ item?: string }> }).itemListElement || [];
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[items.length - 1].item).toContain("/termos-e-condicoes");
  });

  test("single H1 + correct canonical + SEO meta tags", async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);

    const canonical = await page.locator('head link[rel="canonical"]').getAttribute("href");
    expect(canonical).toContain("/termos-e-condicoes");

    await expect(page).toHaveTitle(/Termos.*Condi[çc]/i);

    const description = await page.locator('head meta[name="description"]').getAttribute("content");
    expect(description || "").toMatch(/R\$\s?90/);
    expect(description || "").toMatch(/R\$\s?99/);

    const ogTitle = await page.locator('head meta[property="og:title"]').getAttribute("content");
    const twTitle = await page.locator('head meta[name="twitter:title"]').getAttribute("content");
    expect(ogTitle).toBeTruthy();
    expect(twTitle).toBeTruthy();
  });

  test("sitemap.xml contains /termos-e-condicoes", async () => {
    const publicDir = join(process.cwd(), "public");
    const pending = [new URL("/sitemap.xml", NAP.url)];
    const visited = new Set<string>();
    const indexed = new Set<string>();
    while (pending.length > 0) {
      const sitemap = pending.pop()!;
      expect(sitemap.origin).toBe(NAP.url);
      if (visited.has(sitemap.href)) continue;
      visited.add(sitemap.href);
      const xml = readFileSync(join(publicDir, sitemap.pathname.slice(1)), "utf8");
      const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
      expect(locations.length, `sitemap vazio: ${sitemap.pathname}`).toBeGreaterThan(0);
      if (/<sitemapindex\b/.test(xml)) {
        pending.push(...locations.map((location) => new URL(location)));
      } else {
        expect(xml).toMatch(/<urlset\b/);
        locations.forEach((location) => indexed.add(location));
      }
    }
    expect(indexed.has(new URL(ROUTE, NAP.url).href)).toBe(true);
  });

  test("h1 does not overflow on mobile and desktop", async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");
    for (const vp of [
      { width: 375, height: 812, label: "mobile" },
      { width: 1440, height: 900, label: "desktop" },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const dims = await page.locator("h1").first().evaluate((el) => ({
        sw: (el as HTMLElement).scrollWidth,
        cw: (el as HTMLElement).clientWidth,
      }));
      expect(dims.sw, `h1 overflow on ${vp.label} (${dims.sw} vs ${dims.cw})`).toBeLessThanOrEqual(dims.cw + 2);
    }
  });
});
