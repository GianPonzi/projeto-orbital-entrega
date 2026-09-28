"use client";

import { SORT_MODES } from "@/lib/company-groups";
import { useAppStore } from "@/lib/store";

/**
 * Recentes · Prioridade · A–Z. A ordem vive na store, e não aqui, porque o
 * índice e a galeria mostram a mesma lista: trocar numa vista troca na outra.
 */
export function SortTabs() {
  const sort = useAppStore((s) => s.sort);
  const setSort = useAppStore((s) => s.setSort);

  return (
    <div role="group" aria-label="Ordenar" className="flex gap-3.5">
      {SORT_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          aria-pressed={sort === mode.id}
          onClick={() => setSort(mode.id)}
          className="border-b-2 border-transparent py-0.5 text-sm font-medium text-muted transition-colors hover:text-primary aria-pressed:border-accent aria-pressed:text-primary"
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
