"use client";

/**
 * Subcategorias de uma categoria, em modo de edição.
 *
 * ── Por que lista, e não os mesmos chips do modo normal ──
 * A ordenação é por setas ↑↓, e seta não tem significado numa nuvem de chips que
 * quebra linha: "para cima" pode ser o chip à esquerda, o da linha de cima, ou
 * nenhum dos dois. Em lista vertical a direção é literal. Os chips continuam
 * chips no modo de filtro, que é onde eles são clicados o tempo todo.
 *
 * ── Renomear é inline ──
 * Subcategoria tem um campo só. Abrir diálogo para um campo é cerimônia, e este
 * é o gesto que mais se repete ao arrumar a taxonomy.
 */

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Plus, X } from "lucide-react";

import {
  createSubcategoryAction,
  deleteSubcategoryAction,
  moveSubcategoryAction,
  updateSubcategoryAction,
  type TaxonomyResult,
} from "@/app/actions/taxonomy";
import type { CategoryMeta } from "@/lib/categories";
import { useAppStore, useSubcategoryCounts } from "@/lib/store";
import { cn } from "@/lib/utils";

const CONNECTION_FAILED =
  "Não foi possível salvar. Verifique a conexão — se persistir, recarregue a página e entre novamente.";

export function SubcategoryEditor({ category }: { category: CategoryMeta }) {
  const counts = useSubcategoryCounts();
  const notify = useAppStore((s) => s.notify);
  const forgetSubcategory = useAppStore((s) => s.forgetSubcategory);
  const [isPending, startTransition] = useTransition();

  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  /** Slug aguardando confirmação — só existe quando há empresas a perder. */
  const [confirmingSlug, setConfirmingSlug] = useState<string | null>(null);

  /**
   * Todo caminho de erro precisa aparecer, e aqui **não existe formulário onde
   * pendurar a mensagem** — daí o toast. E todo caminho precisa de `catch`: sem
   * ele, uma exceção dentro de `startTransition` sobe até o error boundary e
   * derruba a página inteira, mapa incluído (`10-error-handling.md:375`).
   */
  function run(action: () => Promise<TaxonomyResult>, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) onSuccess?.();
        else notify(result.error);
      } catch (error) {
        console.error("[orbital] action de subcategoria lançou:", error);
        notify(CONNECTION_FAILED);
      }
    });
  }

  function submitRename(slug: string) {
    const label = draft.trim();
    if (!label) return;

    const current = category.subcategories.find((s) => s.id === slug);
    // Nada mudou: fecha sem gastar uma ida ao banco.
    if (current && current.label === label) {
      setRenamingSlug(null);
      return;
    }

    run(() => updateSubcategoryAction(category.id, slug, { label }), () =>
      setRenamingSlug(null),
    );
  }

  function submitCreate() {
    const label = draft.trim();
    if (!label) {
      setAdding(false);
      return;
    }

    run(() => createSubcategoryAction(category.id, { label }), () => {
      // Continua em modo de adição com o campo limpo: quem cria uma
      // subcategoria quase sempre cria três.
      setDraft("");
    });
  }

  function requestDelete(slug: string, affected: number) {
    /**
     * ⚠️ `Subcategory` é `onDelete: Cascade` na m2m: apagar **desassocia de
     * todas as empresas em silêncio**. O Postgres não avisa e não conta.
     *
     * Sem empresa afetada não há perda a anunciar, e confirmar seria atrito
     * puro — é o caso de quem acabou de criar o item errado.
     */
    if (affected > 0) {
      setConfirmingSlug(slug);
      return;
    }
    run(() => deleteSubcategoryAction(category.id, slug), () =>
      forgetSubcategory(`${category.id}:${slug}`),
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2.5 pb-2.5 pt-0.5">
      {category.subcategories.map((sub, index) => {
        const affected = counts[`${category.id}:${sub.id}`] ?? 0;
        const renaming = renamingSlug === sub.id;
        const confirming = confirmingSlug === sub.id;

        if (confirming) {
          return (
            <div
              key={sub.id}
              className="flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 text-xs text-danger">
                Apagar? {affected}{" "}
                {affected === 1 ? "empresa perde" : "empresas perdem"} esta
                marcação.
              </span>
              <IconButton
                label="Cancelar"
                disabled={isPending}
                onClick={() => setConfirmingSlug(null)}
              >
                <X className="size-3.5" />
              </IconButton>
              <IconButton
                label="Confirmar"
                disabled={isPending}
                className="text-danger hover:brightness-110"
                onClick={() =>
                  run(() => deleteSubcategoryAction(category.id, sub.id), () => {
                    // A chave composta some do filtro junto com a linha.
                    forgetSubcategory(`${category.id}:${sub.id}`);
                    setConfirmingSlug(null);
                  })
                }
              >
                <Check className="size-3.5" />
              </IconButton>
            </div>
          );
        }

        return (
          <div
            key={sub.id}
            className="flex items-center gap-0.5 rounded-lg border border-border px-1 py-0.5"
          >
            <IconButton
              label="Mover para cima"
              disabled={isPending || index === 0}
              onClick={() =>
                run(() => moveSubcategoryAction(category.id, sub.id, "up"))
              }
            >
              <ArrowUp className="size-3.5" />
            </IconButton>
            <IconButton
              label="Mover para baixo"
              disabled={isPending || index === category.subcategories.length - 1}
              onClick={() =>
                run(() => moveSubcategoryAction(category.id, sub.id, "down"))
              }
            >
              <ArrowDown className="size-3.5" />
            </IconButton>

            {renaming ? (
              <input
                autoFocus
                value={draft}
                disabled={isPending}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => submitRename(sub.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitRename(sub.id);
                  }
                  // Escape cancela sem gravar. Sem isto, a única saída de um
                  // rename indesejado seria apagar o texto e reescrever o antigo.
                  if (e.key === "Escape") setRenamingSlug(null);
                }}
                className="min-w-0 flex-1 rounded bg-sunken px-1.5 py-0.5 text-xs text-primary outline-none"
              />
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setRenamingSlug(sub.id);
                  setDraft(sub.label);
                }}
                className="min-w-0 flex-1 truncate px-1 py-0.5 text-left text-xs text-primary hover:text-accent"
              >
                {sub.label}
              </button>
            )}

            <span className="px-1 font-mono text-[10px] text-muted/70">
              {affected}
            </span>
            <IconButton
              label={`Apagar ${sub.label}`}
              disabled={isPending}
              className="hover:text-danger"
              onClick={() => requestDelete(sub.id, affected)}
            >
              <X className="size-3.5" />
            </IconButton>
          </div>
        );
      })}

      {adding ? (
        <input
          autoFocus
          value={draft}
          disabled={isPending}
          placeholder="Nome da subcategoria"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setAdding(false);
            setDraft("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitCreate();
            }
            if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          className="rounded-lg border border-border bg-sunken px-2 py-1 text-xs text-primary outline-none placeholder:text-muted"
        />
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setAdding(true);
            setDraft("");
          }}
          className="inline-flex items-center gap-1 self-start rounded-lg px-1.5 py-1 text-xs text-muted transition-colors hover:text-accent"
        >
          <Plus className="size-3.5" />
          Subcategoria
        </button>
      )}
    </div>
  );
}

function IconButton({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
