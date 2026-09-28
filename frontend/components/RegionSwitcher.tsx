"use client";

import { cn } from "@/lib/utils";
import { REGIONS } from "@/lib/regions";
import { useAppStore } from "@/lib/store";

/** Presets de câmera no canto do mapa. Só enquadram — não filtram nada. */
export function RegionSwitcher({ className }: { className?: string }) {
  const activeRegion = useAppStore((s) => s.activeRegion);
  const setRegion = useAppStore((s) => s.setRegion);

  return (
    <div
      role="group"
      aria-label="Enquadrar região"
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-surface p-[3px]",
        className,
      )}
    >
      {REGIONS.map((region) => (
        <button
          key={region.id}
          type="button"
          aria-pressed={activeRegion === region.id}
          onClick={() => setRegion(region.id)}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-primary aria-pressed:bg-sunken aria-pressed:text-primary"
        >
          {region.label}
        </button>
      ))}
    </div>
  );
}
