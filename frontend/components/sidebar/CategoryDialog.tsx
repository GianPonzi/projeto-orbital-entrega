"use client";

/**
 * Criar e editar categoria.
 *
 * ── Por que um diálogo, e não um formulário dentro dos filtros ──
 * Os filtros vivem no índice, que tem 340px e rola. Paleta de cores mais grade
 * de ícones ali dentro produziria rolagem dentro de rolagem, e a lista de
 * categorias sairia da tela enquanto se edita uma delas.
 *
 * ── Sem escrita otimista ──
 * Mesma decisão de editar/apagar empresa: espera o servidor e só fecha em caso
 * de sucesso. Aqui pesa ainda mais, porque uma categoria mal gravada afeta todas
 * as empresas dentro dela — antecipar na tela um estado que o banco recusou
 * mostraria o mapa inteiro repintado de errado.
 */

import { useId, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/app/actions/taxonomy";
import { getCategoryIcon, type CategoryMeta } from "@/lib/categories";
import { CATEGORY_SWATCHES, ICON_KEYS } from "@/lib/taxonomy-options";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

interface FormState {
  label: string;
  color: string;
  iconKey: string;
  blurb: string;
}

function toFormState(category: CategoryMeta | undefined): FormState {
  return {
    label: category?.label ?? "",
    color: category?.color ?? CATEGORY_SWATCHES[0],
    // "building" é o genérico — o mesmo que `getCategoryIcon` devolve para
    // chave ausente, então a pré-seleção não mente sobre o que já está gravado.
    iconKey: category?.iconKey ?? "building",
    blurb: category?.blurb ?? "",
  };
}

function CategoryForm({
  category,
  companyCount,
  onDone,
}: {
  /** Ausente = criação. */
  category?: CategoryMeta;
  companyCount: number;
  onDone: () => void;
}) {
  const notify = useAppStore((s) => s.notify);
  const forgetCategory = useAppStore((s) => s.forgetCategory);
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const [initial] = useState(() => toFormState(category));
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const editing = category !== undefined;
  const dirty = (Object.keys(form) as (keyof FormState)[]).some(
    (key) => form[key] !== initial[key],
  );

  function update(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !dirty) return;

    if (!form.label.trim()) {
      setErrors({ label: "Informe o nome." });
      return;
    }
    setErrors({});
    setFormError(null);

    const input = {
      label: form.label.trim(),
      color: form.color,
      iconKey: form.iconKey,
      blurb: form.blurb.trim(),
    };

    startTransition(async () => {
      try {
        const result = editing
          ? await updateCategoryAction(category.id, input)
          : await createCategoryAction(input);

        if (result.ok) {
          onDone();
          return;
        }

        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      } catch (error) {
        // Mesma armadilha de todas as outras chamadas de action: sem catch, a
        // exceção sobe até o error boundary e leva a página inteira, mapa
        // incluído (`10-error-handling.md:375`).
        console.error("[orbital] action de categoria lançou:", error);
        setFormError(
          "Não foi possível salvar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteCategoryAction(category!.id);

        if (result.ok) {
          // ⚠️ Antes de fechar: o slug apagado não volta a existir, e ficaria
          // preso em `excludedCategories` mantendo "Mostrar todas" visível para
          // sempre. Ver o comentário de `forgetCategory` em `lib/store.ts`.
          forgetCategory(category!.id);
          onDone();
          return;
        }

        // Vai para o toast, não para o formulário: se o usuário fechar o
        // diálogo ao ver o erro, a mensagem precisa sobreviver.
        notify(result.error);
      } catch (error) {
        console.error("[orbital] deleteCategoryAction lançou:", error);
        notify(
          "Não foi possível apagar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      <Field label="Nome" htmlFor={fieldId("label")} required error={errors.label}>
        <Input
          id={fieldId("label")}
          value={form.label}
          onChange={(e) => update("label", e.target.value)}
          placeholder="Ex.: Logística"
          autoComplete="off"
        />
      </Field>

      <Field label="Cor" htmlFor={fieldId("color")} error={errors.color}>
        <div
          id={fieldId("color")}
          role="radiogroup"
          aria-label="Cor"
          className="flex flex-wrap gap-2"
        >
          {CATEGORY_SWATCHES.map((swatch) => {
            const active = form.color === swatch;
            return (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={swatch}
                onClick={() => update("color", swatch)}
                className={cn(
                  "size-7 rounded-full transition-transform hover:scale-110",
                  active && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                )}
                style={{ backgroundColor: swatch }}
              />
            );
          })}
        </div>
      </Field>

      <Field label="Ícone" htmlFor={fieldId("icon")} error={errors.iconKey}>
        <div
          id={fieldId("icon")}
          role="radiogroup"
          aria-label="Ícone"
          className="grid grid-cols-9 gap-1.5"
        >
          {ICON_KEYS.map((key) => {
            const Icon = getCategoryIcon(key);
            const active = form.iconKey === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={key}
                onClick={() => update("iconKey", key)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg border transition-colors",
                  active
                    ? "border-transparent"
                    : "border-border text-muted hover:text-primary",
                )}
                style={
                  active
                    ? {
                        borderColor: `color-mix(in oklab, ${form.color} 55%, transparent)`,
                        backgroundColor: `color-mix(in oklab, ${form.color} 18%, transparent)`,
                        color: form.color,
                      }
                    : undefined
                }
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Descrição" htmlFor={fieldId("blurb")} error={errors.blurb}>
        <Textarea
          id={fieldId("blurb")}
          value={form.blurb}
          onChange={(e) => update("blurb", e.target.value)}
          placeholder="Uma linha sobre o que entra aqui (opcional)."
          rows={2}
        />
      </Field>

      {editing && (
        <p className="text-xs text-muted">
          Identificador: <code className="text-muted/80">{category.id}</code> —
          não muda ao renomear, porque os filtros guardam ele.
        </p>
      )}

      <DialogFooter>
        {editing &&
          (confirmingDelete ? (
            <div className="flex items-center gap-2 sm:mr-auto">
              <span className="text-xs text-danger">Apagar mesmo?</span>
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => setConfirmingDelete(false)}
              >
                Não
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={handleDelete}
              >
                {isPending && <Loader2 className="animate-spin" />}
                Sim, apagar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="danger-ghost"
              /**
               * ⚠️ `Company.category` é `onDelete: Restrict`: apagar categoria
               * com empresas **falha** no Postgres. Desabilitar aqui, dizendo
               * quantas, é melhor do que oferecer uma ação que nunca funciona e
               * traduzir o P2003 depois.
               */
              disabled={isPending || companyCount > 0}
              title={
                companyCount > 0
                  ? `${companyCount} ${companyCount === 1 ? "empresa usa" : "empresas usam"} esta categoria`
                  : undefined
              }
              onClick={() => setConfirmingDelete(true)}
              className="disabled:text-muted sm:mr-auto"
            >
              <Trash2 />
              {companyCount > 0 ? `${companyCount} em uso` : "Apagar"}
            </Button>
          ))}

        <Button type="button" variant="ghost" disabled={isPending} onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent" disabled={isPending || !dirty}>
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "Salvando…" : editing ? "Salvar" : "Criar categoria"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  companyCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryMeta;
  companyCount: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? `Editar ${category.label}` : "Nova categoria"}
          </DialogTitle>
          <DialogDescription>
            Cor e ícone valem para os pins do mapa, os logos e os filtros.
          </DialogDescription>
        </DialogHeader>

        {/* `key` remonta o formulário ao trocar de categoria: sem ela, abrir
            outra reaproveitaria o estado (e o retrato inicial) da anterior. */}
        <CategoryForm
          key={category?.id ?? "__new__"}
          category={category}
          companyCount={companyCount}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
