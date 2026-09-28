"use client";

/**
 * Barra superior: marca, a entrada do ⌘K e a captura.
 *
 * O campo do meio **parece** uma busca, mas é um botão: ele abre a paleta de
 * buscar ou capturar (`CommandPalette`). Um campo de verdade aqui competiria
 * com ela — duas buscas com regras diferentes na mesma tela.
 *
 * "Capturar" é o único botão com cor de destaque na tela inteira: é a métrica
 * que decide empates neste produto, e fica sempre a um clique.
 */

import { MessageCircle, Plus, Search } from "lucide-react";

import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { PaletteSwitcher } from "@/components/shell/PaletteSwitcher";

/** A marca: um núcleo, uma órbita inclinada e um satélite nela. */
function OrbitMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4.2"
        transform="rotate(-24 12 12)"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="20.2" cy="8.4" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function TopBar() {
  const openAdd = useAppStore((s) => s.openAdd);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const chatOpen = useAppStore((s) => s.chatOpen);
  const setChatOpen = useAppStore((s) => s.setChatOpen);

  return (
    <header className="relative z-30 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border bg-surface px-4 py-2.5">
      <div className="flex shrink-0 items-center gap-2.5 text-primary">
        <OrbitMark className="size-[22px] text-accent" />
        <span className="wordmark">ORBITAL</span>
      </div>

      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setCommandOpen(true)}
        className="order-3 flex h-9 min-w-0 basis-full items-center gap-2.5 rounded-lg border border-border bg-sunken pl-3 pr-2.5 text-left text-sm text-muted transition-colors hover:border-border-strong md:order-none md:max-w-[520px] md:flex-1 md:basis-auto"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="flex-1 truncate">Buscar ou capturar empresa…</span>
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted max-md:hidden">
          ⌘K
        </kbd>
      </button>

      <div
        role="group"
        aria-label="Vista"
        className="inline-flex gap-0.5 rounded-lg border border-border bg-sunken p-[3px]"
      >
        {(
          [
            ["mapa", "Mapa"],
            ["galeria", "Galeria"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className="rounded-[5px] px-3 py-[5px] text-sm font-medium text-muted transition-colors hover:text-primary aria-pressed:bg-surface aria-pressed:text-primary aria-pressed:shadow-[0_1px_0_var(--rule)]"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <PaletteSwitcher />
        {/* Abre e fecha: o painel não é modal, então o mesmo botão o recolhe. */}
        <Button
          variant="secondary"
          aria-pressed={chatOpen}
          onClick={() => setChatOpen(!chatOpen)}
          className="aria-pressed:border-accent/60 aria-pressed:text-accent"
        >
          <MessageCircle />
          Perguntar
        </Button>
        <Button variant="accent" onClick={() => openAdd()}>
          <Plus />
          Capturar
        </Button>
      </div>
    </header>
  );
}
