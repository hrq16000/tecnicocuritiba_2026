import { describe, expect, it } from "vitest";
import { shouldShowEntryIntent } from "./EntryIntentPopup";

describe("shouldShowEntryIntent", () => {
  it("exibe o gateway nas rotas publicas de conversao", () => {
    expect(shouldShowEntryIntent("/")).toBe(true);
    expect(shouldShowEntryIntent("/servicos")).toBe(true);
    expect(shouldShowEntryIntent("/tecnico-informatica-curitiba")).toBe(true);
  });

  it("nao interrompe admin, pos-conversao e rotas legais", () => {
    expect(shouldShowEntryIntent("/admin")).toBe(false);
    expect(shouldShowEntryIntent("/admin/metricas")).toBe(false);
    expect(shouldShowEntryIntent("/obrigado")).toBe(false);
    expect(shouldShowEntryIntent("/status-os")).toBe(false);
    expect(shouldShowEntryIntent("/politica-privacidade")).toBe(false);
    expect(shouldShowEntryIntent("/termos-e-condicoes")).toBe(false);
  });
});
