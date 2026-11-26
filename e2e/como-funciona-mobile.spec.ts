import { test, expect, devices } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

test.use({ ...devices["iPhone 13"] });

test.describe("Como Funciona + modais — CTAs e CLS", () => {
  test("CTAs WhatsApp permanecem clicáveis e sem links tel:", async ({ page }) => {
    // Coletor de CLS via PerformanceObserver
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceEntry[]) {
          const e = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };
          if (!e.hadRecentInput && typeof e.value === "number") {
            (window as unknown as { __cls: number }).__cls += e.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto(BASE + "/?entry_popup=0", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");

    // Hidratação básica do hero antes de validar os CTAs.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Regra do projeto: sem links tel:
    const telCount = await page.locator('a[href^="tel:"]').count();
    expect(telCount).toBe(0);

    // Abre a triagem WhatsApp vigente sem navegar para o serviço externo.
    await page.getByTestId("whatsapp-float").click();
    const modal = page.getByRole("dialog", { name: /Triagem —/ });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Qual o equipamento/i)).toBeVisible();

    // Fecha a triagem pelo teclado e continua validando os CTAs da página.
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();

    // Scroll até "Como funciona" e verifica CTAs por etapa
    await page.evaluate(() => {
      const el = document.getElementById("como-funciona-fluxo");
      el?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    });
    for (let i = 1; i <= 4; i++) {
      const cta = page.getByTestId(`como-funciona-cta-${i}`);
      await expect(cta).toBeVisible();
      await expect(cta).toBeEnabled();
      const href = await cta.getAttribute("href");
      expect(href).toContain("wa.me");
    }

    // Sticky WhatsApp mobile permanece visível e clicável
    const sticky = page.locator('[data-cta-location="sticky_mobile"]');
    await expect(sticky).toBeVisible();
    await expect(sticky).toBeEnabled();

    // CLS abaixo do limite aceitável após interações
    await page.waitForTimeout(800);
    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls || 0,
    );
    expect(cls, `CLS regrediu: ${cls}`).toBeLessThan(0.1);
  });
});
