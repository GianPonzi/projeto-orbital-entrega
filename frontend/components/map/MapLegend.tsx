/**
 * Legenda do mapa — o que a forma do pin quer dizer.
 *
 * Os pins carregam quatro estados na forma (ver `.map-pin` em `globals.css`), e
 * forma sem legenda é enigma. As amostras são desenhadas com os mesmos tokens
 * dos pins, em cinza, porque a cor de verdade é a da categoria.
 */

import { cn } from "@/lib/utils";

function Dot({ size, style }: { size: number; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full bg-muted"
      style={{ width: size, height: size, ...style }}
    />
  );
}

export function MapLegend({ className }: { className?: string }) {
  return (
    <div
      aria-label="Legenda do mapa"
      className={cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-lg border border-border bg-surface/90 px-3 py-2 text-[11px] text-muted",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Dot size={7} />
        <Dot size={10} />
        <Dot size={14} />
        prioridade
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot
          size={9}
          style={{ boxShadow: "0 0 0 1.5px var(--surface), 0 0 0 3px var(--ink)" }}
        />
        favorita
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot
          size={9}
          style={{
            boxShadow: "0 0 0 3px color-mix(in oklab, var(--muted) 35%, transparent)",
          }}
        />
        capturada nesta semana
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot
          size={10}
          style={{ background: "transparent", boxShadow: "inset 0 0 0 2px var(--muted)" }}
        />
        arquivada
      </span>
    </div>
  );
}
