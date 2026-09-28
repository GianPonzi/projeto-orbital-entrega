"use client";

import { cn } from "@/lib/utils";
import { STATUSES } from "@/lib/status";
import { useAppStore } from "@/lib/store";

const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-[3px] text-xs transition-[color,opacity,border-color]";

/** Só favoritas + os quatro status, como chips de ligar e desligar. */
export function QuickFilters() {
  const favoriteOnly = useAppStore((s) => s.favoriteOnly);
  const toggleFavoriteOnly = useAppStore((s) => s.toggleFavoriteOnly);
  const activeStatuses = useAppStore((s) => s.activeStatuses);
  const toggleStatus = useAppStore((s) => s.toggleStatus);

  return (
    <div role="group" aria-label="Favoritas e status" className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={favoriteOnly}
        onClick={toggleFavoriteOnly}
        className={cn(
          CHIP,
          favoriteOnly
            ? "border-accent bg-accent/12 text-primary"
            : "text-muted hover:text-primary",
        )}
      >
        ★ Só favoritas
      </button>

      {STATUSES.map((status) => {
        const active = activeStatuses.has(status.id);
        return (
          <button
            key={status.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggleStatus(status.id)}
            className={cn(CHIP, active ? "text-primary" : "text-muted opacity-60")}
          >
            {/* Desligado vira anel: a cor continua dizendo qual é, e a
                ausência de preenchimento diz que está fora do filtro. */}
            <span
              aria-hidden
              className="size-[7px] rounded-full"
              style={
                active
                  ? { backgroundColor: status.color }
                  : { boxShadow: `inset 0 0 0 1.5px ${status.color}` }
              }
            />
            {status.label}
          </button>
        );
      })}
    </div>
  );
}
