"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, ChevronRight, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { moveCategoryAction } from "@/app/actions/taxonomy";
import type { CategoryMeta } from "@/lib/categories";
import { useTaxonomy } from "@/lib/data-context";
import {
  useAppStore,
  useCategoryCounts,
  useSubcategoryCounts,
} from "@/lib/store";
import { CategoryDialog } from "@/components/sidebar/CategoryDialog";
import { SubcategoryEditor } from "@/components/sidebar/SubcategoryEditor";

export function CategoryFilter() {
  const { categories } = useTaxonomy();
  const counts = useCategoryCounts();
  const subCounts = useSubcategoryCounts();
  const excludedCategories = useAppStore((s) => s.excludedCategories);
  const toggleCategory = useAppStore((s) => s.toggleCategory);
  const resetCategories = useAppStore((s) => s.resetCategories);
  const activeSubcategories = useAppStore((s) => s.activeSubcategories);
  const toggleSubcategory = useAppStore((s) => s.toggleSubcategory);
  const notify = useAppStore((s) => s.notify);

  /**
   * ── Por que edição é um MODO, e não botões sempre visíveis ──
   * O índice tem 340px e cada linha já carrega bolinha de cor, label, contagem
   * de subcategorias selecionadas e contagem de empresas. Pendurar lápis, setas
   * e lixeira em tudo espremeria o que se usa o tempo todo por causa do que se
   * usa raramente. E os cliques colidem: no modo normal clicar filtra, no de
   * edição clicar abre o formulário.
   */
  const [editMode, setEditMode] = useState(false);
  /** `"new"` = criar; um objeto = editar aquela. */
  const [dialogFor, setDialogFor] = useState<CategoryMeta | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  function move(slug: string, direction: "up" | "down") {
    startTransition(async () => {
      try {
        const result = await moveCategoryAction(slug, direction);
        if (!result.ok) notify(result.error);
      } catch (error) {
        console.error("[orbital] moveCategoryAction lançou:", error);
        notify(
          "Não foi possível reordenar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Nada excluído = tudo visível. Não depende mais de saber quantas categorias
  // existem, que era o acoplamento à taxonomy em escopo de módulo.
  const allActive = excludedCategories.size === 0;
  const anySub = activeSubcategories.size > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          Categorias
        </span>
        <div className="flex items-center gap-2">
          {!editMode && (!allActive || anySub) && (
            <button
              type="button"
              onClick={resetCategories}
              className="text-xs font-medium text-accent transition-colors hover:brightness-110"
            >
              Mostrar todas
            </button>
          )}
          <button
            type="button"
            aria-pressed={editMode}
            aria-label={editMode ? "Concluir edição" : "Editar categorias"}
            title={editMode ? "Concluir edição" : "Editar categorias"}
            onClick={() => setEditMode((prev) => !prev)}
            className={cn(
              "flex size-6 items-center justify-center rounded transition-colors",
              editMode
                ? "bg-accent/20 text-accent"
                : "text-muted hover:text-primary",
            )}
          >
            {editMode ? (
              <Check className="size-3.5" />
            ) : (
              <Pencil className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {editMode && (
        <p className="px-0.5 text-[11px] leading-snug text-muted">
          Clique numa categoria para editá-la. Os filtros ficam suspensos.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {categories.map((category, index) => {
          const filterActive = !excludedCategories.has(category.id);
          // Em edição, tudo se mostra "ligado": a opacidade de categoria
          // desligada é informação de filtro, e ali o filtro está suspenso.
          const active = editMode || filterActive;
          const isOpen = expanded.has(category.id);
          const count = counts[category.id] ?? 0;
          const selectedSubs = category.subcategories.filter((s) =>
            activeSubcategories.has(`${category.id}:${s.id}`),
          ).length;

          return (
            <div
              key={category.id}
              className={cn(
                "rounded-lg border transition-colors",
                active
                  ? "border-border-strong"
                  : "border-border bg-transparent opacity-55 hover:opacity-90",
              )}
              style={
                active
                  ? {
                      borderColor: `color-mix(in oklab, ${category.color} 38%, transparent)`,
                      backgroundColor: `color-mix(in oklab, ${category.color} 8%, transparent)`,
                    }
                  : undefined
              }
            >
              <div className="flex items-center">
                {editMode && (
                  <div className="flex flex-col pl-1">
                    <button
                      type="button"
                      aria-label="Mover para cima"
                      title="Mover para cima"
                      disabled={isPending || index === 0}
                      onClick={() => move(category.id, "up")}
                      className="flex size-4 items-center justify-center rounded text-muted transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-muted"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Mover para baixo"
                      title="Mover para baixo"
                      disabled={isPending || index === categories.length - 1}
                      onClick={() => move(category.id, "down")}
                      className="flex size-4 items-center justify-center rounded text-muted transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-muted"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                  </div>
                )}

                {/* Filtra (modo normal) ou abre o formulário (modo de edição) */}
                <button
                  type="button"
                  aria-pressed={editMode ? undefined : filterActive}
                  onClick={() =>
                    editMode
                      ? setDialogFor(category)
                      : toggleCategory(category.id)
                  }
                  className="group flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full transition-transform group-hover:scale-110"
                    style={{
                      backgroundColor: active ? category.color : "transparent",
                      boxShadow: active ? `0 0 8px ${category.color}` : "none",
                      border: active ? "none" : `1.5px solid ${category.color}`,
                    }}
                  />
                  <span className="flex-1 truncate text-sm text-primary">
                    {category.label}
                  </span>
                  {editMode && (
                    <Pencil className="size-3 shrink-0 text-muted transition-colors group-hover:text-accent" />
                  )}
                  {!editMode && selectedSubs > 0 && (
                    <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-medium text-accent">
                      {selectedSubs}
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted">{count}</span>
                </button>

                {/* Expandir subcategorias. Em edição aparece sempre, inclusive
                    para categoria sem nenhuma — é por ali que se cria a
                    primeira. */}
                {(editMode || category.subcategories.length > 0) && (
                  <button
                    type="button"
                    aria-label={isOpen ? "Recolher" : "Expandir"}
                    aria-expanded={isOpen}
                    onClick={() => toggleExpand(category.id)}
                    className="flex size-8 shrink-0 items-center justify-center text-muted transition-colors hover:text-primary"
                  >
                    <ChevronRight
                      className={cn(
                        "size-4 transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                  </button>
                )}
              </div>

              {isOpen && editMode && <SubcategoryEditor category={category} />}

              {/* Subcategory chips */}
              {isOpen && !editMode && category.subcategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5 pt-0.5">
                  {category.subcategories.map((sub) => {
                    const key = `${category.id}:${sub.id}`;
                    const subActive = activeSubcategories.has(key);
                    const subCount = subCounts[key] ?? 0;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        aria-pressed={subActive}
                        onClick={() => toggleSubcategory(key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                          subActive
                            ? "border-transparent text-on-category"
                            : "border-border text-muted hover:text-primary",
                        )}
                        style={
                          subActive
                            ? { backgroundColor: category.color }
                            : undefined
                        }
                      >
                        {sub.label}
                        <span
                          className={cn(
                            "font-mono text-[10px]",
                            subActive ? "opacity-80" : "text-muted/70",
                          )}
                        >
                          {subCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {editMode && (
          <button
            type="button"
            onClick={() => setDialogFor("new")}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-sm text-muted transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Plus className="size-4" />
            Nova categoria
          </button>
        )}
      </div>

      <CategoryDialog
        open={dialogFor !== null}
        onOpenChange={(next) => {
          if (!next) setDialogFor(null);
        }}
        category={dialogFor === "new" ? undefined : (dialogFor ?? undefined)}
        /**
         * Contagem do cliente, não do banco: `Company.category` é
         * `onDelete: Restrict`, e é isto que permite desabilitar "Apagar" com o
         * número na frente em vez de deixar o P2003 chegar.
         */
        companyCount={
          dialogFor && dialogFor !== "new" ? (counts[dialogFor.id] ?? 0) : 0
        }
      />
    </div>
  );
}
