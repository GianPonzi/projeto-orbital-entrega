"use client";

/**
 * Criar relação a partir do painel de uma empresa.
 *
 * ── Por que a outra ponta é uma busca com lista, e não o `Combobox` ──
 * Nasceu antes de `components/ui/combobox.tsx` existir, e continua assim por
 * um motivo que sobreviveu: aqui a lista fica **sempre visível** no diálogo,
 * sem um popover para abrir. Usa `normalize` de `lib/text.ts`, então "Sao
 * Paulo" acha "São Paulo" como no resto do app.
 *
 * ── Empresa otimista não pode ser ponta ──
 * A lista vem de `useServerCompanies`, não de `useAllCompanies`: uma empresa
 * ainda em voo tem id `pending-<uuid>`, que o Postgres nunca ouviu falar, e a
 * FK recusaria a aresta. É a mesma pergunta que `useIsPersisted` faz para
 * travar editar e apagar.
 */

import { useMemo, useState, useTransition } from "react";
import { ArrowLeftRight, Loader2, Plus, Search } from "lucide-react";

import { createRelationAction } from "@/app/actions/relations";
import type { Company } from "@/lib/companies";
import { useServerCompanies } from "@/lib/data-context";
import { RELATION_TYPES, type RelationType } from "@/lib/relations";
import { normalize } from "@/lib/text";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Teto de linhas na lista. Acima disso, a contagem do resto aparece no rodapé. */
const MAX_RESULTS = 40;

export function AddRelationDialog({
  company,
  disabled,
}: {
  company: Company;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:brightness-110 disabled:text-muted"
        title={
          disabled ? "Aguarde a empresa terminar de ser salva" : undefined
        }
      >
        <Plus className="size-3.5" />
        Nova
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Relação de {company.name}</DialogTitle>
            <DialogDescription>
              Escolha a outra empresa e o tipo de ligação.
            </DialogDescription>
          </DialogHeader>

          {/* O `open &&` desmonta o formulário ao fechar, então cada abertura
              começa limpa — sem ele, reabrir traria a empresa e o tipo da vez
              anterior. O `key` cobre o outro caso: trocar de empresa com o
              diálogo montado. */}
          {open && (
            <RelationForm
              key={company.id}
              company={company}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RelationForm({
  company,
  onDone,
}: {
  company: Company;
  onDone: () => void;
}) {
  const companies = useServerCompanies();

  const [query, setQuery] = useState("");
  const [other, setOther] = useState<Company | null>(null);
  const [type, setType] = useState<RelationType>("parceria");
  /** `true` = a empresa do painel é a origem. Só importa em tipo direcionado. */
  const [companyIsSource, setCompanyIsSource] = useState(true);
  const [label, setLabel] = useState("");
  const [since, setSince] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const typeMeta = RELATION_TYPES.find((t) => t.id === type)!;

  const { matches, hidden } = useMemo(() => {
    const q = normalize(query);
    const found = companies
      // A própria empresa nunca é candidata: o schema recusaria, e oferecer uma
      // opção que sempre dá erro é pior do que não oferecer.
      .filter((c) => c.id !== company.id)
      .filter(
        (c) => !q || normalize(`${c.name} ${c.city} ${c.country}`).includes(q),
      );

    // ⚠️ O teto existe para a lista não virar uma parede, mas corte silencioso
    // mente: sem o contador abaixo, "não achei" e "está fora dos 40 primeiros"
    // teriam exatamente a mesma aparência.
    return { matches: found.slice(0, MAX_RESULTS), hidden: Math.max(0, found.length - MAX_RESULTS) };
  }, [companies, company.id, query]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;

    if (!other) {
      setFormError("Escolha a outra empresa.");
      return;
    }
    setFormError(null);

    const trimmedSince = since.trim();
    const input = {
      // Em tipo simétrico a ordem é irrelevante aqui — o servidor normaliza.
      sourceId: companyIsSource ? company.id : other.id,
      targetId: companyIsSource ? other.id : company.id,
      type,
      label: label.trim(),
      since: trimmedSince ? Number(trimmedSince) : undefined,
    };

    startTransition(async () => {
      try {
        const result = await createRelationAction(input);
        if (result.ok) {
          onDone();
          return;
        }
        setFormError(result.error);
      } catch (error) {
        // Sem catch, a exceção sobe até o error boundary e leva a página
        // inteira, mapa incluído (`10-error-handling.md:375`).
        console.error("[orbital] createRelationAction lançou:", error);
        setFormError(
          "Não foi possível salvar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      {/* ── Tipo ── */}
      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-2">
        {RELATION_TYPES.map((t) => {
          const active = type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setType(t.id)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                active ? "text-primary" : "border-border text-muted hover:text-primary",
              )}
              style={
                active
                  ? {
                      borderColor: `color-mix(in oklab, ${t.color} 50%, transparent)`,
                      backgroundColor: `color-mix(in oklab, ${t.color} 14%, transparent)`,
                    }
                  : undefined
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Direção ──
          Só existe em tipo direcionado. Em `parceria` a ordem não carrega
          informação nenhuma, e mostrar o controle sugeriria que carrega. */}
      {typeMeta.directed && (
        <button
          type="button"
          onClick={() => setCompanyIsSource((prev) => !prev)}
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs text-muted transition-colors hover:text-primary"
        >
          <span className="truncate text-primary">
            {companyIsSource ? company.name : (other?.name ?? "a outra")}
          </span>
          <span style={{ color: typeMeta.color }}>→</span>
          <span className="truncate text-primary">
            {companyIsSource ? (other?.name ?? "a outra") : company.name}
          </span>
          <ArrowLeftRight className="size-3.5 shrink-0" />
        </button>
      )}

      {/* ── A outra ponta ── */}
      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <Input
            value={other ? other.name : query}
            onChange={(e) => {
              setOther(null);
              setQuery(e.target.value);
            }}
            placeholder="Buscar empresa…"
            autoComplete="off"
            className="pl-8"
          />
        </div>

        {!other && (
          <ScrollArea className="max-h-40 rounded-lg border border-border">
            {matches.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted">
                Nenhuma empresa encontrada.
              </p>
            ) : (
              matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOther(c)}
                  className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-sunken"
                >
                  <span className="truncate text-sm text-primary">{c.name}</span>
                  <span className="truncate text-[11px] text-muted">
                    {c.city}
                  </span>
                </button>
              ))
            )}
            {hidden > 0 && (
              <p className="px-2.5 py-1.5 text-[11px] text-muted">
                + {hidden} — refine a busca.
              </p>
            )}
          </ScrollArea>
        )}
      </div>

      {/* ── Enriquecimento ──
          `label` e `since` já eram EXIBIDOS no painel sem que nada soubesse
          gravá-los — a regra dura nº 11 pela terceira vez. */}
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Descrição (opcional)"
          autoComplete="off"
        />
        <Input
          value={since}
          onChange={(e) => setSince(e.target.value)}
          placeholder="Desde"
          inputMode="numeric"
          autoComplete="off"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" disabled={isPending} onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="accent" disabled={isPending || !other}>
          {isPending && <Loader2 className="animate-spin" />}
          {isPending ? "Salvando…" : "Criar relação"}
        </Button>
      </DialogFooter>
    </form>
  );
}
