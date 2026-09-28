"use client";

/**
 * A casca: barra superior e, embaixo, uma de duas vistas — o mapa (índice à
 * esquerda, mapa como palco) ou a galeria de fichas.
 *
 * No desktop tudo cabe numa tela (`h-dvh`) e só as listas rolam. No celular o
 * mapa vem primeiro, com pouco mais de meia tela, e o índice segue embaixo —
 * a página inteira rola, porque uma lista espremida numa faixa de 40% da tela
 * não serve para nada.
 */

import dynamic from "next/dynamic";
import { Orbit } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastViewport } from "@/components/ui/toast";
import { TopBar } from "@/components/shell/TopBar";
import { CommandPalette } from "@/components/command/CommandPalette";
import { CompanyIndex } from "@/components/index/CompanyIndex";
import { CompanyGallery } from "@/components/gallery/CompanyGallery";
import { RegionSwitcher } from "@/components/RegionSwitcher";
import { MapLegend } from "@/components/map/MapLegend";
import { CompanyDetailPanel } from "@/components/detail/CompanyDetailPanel";
import { AddCompanySheet } from "@/components/add/AddCompanySheet";
import { EditCompanySheet } from "@/components/edit/EditCompanySheet";
import { ChatPanel } from "@/components/chat/ChatPanel";

// MapLibre is WebGL/`window`-bound: load it on the client only, no SSR.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-sea">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Orbit className="size-6 animate-spin text-accent [animation-duration:3s]" />
        <span className="eyebrow">Carregando mapa…</span>
      </div>
    </div>
  ),
});

export function AppShell() {
  // Só o booleano: a casca re-renderiza ao abrir e fechar o painel, não a
  // cada troca de empresa selecionada.
  const detailOpen = useAppStore((s) => s.selectedId !== null);
  const view = useAppStore((s) => s.view);

  return (
    <TooltipProvider delayDuration={300}>
      <main className="relative flex min-h-dvh flex-col bg-canvas md:h-dvh md:min-h-0">
        <TopBar />

        {/* Área de conteúdo — é nela que o painel de detalhe se ancora, nas
            duas vistas. */}
        <div className="relative flex-1 md:min-h-0">
          {/* O mapa fica montado mesmo com a galeria na frente, só oculto:
              a volta é instantânea, com o enquadramento de antes, sem recriar
              o WebGL. `hidden` vai como classe, não como atributo — o `grid`
              do Tailwind venceria o `display: none` do atributo. */}
          <div
            className={cn(
              "md:h-full md:grid-cols-[340px_1fr]",
              view === "mapa" ? "grid" : "hidden",
            )}
          >
            <CompanyIndex className="order-2 md:order-none" />

            {/* `data-detail` avisa o CSS que o painel ocupa a borda direita:
                o zoom do MapLibre e a legenda abrem espaço para ele. */}
            <section
              aria-label="Mapa"
              data-detail={detailOpen ? "open" : undefined}
              className="group/stage relative order-1 h-[56vh] min-h-80 overflow-hidden md:order-none md:h-full md:min-h-0"
            >
              <MapCanvas />
              <RegionSwitcher className="absolute left-3.5 top-3.5 z-10" />
              <MapLegend className="absolute bottom-3.5 left-3.5 z-10 max-w-[calc(100%-5rem)] max-md:hidden md:group-data-[detail=open]/stage:max-w-[calc(100%-380px-5rem)]" />
            </section>
          </div>

          {view === "galeria" && (
            <CompanyGallery
              className={cn(
                "scrollarea md:h-full md:overflow-y-auto",
                // O painel cobre 380px à direita; a grade abre espaço para
                // ele em vez de esconder a última coluna de fichas.
                detailOpen && "md:pr-[380px]",
              )}
            />
          )}

          {/* Encaixado na borda direita no desktop; folha de baixo no celular
              (aí ele vai para um portal e o lugar não importa). */}
          <CompanyDetailPanel />
        </div>

        <CommandPalette />
        <ChatPanel />
        <AddCompanySheet />
        <EditCompanySheet />

        {/* Avisos de escrita — regra dura nº 10 */}
        <ToastViewport />
      </main>
    </TooltipProvider>
  );
}
