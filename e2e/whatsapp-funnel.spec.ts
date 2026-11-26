import { test, expect, type Page } from "@playwright/test";
import { expectFunnelStep, fillFunnelContext, advanceFromModality } from "./utils/funnelSteps";

const HOME = "/";
const UTM_QS = "?entry_popup=0&utm_source=ci&utm_medium=cpc&utm_campaign=funnel_v3_e2e&gclid=CI_GCLID_777";

async function installGtagSpy(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __gtagCalls: unknown[][] }).__gtagCalls = [];
    (window as unknown as { dataLayer: unknown[] }).dataLayer = [];
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = function (...args: unknown[]) {
      (window as unknown as { __gtagCalls: unknown[][] }).__gtagCalls.push(args);
      (window as unknown as { dataLayer: unknown[] }).dataLayer.push(args);
    };
  });
}

async function openFunnel(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("wa-funnel:open", { detail: { location: "test" } }));
  });
  const dialog = page.getByRole("dialog", { name: /Triagem —/ });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return dialog;
}

test.describe("WhatsAppFunnel v3 — funil ramificado por equipamento (texto-only)", () => {
  test.beforeEach(async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installGtagSpy(page);
    await context.route("https://wa.me/**", (route) => route.fulfill({ status: 204, body: "" }));
    await context.route("https://www.googletagmanager.com/gtag/js?**", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  });

  test("branch TV 'não liga' exige aceite de Coleta com R$ 300", async ({ page }) => {
    await page.goto(`${HOME}${UTM_QS}`);
    await page.waitForLoadState("networkidle");
    const dialog = await openFunnel(page);

    await dialog.getByRole("button", { name: /^TV$/i }).first().click();

    await expectFunnelStep(dialog, 2);
    await dialog.getByRole("button", { name: /^Samsung$/i }).first().click();
    await dialog.getByRole("button", { name: /^Não liga(?:\s*COLETA)?$/i }).first().click();
    await fillFunnelContext(dialog);

    await expect(dialog.getByText(/Coleta e Entrega/i).first()).toBeVisible();
    await expect(dialog.getByText(/R\$ 300/i).first()).toBeVisible();
    const nextBtn = dialog.getByRole("button", { name: /Continuar/i });
    await expect(nextBtn).toBeDisabled();
  });

  test("branch PC 'lento' não exige coleta e vai direto à confirmação com aviso de vídeo", async ({ page }) => {
    await page.goto(`${HOME}${UTM_QS}`);
    await page.waitForLoadState("networkidle");
    const dialog = await openFunnel(page);

    await dialog.getByRole("button", { name: /PC \/ Notebook/i }).click();
    await dialog.getByRole("button", { name: /^Dell$/ }).click();
    await dialog.getByRole("button", { name: /Lento \/ travando/i }).click();
    await fillFunnelContext(dialog);
    await advanceFromModality(dialog, false);

    await expect(dialog.getByText(/Triagem completa/i)).toBeVisible();
    await dialog.getByText(/Próximo passo no WhatsApp/i).click();
    await expect(dialog.getByText(/sem áudio/i)).toBeVisible();
    const submit = dialog.getByRole("button", { name: /Agendar agora/i });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel(/valor mínimo.*R\$ 99,99/i).click();
    await expect(submit).toBeEnabled();
  });

  test("botão flutuante abre funil e eventos preservam click_location/app_version", async ({ page }) => {
    await page.goto(`${HOME}${UTM_QS}`);
    await page.waitForLoadState("domcontentloaded");
    await page.getByTestId("whatsapp-float").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expectFunnelStep(dialog, 1);
    await expect(dialog.getByText(/WhatsApp humano abre/i)).toBeVisible();

    const events = await page.evaluate(() => (window as unknown as { __waFunnelEvents?: Array<{ name: string; payload: Record<string, unknown> }> }).__waFunnelEvents || []);
    const opened = events.find((e) => e.name === "wa_funnel_open");
    expect(opened?.payload.click_location).toBe("float");
    expect(opened?.payload.app_version).toBeTruthy();
  });

  test("branch 'Outro' pula coleta e exige descrição mínima", async ({ page }) => {
    await page.goto(`${HOME}${UTM_QS}`);
    await page.waitForLoadState("networkidle");
    const dialog = await openFunnel(page);

    await dialog.getByRole("button", { name: /^Outro$/i }).click();
    const nextBtn = dialog.getByRole("button", { name: /Continuar/i });
    await expect(nextBtn).toBeDisabled();
    await dialog.getByPlaceholder(/Ex: micro-ondas/i).fill("Micro-ondas Consul");
    await dialog.getByPlaceholder(/Conte o defeito/i).fill("Não esquenta desde ontem, faz barulho estranho.");
    await dialog.getByRole("button", { name: /^1–3 anos$/ }).click();
    await expectFunnelStep(dialog, 3);
  });

  test("GA4 dispara wa_funnel_open com UTM payload", async ({ page }) => {
    await page.goto(`${HOME}${UTM_QS}`);
    await page.waitForLoadState("networkidle");
    await openFunnel(page);
    const calls = await page.evaluate(() => (window as unknown as { dataLayer: unknown[][] }).dataLayer);
    const open = calls.find((c) => c[0] === "event" && c[1] === "wa_funnel_open");
    expect(open).toBeTruthy();
    expect(open?.[2]).toMatchObject({ utm_source: "ci", utm_medium: "cpc", utm_campaign: "funnel_v3_e2e" });
  });

  test("link 'Termos e Condições' resolve a rota pública /termos-e-condicoes", async ({ page }) => {
    const res = await page.goto("/termos-e-condicoes?entry_popup=0");
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("rota de fallback /funil-indisponivel carrega e mostra CTA WhatsApp", async ({ page }) => {
    await page.goto("/funil-indisponivel?entry_popup=0");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const wa = page.locator('a[href*="wa.me/5541997452053"][data-funnel-skip="1"]');
    await expect(wa).toBeVisible();
  });
});

test.describe("WhatsAppFunnel v3 — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("modal abre e mostra seleção de equipamento", async ({ page, context }) => {
    await installGtagSpy(page);
    await context.route("https://wa.me/**", (route) => route.fulfill({ status: 204, body: "" }));
    await page.goto(`${HOME}?entry_popup=0`);
    await page.waitForLoadState("networkidle");
    const dialog = await openFunnel(page);
    await expect(dialog.getByText(/Qual o equipamento/i)).toBeVisible();
  });
});


/** Entrada pública: validação isolada, sem Supabase real, analytics remoto ou WhatsApp. */
for (const width of [390, 1440]) {
  test.describe("Entrada — integração real " + width + "px", () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test("sete categorias, teclado, sessão e pré-seleção TV", async ({ page, context, baseURL }) => {
      const origin = new URL(baseURL || "http://localhost:8080").origin;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)) {
        throw new Error("Este teste exige preview local isolado.");
      }
      await context.route("**/*", route =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
      );
      await page.goto("/");
      const popup = page.getByRole("dialog", { name: "Técnico em Curitiba", exact: true });
      await expect(popup).toBeVisible({ timeout: 15000 });
      const options = popup.locator("[data-entry-intent-option]");
      await expect(options).toHaveCount(7);
      for (const label of ["PC / Notebook", "TV", "Celular / Tablet", "Surface", "Som / Áudio", "Videogame", "Outro"]) {
        await expect(popup.getByRole("button", { name: label, exact: true })).toBeVisible();
      }
      await expect(popup.getByRole("button", { name: "Escolha uma opção" })).toBeDisabled();
      await expect(options.first()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(popup.locator(":focus")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
      await page.waitForTimeout(1600);
      await expect(popup).toBeHidden();

      await page.goto("/?entry_popup=1");
      await expect(popup).toBeVisible({ timeout: 15000 });
      await popup.getByRole("button", { name: "Fechar triagem inicial" }).click();
      await expect(popup).toBeHidden();
      await page.reload();
      await expect(popup).toBeVisible({ timeout: 15000 });
      await popup.getByRole("button", { name: "Agora não" }).click();
      await expect(popup).toBeHidden();

      await page.reload();
      await expect(popup).toBeVisible({ timeout: 15000 });
      await popup.getByRole("button", { name: "TV", exact: true }).click();
      await expect(popup.getByRole("button", { name: "TV", exact: true })).toHaveAttribute("aria-pressed", "true");
      await popup.getByRole("button", { name: "Iniciar triagem de TV" }).click();
      await expect(popup).toBeHidden();
      const funnel = page.getByRole("dialog", { name: /Triagem — 2\// });
      await expect(funnel).toBeVisible({ timeout: 10000 });
      await expect(funnel.getByRole("button", { name: "Samsung", exact: true })).toBeVisible();
      await expect(funnel.getByText("1. Qual o equipamento?")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(1);
      const events = await page.evaluate(() => window.__waFunnelEvents || []);
      for (const name of ["entry_intent_view", "entry_intent_select", "entry_intent_continue", "wa_funnel_preselect", "wa_funnel_open"]) {
        expect(events.some(e => e.name === name && e.payload.cta_location === "entry_popup")).toBeTruthy();
      }
      expect(events.some(e => e.name === "wa_funnel_preselect" && e.payload.equipamento === "tv")).toBeTruthy();
      const bounds = await funnel.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    });
  });
}
