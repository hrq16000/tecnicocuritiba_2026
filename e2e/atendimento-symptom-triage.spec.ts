import { test, expect } from "@playwright/test";

/**
 * Valida que sintomas leves (que viram visita) chegam ao WhatsApp com
 * `category` e `symptomSlug` corretos a partir da rota atual — usa o
 * flag `?e2e=1&category=...&symptomSlug=...` para simular a saída da
 * triagem sem depender de Supabase.
 *
 * Também confirma que o payload de tracking (dataLayer / window.__ctaTracked)
 * recebe origem, bairro e serviço de forma consistente em /atendimento/:cidade
 * e /atendimento/:cidade/:bairro.
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

test.beforeEach(async ({ context, page }) => {
  await context.route("https://wa.me/**", (r) => r.fulfill({ status: 204, body: "" }));
  await context.route(/functions\/v1\//, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }),
  );
  await page.addInitScript(() => {
    (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...args: unknown[]) => {
      (window as unknown as { dataLayer: unknown[] }).dataLayer.push(args);
    };
  });
});

const SYMPTOM_CASES = [
  {
    path: "/atendimento/curitiba?e2e=1&category=notebook&symptomSlug=lento",
    ctaLocation: "atendimento_curitiba_hero",
    expectCategory: "notebook",
    expectSymptom: "lento",
  },
  {
    path: "/atendimento/curitiba/batel?e2e=1&category=wifi&symptomSlug=cai-toda-hora",
    ctaLocation: "atendimento_curitiba_batel_hero",
    expectCategory: "wifi",
    expectSymptom: "cai-toda-hora",
    expectBairro: "curitiba/batel",
  },
];

for (const c of SYMPTOM_CASES) {
  test(`WhatsApp de ${c.path} inclui category+symptomSlug`, async ({ page }) => {
    await page.goto(`${BASE}${c.path}&entry_popup=0`, { waitUntil: "domcontentloaded" });

    const hero = page.locator(`a[data-cta-location="${c.ctaLocation}"]`);
    await expect(hero).toBeVisible();
    const href = await hero.getAttribute("href");
    const decoded = decodeURIComponent(href || "");

    expect(href, "wa.me href").toMatch(/wa\.me\/5541997452053/);
    // Rastro [ref: category/symptomSlug] deve estar embutido na mensagem
    expect(decoded).toContain(c.expectCategory);
    expect(decoded).toContain(c.expectSymptom);

    // Tracking: clicar o botão e checar dataLayer
    await hero.click();
    await expect(page.getByRole("dialog", { name: /Triagem —/ })).toBeVisible();
    const events = await page.evaluate(
      () => (window as unknown as { dataLayer: unknown[][] }).dataLayer || [],
    );
    const ctaEvent = events.find(
      (e) => e && e[0] === "event" && e[1] === "cta_click",
    );
    expect(ctaEvent, "cta_click emitido").toBeTruthy();
    const payload = (ctaEvent as unknown[])[2] as Record<string, unknown>;
    expect(payload.cta_location).toBe(c.ctaLocation);
    expect(payload.category).toBe(c.expectCategory);
    expect(payload.symptom_slug).toBe(c.expectSymptom);
    expect(payload.servico).toMatch(/atendimento_/);
    if (c.expectBairro) expect(payload.bairro).toBe(c.expectBairro);
  });
}
