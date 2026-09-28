"use client";

/**
 * Grafite · Atlas · Carta. Cada botão mostra a própria paleta numa amostra de
 * duas metades — fundo e destaque —, porque o nome sozinho não diz nada.
 *
 * A troca é instantânea (tokens CSS) e fica guardada num cookie; o próximo
 * carregamento já vem do servidor na paleta escolhida. Ver `lib/palette.ts`.
 */

import { PALETTES } from "@/lib/palette";
import { applyPalette, usePalette } from "@/lib/use-palette";

export function PaletteSwitcher() {
  const active = usePalette();

  return (
    <div role="group" aria-label="Paleta de cores" className="flex items-center gap-1.5">
      <span className="eyebrow text-[10px] max-lg:hidden">Paleta</span>
      {PALETTES.map((palette) => (
        <button
          key={palette.id}
          type="button"
          aria-pressed={active === palette.id}
          aria-label={`Paleta ${palette.label}`}
          title={`${palette.label} — ${palette.hint}`}
          onClick={() => applyPalette(palette.id)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border py-1 pl-[5px] pr-2 text-xs text-muted transition-colors hover:text-primary aria-pressed:border-primary aria-pressed:text-primary max-lg:pr-[5px]"
        >
          <span
            aria-hidden
            className="size-3.5 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(128,128,128,0.35)]"
            style={{
              background: `linear-gradient(135deg, ${palette.bg} 55%, ${palette.accent} 55%)`,
            }}
          />
          <span className="max-lg:hidden">{palette.label}</span>
        </button>
      ))}
    </div>
  );
}
