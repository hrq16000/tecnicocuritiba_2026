import { test, expect, type Page } from "@playwright/test";
import { expectFunnelStep, fillFunnelContext, advanceFromModality } from "./utils/funnelSteps";

/**
 * Regressão mobile:
 *  1. TODA combinação (equipamento × sintoma amostra) DEVE passar pela etapa 3
 *     (contexto detalhado). Nenhum path pode pular direto para modalidade/confirmação.
 *  2. Após clicar "Agendar agora", o localStorage do funil é limpo e o dialog fecha —
 *     não há resurgimento do modal, não há regressão para etapa anterior.
 */

const CASES: Array<{ eq: RegExp; marca?: RegExp; sintoma: RegExp; label: string }> = [
  { eq: /PC \/ Notebook/i, marca: /^Dell$/, sintoma: /Lento \/ travando/i, label: "pc-lento" },
  { eq: /PC \/ Notebook/i, marca: /^HP$/, sintoma: /Não liga/i, label: "pc-nao-liga" },
  { eq: /^TV$/i, marca: /^Samsung$/, sintoma: /Não liga/i, label: "tv-nao-liga" },
  { eq: /Celular/i, marca: /^iPhone \(Apple\)$/, sintoma: /Tela trincada \/ quebrada/i, label: "celular-tela" },
  { eq: /^Outro$/i, sintoma: /./, label: "outro-branch" },
];

async function stubs(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = () => {};
    (window as unknown as { __waUrls: string[] }).__waUrls = [];
    const orig = window.open.bind(window);
    window.open = ((url?: string | URL) => {
      const href = typeof url === "string" ? url : url?.toString() || "";
      (window as unknown as { __waUrls: string[] }).__waUrls.push(href);
      return null;
    }) as typeof window.open;
  });
}

test.describe("Mobile — funil nunca pula etapa 3", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const c of CASES) {
    test(`[${c.label}] passa pela etapa 3 e reseta após envio`, async ({ page }) => {
      await stubs(page);
      await page.goto("/?entry_popup=0");
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("wa-funnel:open", { detail: { location: "test" } }));
      });
      const dialog = page.getByRole("dialog", { name: /Triagem —/ });
      await expect(dialog).toBeVisible({ timeout: 5000 });

      await expectFunnelStep(dialog, 1);
      await dialog.getByRole("button", { name: c.eq }).first().click();
      await expectFunnelStep(dialog, 2);
      if (c.label === "outro-branch") {
        await dialog.getByPlaceholder(/Ex: micro-ondas/i).fill("Micro-ondas Consul");
        await dialog.getByPlaceholder(/Conte o defeito/i).fill("Não esquenta desde ontem.");
        await dialog.getByRole("button", { name: "1–3 anos", exact: true }).click();
      } else {
        await dialog.getByRole("button", { name: c.marca! }).first().click();
        await dialog.getByRole("button", { name: c.sintoma }).first().click();
      }

      // Confirma que etapa 3 é visitada e preenchida antes da modalidade.
      await fillFunnelContext(dialog);
      const requiresColeta = ["pc-nao-liga", "tv-nao-liga", "celular-tela"].includes(c.label);
      await advanceFromModality(dialog, requiresColeta);
      await dialog.getByRole("checkbox", { name: /valor mínimo/i }).check();

      const submit = dialog.getByRole("button", { name: /Agendar agora|Abrindo WhatsApp/i });
      await expect(submit).toBeEnabled({ timeout: 5000 });
      await submit.click();

      await page.waitForURL(/\/obrigado/, { timeout: 5000 });

      // Dialog fechado.
      await expect(dialog).toBeHidden();

      // Estado do funil limpo (nenhuma das chaves conhecidas persistiu).
      const persisted = await page.evaluate(() =>
        ["wa_funnel_state_v5", "wa_funnel_state_v6"].map((k) => localStorage.getItem(k)),
      );
      expect(persisted.every((v) => v === null)).toBe(true);

      // Exatamente 1 chamada wa.me.
      const opened = await page.evaluate(
        () => (window as unknown as { __waUrls: string[] }).__waUrls.filter((u) => u.includes("wa.me")),
      );
      expect(opened.length).toBe(1);
    });
  }
});
