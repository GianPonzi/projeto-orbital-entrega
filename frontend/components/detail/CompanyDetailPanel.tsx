"use client";

/**
 * Painel de detalhe da empresa selecionada.
 *
 * ── A ordem responde "o que é isto?" antes de "o que eu faço com isto?" ──
 * Identidade (logo, nome, categoria), o que a empresa faz, os fatos — onde
 * fica e **quando foi capturada** — e só então o acompanhamento e as relações.
 * O painel antigo abria pelos controles; quem abre uma empresa quer primeiro
 * lembrar do que se trata.
 *
 * ── Onde ele mora ──
 * No desktop, encaixado na borda direita da área de conteúdo, com a altura
 * toda — sobre o mapa ou sobre a galeria, conforme a vista. O voo até uma empresa desconta a largura dele
 * — ver `DETAIL_PANEL_PX` no `MapCanvas`. No celular, uma folha que sobe de
 * baixo.
 */

import { useMemo, useState, useTransition } from "react";
import { Flame, Loader2, MapPin, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Company } from "@/lib/companies";
import { captureAgeLong, captureDate } from "@/lib/company-groups";
import { getRelationType } from "@/lib/relations";
import { formatCoordinates } from "@/lib/map";
import { STATUSES } from "@/lib/status";
import { PRIORITIES } from "@/lib/priority";
import { todayString } from "@/lib/dates";
import type { CompanyCrmInput } from "@/lib/company-schema";
import { updateCompanyCrmAction } from "@/app/actions/companies";
import { deleteRelationAction } from "@/app/actions/relations";
import { useServerRelations, useTaxonomy } from "@/lib/data-context";
import { useAllCompanies, useAppStore, useIsPersisted } from "@/lib/store";
import { useIsMobile } from "@/lib/use-mobile";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { CompanyLogo } from "@/components/company/CompanyLogo";
import { AddRelationDialog } from "@/components/detail/AddRelationDialog";

function socialHref(social: string): string | undefined {
  if (/^https?:\/\//.test(social)) return social;
  if (social.startsWith("@")) return `https://x.com/${social.slice(1)}`;
  return undefined;
}

/** Compact USD market cap, e.g. 230000000000 → "US$ 230 bi". */
function formatMarketCap(value: number): string {
  const bi = value / 1_000_000_000;
  if (bi >= 1000) {
    return `US$ ${(bi / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} tri`;
  }
  if (bi >= 1) {
    return `US$ ${bi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  }
  const mi = value / 1_000_000;
  return `US$ ${mi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
}

/** Chip de escolha — status, favorita, prioridade. A cor vem em `color`. */
function Pill({
  active,
  color,
  disabled,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  color?: string;
  disabled?: boolean;
  onClick: () => void;
  dot?: boolean;
  children: React.ReactNode;
}) {
  const tint = color ?? "var(--accent)";
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active ? "text-primary" : "border-border text-muted hover:text-primary",
      )}
      style={
        active
          ? {
              borderColor: `color-mix(in oklab, ${tint} 55%, var(--rule))`,
              backgroundColor: `color-mix(in oklab, ${tint} 14%, transparent)`,
            }
          : undefined
      }
    >
      {dot && color && (
        <span
          aria-hidden
          className="size-[7px] rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </button>
  );
}

/**
 * Status, favorito e prioridade.
 *
 * ── Sem otimismo aqui, e é de propósito ──
 * A captura mostra a empresa antes de o servidor confirmar, porque atrito na
 * captura mata o produto. Estes controles não: o valor exibido é sempre o do
 * servidor, e o bloco fica pendente até o dado novo chegar. Em troca, o
 * "desfazer" não precisa existir — não há nada para desfazer se nada foi
 * antecipado, e uma falha só precisa ser **contada**, via toast.
 */
function CrmControls({ company }: { company: Company }) {
  const notify = useAppStore((s) => s.notify);
  const persisted = useIsPersisted(company.id);
  const [isPending, startTransition] = useTransition();

  // Enquanto a captura está em voo o id é temporário: o banco recusaria.
  const disabled = isPending || !persisted;

  function apply(patch: CompanyCrmInput) {
    startTransition(async () => {
      try {
        const result = await updateCompanyCrmAction(company.id, patch);
        if (!result.ok) notify(result.error);
      } catch (error) {
        // A action pode **lançar** em vez de retornar: rede fora no meio do
        // POST, ou o `proxy.ts` devolvendo um redirect antes de ela rodar. Sem
        // este catch a Promise rejeita em silêncio e o clique não produz nada
        // — nem valor novo, nem aviso. É o caso que a regra dura nº 10 proíbe.
        console.error("[orbital] updateCompanyCrmAction lançou:", error);
        notify(
          "Não foi possível salvar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  return (
    <section
      aria-label="Acompanhamento"
      className="flex flex-col gap-2.5 border-t border-border pt-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">Acompanhamento</h3>
        {isPending && (
          <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />
        )}
      </div>

      <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
        {STATUSES.map((status) => (
          <Pill
            key={status.id}
            active={company.status === status.id}
            color={status.color}
            dot
            disabled={disabled}
            onClick={() => apply({ status: status.id })}
          >
            {status.label}
          </Pill>
        ))}
      </div>

      <div
        role="group"
        aria-label="Favorita e prioridade"
        className="flex flex-wrap gap-1.5"
      >
        <Pill
          active={company.favorite}
          disabled={disabled}
          onClick={() => apply({ favorite: !company.favorite })}
        >
          ★ Favorita
        </Pill>
        {PRIORITIES.map((p) => (
          <Pill
            key={p.id}
            active={company.priority === p.id}
            color={p.color}
            disabled={disabled}
            onClick={() => apply({ priority: p.id })}
          >
            {p.label}
          </Pill>
        ))}
      </div>

      {!persisted && <p className="text-[11px] text-muted">Salvando a empresa…</p>}
    </section>
  );
}

function NewsButton({ company }: { company: Company }) {
  const [open, setOpen] = useState(false);
  if (!company.trackNews) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 self-start rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-primary transition-colors hover:bg-accent/15"
      >
        <Flame className="size-4 text-accent" />
        Notícias quentes
      </button>
      {open && (
        <p className="rounded-lg border border-border bg-sunken px-3 py-2 text-xs text-muted">
          Em breve: monitoramento e resumo das principais notícias sobre{" "}
          {company.name}.
        </p>
      )}
    </div>
  );
}

function RelationsSection({ company }: { company: Company }) {
  const focusCompany = useAppStore((s) => s.focusCompany);
  const allRelations = useServerRelations();
  const allCompanies = useAllCompanies();
  const persisted = useIsPersisted(company.id);

  const relations = useMemo(
    () =>
      allRelations.filter(
        (r) => r.source === company.id || r.target === company.id,
      ),
    [allRelations, company.id],
  );

  // O `.map()` abaixo precisa resolver a outra ponta de cada aresta, e hook não
  // pode ser chamado dentro de laço — daí o índice montado aqui, no topo.
  const byId = useMemo(
    () => new Map(allCompanies.map((c) => [c.id, c])),
    [allCompanies],
  );

  return (
    <section
      aria-label="Relações"
      className="flex flex-col gap-2.5 border-t border-border pt-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">Relações · {relations.length}</h3>
        {/* ⚠️ Enquanto a empresa é otimista o id é `pending-<uuid>`, e o
            Postgres nunca ouviu falar dele — a FK recusaria a aresta. Mesma
            trava de editar e apagar. */}
        <AddRelationDialog company={company} disabled={!persisted} />
      </div>

      {/* A seção aparece mesmo vazia: sem ela não haveria por onde criar a
          primeira relação, e o botão "Nova" só existe aqui. Os arcos no mapa
          aparecem sozinhos quando a empresa está selecionada. */}
      {relations.length === 0 && (
        <p className="text-xs text-muted">Nenhuma relação ainda.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {relations.map((r) => {
          const otherId = r.source === company.id ? r.target : r.source;
          const other = byId.get(otherId);
          const typeMeta = getRelationType(r.type);
          const arrow = !typeMeta.directed
            ? "↔"
            : r.source === company.id
              ? "→"
              : "←";
          return (
            <div
              key={r.id}
              className="group flex items-start gap-2 rounded-md border border-border px-2.5 py-2 transition-colors hover:bg-sunken"
            >
              {/* O clique navega; apagar é um alvo próprio ao lado. Um botão
                  dentro de outro botão não é HTML válido. */}
              <button
                type="button"
                onClick={() => other && focusCompany(other)}
                className="grid min-w-0 flex-1 grid-cols-[18px_1fr] gap-2 text-left"
              >
                <span
                  aria-hidden
                  className="font-mono text-sm"
                  style={{ color: typeMeta.color }}
                >
                  {arrow}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-1.5">
                    <strong className="font-semibold text-primary">
                      {other?.name ?? otherId}
                    </strong>
                    <span
                      className="cat-text text-[10px] font-semibold uppercase tracking-[0.08em] [font-stretch:112%]"
                      style={{ "--c": typeMeta.color } as React.CSSProperties}
                    >
                      {typeMeta.label}
                    </span>
                  </span>
                  {(r.label || r.since) && (
                    <span className="block truncate text-xs text-muted">
                      {r.label}
                      {r.label && r.since ? " · " : ""}
                      {r.since ?? ""}
                    </span>
                  )}
                </span>
              </button>

              <RelationDeleteButton relationId={r.id} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Apagar uma aresta.
 *
 * ── Confirma sempre, ao contrário da subcategoria ──
 * Lá o critério era "há dado a perder?", e sem empresa afetada não havia. Aqui
 * a própria relação **é** o dado, e ela some inteira: não existe caso barato.
 * A confirmação é inline (o botão vira "Apagar?") em vez de diálogo — um
 * diálogo por cima do painel de detalhe empilharia duas camadas flutuantes.
 */
function RelationDeleteButton({ relationId }: { relationId: string }) {
  const notify = useAppStore((s) => s.notify);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteRelationAction(relationId);
        if (!result.ok) notify(result.error);
      } catch (error) {
        console.error("[orbital] deleteRelationAction lançou:", error);
        notify(
          "Não foi possível apagar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="rounded px-1.5 py-0.5 text-[11px] text-danger transition-colors hover:bg-danger/15"
        >
          {isPending ? "…" : "Apagar?"}
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="text-muted transition-colors hover:text-primary"
        >
          <X className="size-3.5" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label="Apagar relação"
      title="Apagar relação"
      onClick={() => setConfirming(true)}
      className="mt-0.5 shrink-0 text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
    >
      <X className="size-3.5" />
    </button>
  );
}

/** Um par rótulo/valor da lista de fatos. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="pt-px text-xs text-muted">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

/** A linha menor embaixo de um valor: coordenada, data exata. */
function FactNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 block font-mono text-[11px] text-muted">{children}</span>
  );
}

const LINK = "text-accent underline-offset-2 transition-colors hover:underline";

function DetailBody({
  company,
  title,
}: {
  company: Company;
  /** O nome — `<h2>` no desktop, `SheetTitle` no celular (o Radix exige). */
  title: React.ReactNode;
}) {
  const tax = useTaxonomy();
  const select = useAppStore((s) => s.select);
  const isMobile = useIsMobile();
  const persisted = useIsPersisted(company.id);
  const meta = tax.getCategory(company.categorySlug);
  const subcategories = tax.getSubcategories(
    company.categorySlug,
    company.subcategorySlugs,
  );
  const social = company.social ? socialHref(company.social) : undefined;
  const today = todayString();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start gap-3.5">
        <CompanyLogo name={company.name} color={meta.color} size="xl" />
        <div className="min-w-0 flex-1">
          {title}
          <p className="mt-1 text-xs">
            <span
              className="cat-text"
              style={{ "--c": meta.color } as React.CSSProperties}
            >
              {meta.label}
            </span>
            {subcategories.length > 0 && (
              <span className="text-muted">
                {" · "}
                {subcategories.map((s) => s.label).join(", ")}
              </span>
            )}
          </p>
        </div>
        {/* No celular o X é o do próprio Sheet. */}
        {!isMobile && (
          <button
            type="button"
            onClick={() => select(null)}
            aria-label="Fechar"
            className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-primary"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <p className="max-w-[60ch] text-sm leading-relaxed text-primary">
        {company.description || (
          <span className="text-muted">Sem descrição ainda.</span>
        )}
      </p>

      <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-2.5 text-[13px] text-primary">
        <Fact label="Onde">
          {company.city}, {company.country}
          <FactNote>{formatCoordinates(company.lat, company.lng)}</FactNote>
        </Fact>
        <Fact label="Capturada">
          {persisted
            ? captureAgeLong(company.addedAt, today)
            : "agora · salvando…"}
          <FactNote>{captureDate(company.addedAt)}</FactNote>
        </Fact>
        {company.featuredProduct && (
          <Fact label="Produto destaque">{company.featuredProduct}</Fact>
        )}
        {company.ceo && <Fact label="CEO">{company.ceo}</Fact>}
        {company.foundedYear && (
          <Fact label="Fundada em">
            <span className="font-mono text-xs">{company.foundedYear}</span>
          </Fact>
        )}
        {typeof company.marketCap === "number" && (
          <Fact label="Valor de mercado">
            <span className="font-mono text-xs">
              {formatMarketCap(company.marketCap)}
            </span>
          </Fact>
        )}
        {company.website && (
          <Fact label="Site">
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              {company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          </Fact>
        )}
        {company.social && (
          <Fact label="Social">
            {social ? (
              <a
                href={social}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                {company.social}
              </a>
            ) : (
              company.social
            )}
          </Fact>
        )}
      </dl>

      <NewsButton company={company} />

      <CrmControls company={company} />

      <RelationsSection company={company} />
    </div>
  );
}

/** Editar e Ver no mapa. Editar fica desabilitado enquanto a captura está em voo. */
function DetailFooter({ company }: { company: Company }) {
  const openEdit = useAppStore((s) => s.openEdit);
  const focusCompany = useAppStore((s) => s.focusCompany);
  const setView = useAppStore((s) => s.setView);
  const persisted = useIsPersisted(company.id);

  return (
    <footer className="flex gap-2 border-t border-border px-5 py-3">
      <Button
        variant="outline"
        size="sm"
        disabled={!persisted}
        onClick={() => openEdit(company.id)}
        title={persisted ? undefined : "Aguarde a empresa terminar de ser salva"}
      >
        <Pencil />
        Editar
      </Button>
      {/* Da galeria, "ver no mapa" é trocar de vista e voar — o mapa ficou
          montado por trás, então o voo parte do enquadramento de antes. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setView("mapa");
          focusCompany(company);
        }}
      >
        <MapPin />
        Ver no mapa
      </Button>
    </footer>
  );
}

export function CompanyDetailPanel() {
  const selectedId = useAppStore((s) => s.selectedId);
  const select = useAppStore((s) => s.select);
  const companies = useAllCompanies();
  const isMobile = useIsMobile();

  const company = selectedId
    ? companies.find((c) => c.id === selectedId)
    : undefined;

  // Keep last company mounted through the exit animation. Adjusted during
  // render (not in an effect) so React re-renders before painting.
  const [shown, setShown] = useState<Company | undefined>(company);
  if (company && company !== shown) {
    setShown(company);
  }

  if (isMobile) {
    return (
      <Sheet
        open={Boolean(company)}
        onOpenChange={(next) => {
          if (!next) select(null);
        }}
      >
        {shown && (
          <SheetContent side="bottom" className="max-h-[85vh]">
            <SheetDescription className="sr-only">
              Detalhes da empresa {shown.name}
            </SheetDescription>
            <ScrollArea className="min-h-0 px-5 pb-6 pt-5">
              <DetailBody
                company={shown}
                title={
                  <SheetTitle className="pr-8 text-[22px] font-bold leading-tight [font-stretch:108%] [text-wrap:balance]">
                    {shown.name}
                  </SheetTitle>
                }
              />
            </ScrollArea>
            <DetailFooter company={shown} />
          </SheetContent>
        )}
      </Sheet>
    );
  }

  if (!company) return null;
  return (
    <aside
      key={company.id}
      aria-label={`Detalhes de ${company.name}`}
      className="absolute inset-y-0 right-0 z-20 flex w-[380px] flex-col border-l border-border bg-surface shadow-[var(--shadow)] duration-200 animate-in fade-in-0 slide-in-from-right-4"
    >
      <ScrollArea className="min-h-0 flex-1 px-5 pb-7 pt-5">
        <DetailBody
          company={company}
          title={
            <h2 className="text-[22px] font-bold leading-tight text-primary [font-stretch:108%] [text-wrap:balance]">
              {company.name}
            </h2>
          }
        />
      </ScrollArea>
      <DetailFooter company={company} />
    </aside>
  );
}
