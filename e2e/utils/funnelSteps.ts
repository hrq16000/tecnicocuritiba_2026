import { expect, type Locator } from "@playwright/test";

/** A UI avança automaticamente quando todas as respostas obrigatórias são
 * preenchidas. Verifica cada etapa em vez de competir com o auto-advance. */
export async function expectFunnelStep(dialog: Locator, step: number) {
  await expect(dialog.getByRole("heading", { name: new RegExp(`Triagem — ${step}/5`) })).toBeVisible();
}

export async function fillFunnelContext(dialog: Locator) {
  await expectFunnelStep(dialog, 3);
  await expect(dialog.getByText("3. Conte um pouco mais", { exact: false })).toBeVisible();
  await dialog.locator('[data-funnel-field="ctx-quando"]').getByRole("button", { name: "Hoje", exact: true }).click();
  const frequency = dialog.locator('[data-funnel-field="ctx-frequencia"]');
  if (await frequency.count()) {
    await frequency.getByRole("button", { name: "Só às vezes", exact: true }).click();
  }
  await dialog.locator('[data-funnel-field="ctx-tentou"]').getByRole("button", { name: "Reiniciei", exact: true }).click();
  await dialog.locator('[data-funnel-field="ctx-urgencia"]').getByRole("button", { name: /Próximas 72 horas úteis/ }).click();
  await expectFunnelStep(dialog, 4);
}

export async function advanceFromModality(dialog: Locator, requiresColeta: boolean) {
  await expectFunnelStep(dialog, 4);
  const next = dialog.getByRole("button", { name: "Continuar", exact: true });
  if (requiresColeta) {
    await expect(next).toBeDisabled();
    await dialog.locator('[data-funnel-field="coleta"]').getByRole("checkbox").check();
    await expectFunnelStep(dialog, 5);
  } else {
    await expect(dialog.locator("[data-funnel-route]")).toBeVisible();
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expectFunnelStep(dialog, 5);
}
