import { test, expect, type ConsoleMessage } from "@playwright/test";
import { stubConsoleDependencies } from "./utils/stubConsoleDependencies";

/**
 * Gate de console: percorrer a triagem (PF e PJ) não pode produzir NENHUM
 * erro novo no console nem exceção de página — em desktop e no mobile
 * pequeno (320x568). Ruído externo conhecido é filtrado pela allowlist.
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

const ALLOW = [
  /favicon/i,
  /net::ERR_(BLOCKED_BY_CLIENT|INTERNET_DISCONNECTED)/i,
  /google-analytics|googletagmanager|gtag|doubleclick|sentry\.io/i,
  /Failed to load resource.*(analytics|fonts)/i,
];

const isNoise = (text: string) => ALLOW.some((re) => re.test(text));

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile-320", width: 320, height: 568 },
];

for (const vp of VIEWPORTS) {
  test(`triagem PF x PJ sem erros de console (${vp.name})`, async ({ page }) => {
    await stubConsoleDependencies(page);
    const errors: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (!isNoise(text)) errors.push(`[console] ${text}`);
    });
    page.on("pageerror", (err) => {
      if (!isNoise(String(err))) errors.push(`[pageerror] ${err.message}`);
    });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${BASE}/?entry_popup=0`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    // CTA real e passos explícitos; não clicar arbitrariamente ou engolir falhas.
    await page.getByTestId("whatsapp-float").click();
    const dialog = page.getByRole("dialog", { name: /Triagem —/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "PC / Notebook", exact: true }).click();
    await dialog.getByRole("button", { name: "Dell", exact: true }).click();
    await dialog.getByRole("button", { name: "Lento / travando", exact: true }).click();
    await expect(dialog.getByText("3. Conte um pouco mais", { exact: false })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Rota B2B (PJ) — mesma exigência de console limpo.
    await page.goto(`${BASE}/suporte-empresas?entry_popup=0`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    expect(errors, `erros de console em ${vp.name}:\n${errors.join("\n")}`).toEqual([]);
  });
}
