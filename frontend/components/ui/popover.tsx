"use client";

/**
 * Popover sobre Radix — mesmo fornecedor do `dialog` e do `tooltip`.
 *
 * ⚠️ **`modal` tem default `true` aqui, ao contrário do Radix.** Todo popover do
 * projeto abre de dentro de um `Sheet`/`Dialog`, que são Radix Dialog e já
 * travam o scroll e o foco na camada deles. Um popover não-modal aninhado ali
 * divide a gestão de foco com o diálogo pai, e o sintoma é o conteúdo abrir e
 * fechar sozinho ao primeiro clique. Modal, o popover assume a camada enquanto
 * está aberto e devolve ao fechar.
 */

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

function Popover({
  modal = true,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root modal={modal} {...props} />;
}

const PopoverTrigger = PopoverPrimitive.Trigger;

/**
 * Âncora explícita — para os casos em que quem abre o popover **não** é o
 * elemento sob o qual ele aparece. É o desenho do campo de cidade: o usuário
 * digita num `Input` normal e as sugestões descem dele, sem que o input vire
 * um botão que abre um segundo campo de busca.
 */
const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow)]",
          // Teto pela altura livre até a borda da janela, medida pelo Radix.
          // Sem isso, uma lista longa (250 países) cresce para fora da tela.
          "max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-hidden",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
