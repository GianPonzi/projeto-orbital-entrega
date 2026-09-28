"use client";

/**
 * A galeria — as empresas em fichas, como o catálogo de um site.
 *
 * É a **mesma lista** do índice do mapa, em outra forma: mesma ordem, mesmos
 * grupos, mesmos filtros, todos vindos da store e de `lib/company-groups.ts`.
 * Trocar a ordem aqui troca lá.
 *
 * ── O que a ficha carrega ──
 * O logo (monograma, por enquanto), o código do país e a coordenada no canto —
 * o lugar do mapa, já que aqui não há mapa —, nome, categoria, o que a empresa
 * faz, e no rodapé o estado de acompanhamento e há quanto tempo foi capturada.
 */

import { useMemo } from "react";
import { Star } from "lucide-react";

import type { Company } from "@/lib/companies";
import { captureAgeLong, groupCompanies } from "@/lib/company-groups";
import { findCountryByName } from "@/lib/countries";
import type { TaxonomyIndex } from "@/lib/categories";
import { useServerCompanies, useTaxonomy } from "@/lib/data-context";
import { todayString } from "@/lib/dates";
import { formatCoordinates } from "@/lib/map";
import { PRIORITIES } from "@/lib/priority";
import { getStatus } from "@/lib/status";
import {
  useAllCompanies,
  useAppStore,
  useFilteredCompanies,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/company/CompanyLogo";
import { FilterPanel } from "@/components/index/FilterPanel";
import { SortTabs } from "@/components/index/SortTabs";

function CompanyCard({
  company,
  tax,
  selected,
  persisted,
  today,
  onOpen,
}: {
  company: Company;
  tax: TaxonomyIndex;
  selected: boolean;
  persisted: boolean;
  today: string;
  onOpen: () => void;
}) {
  const meta = tax.getCategory(company.categorySlug);
  const status = getStatus(company.status);
  const code = findCountryByName(company.country)?.code;
  const [latText, lngText] = formatCoordinates(company.lat, company.lng).split(" · ");
  const priority = PRIORITIES[company.priority];

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-[border-color,transform] hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--ink)_40%,var(--rule))] aria-pressed:border-accent aria-pressed:shadow-[0_0_0_1px_var(--accent)]"
    >
      {/* O pontilhado ecoa a trama do mapa: a ficha "vem" de lá. */}
      <span className="flex items-start justify-between gap-2 border-b border-border bg-sunken bg-[radial-gradient(color-mix(in_oklab,var(--land)_80%,transparent)_1px,transparent_1.3px)] bg-[length:9px_9px] p-3.5">
        <CompanyLogo name={company.name} color={meta.color} size="lg" />
        <span className="text-right font-mono text-[9.5px] leading-relaxed text-muted">
          <b className="block font-medium text-primary">{code ?? company.country}</b>
          {latText}
          <br />
          {lngText}
        </span>
      </span>

      <span className="flex flex-1 flex-col gap-1 px-3.5 pt-3">
        <span className="flex items-center gap-1.5 text-base font-semibold text-primary">
          <span className="truncate">{company.name}</span>
          {company.favorite && (
            <Star aria-label="favorita" className="size-3.5 shrink-0 fill-accent text-accent" />
          )}
        </span>
        <span className="truncate text-xs">
          <span className="cat-text" style={{ "--c": meta.color } as React.CSSProperties}>
            {meta.label}
          </span>
          <span className="text-muted"> · {company.city}</span>
        </span>
        <span className="mt-1 line-clamp-2 text-[13px] text-muted">
          {company.description || "Sem descrição ainda."}
        </span>
      </span>

      <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-border px-3.5 py-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-[7px] rounded-full"
            style={{ backgroundColor: status.color }}
          />
          {status.label}
          {company.priority > 0 && (
            <>
              {" · "}
              <span
                className="cat-text text-[10px] font-semibold uppercase tracking-[0.08em] [font-stretch:112%]"
                style={{ "--c": priority.color } as React.CSSProperties}
              >
                {priority.label}
              </span>
            </>
          )}
        </span>
        <span className="font-mono">
          {persisted ? captureAgeLong(company.addedAt, today) : "salvando…"}
        </span>
      </span>
    </button>
  );
}

export function CompanyGallery({ className }: { className?: string }) {
  const companies = useFilteredCompanies();
  const total = useAllCompanies().length;
  const serverCompanies = useServerCompanies();
  // Uma chamada, no topo — o índice é passado para cada ficha.
  const tax = useTaxonomy();
  const sort = useAppStore((s) => s.sort);
  const selectedId = useAppStore((s) => s.selectedId);
  const select = useAppStore((s) => s.select);
  const openAdd = useAppStore((s) => s.openAdd);
  const resetFilters = useAppStore((s) => s.resetFilters);

  const today = todayString();
  const groups = useMemo(
    () => groupCompanies(companies, sort, today),
    [companies, sort, today],
  );
  const persisted = useMemo(
    () => new Set(serverCompanies.map((c) => c.id)),
    [serverCompanies],
  );

  return (
    <div className={className}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 pb-16 pt-5 md:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <h1 className="text-[26px] font-bold tracking-[-0.01em] text-primary [font-stretch:112%]">
                Galeria
              </h1>
              <SortTabs />
            </div>
            <span className="text-xs text-muted">
              <b className="font-semibold text-primary">{companies.length}</b> de{" "}
              {total} empresas
            </span>
          </div>
          <FilterPanel />
        </div>

        {groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col gap-3">
            <h2 className="flex items-baseline gap-2.5 border-b border-border pb-2">
              <span className="eyebrow">{group.label}</span>
              <span className="font-mono text-[10px] text-muted">
                {group.companies.length}{" "}
                {group.companies.length === 1 ? "empresa" : "empresas"}
              </span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
              {group.companies.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  tax={tax}
                  selected={selectedId === company.id}
                  persisted={persisted.has(company.id)}
                  today={today}
                  onOpen={() => select(company.id)}
                />
              ))}
            </div>
          </section>
        ))}

        {groups.length === 0 && (
          <div className="flex flex-col items-start gap-2 text-sm text-muted">
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
    </div>
  );
}
