import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CheckCircle2, MessageCircle, X } from "lucide-react";
import { EQUIPMENT_BRANCHES, type Equipment } from "@/components/funnel/equipmentBranches";
import { track } from "@/lib/funnelAnalytics";
import { cn } from "@/lib/utils";

const SESSION_KEY = "entry_intent_popup_seen_v1";
const SHOW_DELAY_MS = 1200;

const EXCLUDED_PREFIXES = [
  "/admin",
  "/obrigado",
  "/funil-indisponivel",
  "/avaliar",
  "/status",
  "/exclusao-dados",
  "/politica",
  "/termos-e-condicoes",
];

export function shouldShowEntryIntent(pathname: string) {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  return !EXCLUDED_PREFIXES.some(
    (prefix) =>
      path === prefix ||
      path.startsWith(`${prefix}/`) ||
      path.startsWith(`${prefix}-`),
  );
}

function markSeen() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Storage pode estar indisponível em navegação privada/restrita.
  }
}

function hasBeenSeen() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export const EntryIntentPopup = () => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Equipment | null>(null);

  const selectedBranch = useMemo(
    () => EQUIPMENT_BRANCHES.find((branch) => branch.id === selected) ?? null,
    [selected],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("entry_popup") === "0") return;
    if (!shouldShowEntryIntent(window.location.pathname)) return;

    const force = params.get("entry_popup") === "1";
    if (!force && hasBeenSeen()) return;

    const timer = window.setTimeout(() => {
      if (!shouldShowEntryIntent(window.location.pathname)) return;

      // Se o visitante já abriu a triagem por outro CTA antes do delay,
      // não disputa a atenção com um segundo modal.
      if (document.body.getAttribute("data-funnel-open") === "1") {
        markSeen();
        return;
      }

      markSeen();
      setOpen(true);
      track("entry_intent_view", {
        source: "entry_popup",
        cta_location: "entry_popup",
      });
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  const closePopup = (reason: string) => {
    setOpen(false);
    track("entry_intent_close", {
      source: "entry_popup",
      reason,
      equipment: selected ?? "none",
      cta_location: "entry_popup",
    });
  };

  const selectEquipment = (equipment: Equipment) => {
    setSelected(equipment);
    track("entry_intent_select", {
      source: "entry_popup",
      equipment,
      cta_location: "entry_popup",
    });
  };

  const startTriage = () => {
    if (!selectedBranch) return;

    track("entry_intent_continue", {
      source: "entry_popup",
      equipment: selectedBranch.id,
      cta_location: "entry_popup",
    });

    setOpen(false);
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("wa-funnel:open", {
          detail: {
            location: "entry_popup",
            equipment: selectedBranch.id,
          },
        }),
      );
    }, 80);
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && open) closePopup("dismiss");
        else setOpen(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[69] bg-slate-950/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[70] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.setTimeout(() => {
              document.querySelector<HTMLElement>("[data-entry-intent-option]")?.focus();
            }, 0);
          }}
        >
          <div className="relative flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <img
              src="/lovable-uploads/87899615-1234-4c6d-a8ca-ee38ec566ef4.webp"
              alt="Técnico em Curitiba"
              width="304"
              height="98"
              className="h-9 w-auto max-w-[132px] rounded-md bg-background/95 object-contain px-1"
            />
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-sm font-extrabold sm:text-base">
                Técnico em Curitiba
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="flex items-center gap-1.5 text-[11px] text-primary-foreground/85">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--whatsapp))]" aria-hidden="true" />
                triagem online agora
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar triagem inicial"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-primary-foreground/90 transition-colors hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto bg-muted/60 p-4">
            <div className="space-y-2">
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-background px-3.5 py-3 text-sm shadow-sm">
                Olá! <span aria-hidden="true">👋</span> Posso encaminhar você direto para a triagem certa.
                <span className="mt-1 block text-right text-[10px] text-muted-foreground">agora</span>
              </div>
              <div className="max-w-[94%] rounded-2xl rounded-tl-sm bg-background px-3.5 py-3 text-sm shadow-sm">
                O que você precisa consertar? Escolha uma opção:
                <span className="mt-1 block text-right text-[10px] text-muted-foreground">agora ✓✓</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Escolha o equipamento">
              {EQUIPMENT_BRANCHES.map((branch) => {
                const active = selected === branch.id;
                return (
                  <button
                    key={branch.id}
                    type="button"
                    data-entry-intent-option
                    aria-pressed={active}
                    onClick={() => selectEquipment(branch.id)}
                    className={cn(
                      "relative min-h-11 rounded-xl border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--whatsapp))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
                      active
                        ? "border-[hsl(var(--whatsapp))] bg-[hsl(var(--whatsapp)/0.08)] shadow-sm"
                        : "border-border",
                      branch.id === "outro" && "col-span-2",
                    )}
                  >
                    <span className="mr-1.5" aria-hidden="true">{branch.emoji}</span>
                    {branch.label}
                    {active ? (
                      <CheckCircle2
                        className="absolute right-2 top-2 h-4 w-4 text-[hsl(var(--whatsapp))]"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={startTriage}
              disabled={!selectedBranch}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--whatsapp))] px-5 text-sm font-extrabold text-white shadow-lg transition-all hover:bg-[hsl(var(--whatsapp-hover))] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {selectedBranch ? `Iniciar triagem de ${selectedBranch.label}` : "Escolha uma opção"}
            </button>

            <button
              type="button"
              onClick={() => closePopup("agora_nao")}
              className="mt-2 w-full rounded-md py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Agora não
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default EntryIntentPopup;
