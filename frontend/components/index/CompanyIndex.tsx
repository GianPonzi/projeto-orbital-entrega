"use client";

/**
 * O índice — a lista de empresas à esquerda do mapa.
 *
 * Substitui a sidebar de filtros e o dock horizontal de uma vez. A sidebar
 * gastava 340px fixos com filtros que se usam de vez em quando; o dock mostrava
 * três cards por vez e não servia para encontrar nada. Aqui a lista é o
 * conteúdo, e os filtros ficam recolhidos em cima dela.
 *
 * ── A ordem padrão é o tempo ──
 * "Recentes" agrupa por quando a empresa foi capturada — o "quando eu vi isso"
 * que originou o projeto, e que até aqui não aparecia em tela nenhuma.
 *
 * ── Onde a localização mora ──
 * O mapa é mudo de propósito (sem ruas, sem rótulos de lugar). Cidade e país
 * aparecem aqui, em cada linha.
 */

import { useEffect, useMemo, useRef } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { captureAgeShort, groupCompanies } from "@/lib/company-groups";
import { findCountryByName } from "@/lib/countries";
import { useServerCompanies, useTaxonomy } from "@/lib/data-context";
import { todayString } from "@/lib/dates";
import {
  useAllCompanies,
  useAppStore,
  useFilteredCompanies,
} from "@/lib/store";
import { useIsMobile } from "@/lib/use-mobile";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/company/CompanyLogo";
import { SortTabs } from "@/components/index/SortTabs";
import { FilterPanel } from "@/components/index/FilterPanel";

export function CompanyIndex({ className }: { className?: string }) {
  const companies = useFilteredCompanies();
  const total = useAllCompanies().length;
  const serverCompanies = useServerCompanies();
  // Uma chamada, no topo — o índice é usado dentro do `.map()` abaixo.
  const tax = useTaxonomy();
  const sort = useAppStore((s) => s.sort);
  const selectedId = useAppStore((s) => s.selectedId);
  const focusCompany = useAppStore((s) => s.focusCompany);
  const setHovered = useAppStore((s) => s.setHovered);
  const openAdd = useAppStore((s) => s.openAdd);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const isMobile = useIsMobile();
  const listRef = useRef<HTMLDivElement>(null);

  const today = todayString();
  const groups = useMemo(
    () => groupCompanies(companies, sort, today),
    [companies, sort, today],
  );

  // Empresa otimista (captura em voo) ainda não está na lista do servidor.
  const persisted = useMemo(
    () => new Set(serverCompanies.map((c) => c.id)),
    [serverCompanies],
  );

  // Clique no pin → a linha correspondente entra na área visível da lista.
  // No celular não: lá a lista não rola sozinha, é a página, e puxar a página
  // para baixo tiraria o mapa da tela no instante em que se tocou nele.
  useEffect(() => {
    if (!selectedId || isMobile) return;
    listRef.current
      ?.querySelector(`[data-company-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId, isMobile]);

  return (
    <aside
      aria-label="Índice de empresas"
      className={cn(
        "flex flex-col border-border bg-surface md:min-h-0 md:border-r",
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 border-b border-border px-3.5 pb-2.5 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <SortTabs />
          <span className="text-xs text-muted">
            <b className="font-semibold text-primary">{companies.length}</b> de{" "}
            {total}
          </span>
        </div>

        <FilterPanel />
      </div>

      <div
        ref={listRef}
        onMouseLeave={() => setHovered(null)}
        className="scrollarea px-2 pb-4 pt-1 md:min-h-0 md:flex-1 md:overflow-y-auto"
      >
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <div className="sticky top-0 z-[1] flex items-baseline justify-between bg-surface px-1.5 pb-1.5 pt-3">
              <h2 className="eyebrow">{group.label}</h2>
              <span className="font-mono text-[10px] text-muted">
                {group.companies.length}
              </span>
            </div>

            {group.companies.map((company) => {
              const meta = tax.getCategory(company.categorySlug);
              const code = findCountryByName(company.country)?.code;
              return (
                <button
                  key={company.id}
                  type="button"
                  data-company-id={company.id}
                  aria-pressed={selectedId === company.id}
                  onClick={() => focusCompany(company)}
                  onMouseEnter={() => setHovered(company.id)}
                  onFocus={() => setHovered(company.id)}
                  onBlur={() => setHovered(null)}
                  className="grid w-full grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-md px-1.5 py-[7px] text-left transition-colors hover:bg-sunken aria-pressed:bg-[color-mix(in_oklab,var(--accent)_13%,var(--surface))]"
                >
                  <CompanyLogo name={company.name} color={meta.color} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold text-primary">
                      <span className="truncate">{company.name}</span>
                      {company.favorite && (
                        <Star
                          aria-label="favorita"
                          className="size-3 shrink-0 fill-accent text-accent"
                        />
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      <span
                        className="cat-text"
                        style={{ "--c": meta.color } as React.CSSProperties}
                      >
                        {meta.label}
                      </span>{" "}
                      · {company.city},{" "}
                      {/* O código ISO quando o país está na lista; o nome
                          gravado quando não está (empresas de antes dela). */}
                      {code ? <span className="font-mono">{code}</span> : company.country}
                    </span>
                  </span>
                  <span className="self-start pt-[3px] font-mono text-[10px] text-muted">
                    {persisted.has(company.id)
                      ? captureAgeShort(company.addedAt, today)
                      : "salvando…"}
                  </span>
                </button>
              );
            })}
          </section>
        ))}

        {/* Dois vazios diferentes, com saídas diferentes: sem empresa nenhuma
            o gesto é capturar; com filtro demais, é limpar o filtro. */}
        {groups.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-1.5 pt-4 text-sm text-muted">
            {total === 0 ? (
              <>
                <p>Nenhuma empresa no radar ainda.</p>
                <Button variant="accent" size="sm" onClick={() => openAdd()}>
                  Capturar a primeira
                </Button>
              </>
            ) : (
              <>
                <p>Nenhuma empresa com esses filtros.</p>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Limpar filtros
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
