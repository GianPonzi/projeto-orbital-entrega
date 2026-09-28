"use client";

import { Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

/** Toggles the name chips (mini-cards) shown next to each pin on the map. */
export function MiniCardToggle() {
  const miniCardMode = useAppStore((s) => s.miniCardMode);
  const toggleMiniCardMode = useAppStore((s) => s.toggleMiniCardMode);

  return (
    <button
      type="button"
      aria-pressed={miniCardMode}
      onClick={toggleMiniCardMode}
      title="Mostrar nomes das empresas no mapa"
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-medium shadow-[var(--shadow)] transition-colors",
        miniCardMode
          ? "bg-accent text-accent-contrast"
          : "text-muted hover:bg-sunken hover:text-primary",
      )}
    >
      <Tags className="size-4" />
      Mini-Card
    </button>
  );
}
