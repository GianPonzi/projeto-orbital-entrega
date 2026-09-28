"use client";

/**
 * "Filtros" recolhível — favoritas, status, categorias e subcategorias, e o
 * lápis que edita a taxonomy.
 *
 * Um componente só para as duas vistas: o índice do mapa e a galeria filtram
 * a mesma lista pelo mesmo estado da store, e dois painéis diferentes
 * divergiriam no primeiro ajuste.
 *
 * Recolhido por padrão: filtros se ajustam de vez em quando, e a lista é o que
 * se usa o tempo todo. O número ao lado do rótulo é o que impede um filtro
 * esquecido de esconder empresas em silêncio.
 */

import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUSES } from "@/lib/status";
import { useAppStore } from "@/lib/store";
import { CategoryFilter } from "@/components/sidebar/CategoryFilter";
import { QuickFilters } from "@/components/sidebar/QuickFilters";

/** Quantos filtros estão fora do padrão. */
function useActiveFilterCount(): number {
  const excluded = useAppStore((s) => s.excludedCategories.size);
  const subcategories = useAppStore((s) => s.activeSubcategories.size);
  const favoriteOnly = useAppStore((s) => s.favoriteOnly);
  const statuses = useAppStore((s) => s.activeStatuses.size);
  return (
    excluded + subcategories + (favoriteOnly ? 1 : 0) + (STATUSES.length - statuses)
  );
}

export function FilterPanel({ className }: { className?: string }) {
  const activeFilters = useActiveFilterCount();

  return (
    <details className={cn("group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-0.5 text-xs text-muted hover:text-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-3 transition-transform group-open:rotate-90"
        />
        Filtros
        {activeFilters > 0 && (
          <span className="font-semibold text-accent">
            · {activeFilters} {activeFilters === 1 ? "ativo" : "ativos"}
          </span>
        )}
      </summary>
      <div className="flex flex-col gap-4 pb-1 pt-3">
        <QuickFilters />
        <CategoryFilter />
      </div>
    </details>
  );
}
