"use client";

/**
 * ⌘K — buscar ou capturar, na mesma caixa.
 *
 * O fluxo real do produto é "vi uma empresa no X": a pessoa digita o nome.
 * Se a empresa já está no radar, Enter voa até ela; se não está, a última
 * linha é *Capturar "…"* e Enter abre a captura com o nome preenchido. A mesma
 * tecla, o mesmo gesto, para as duas respostas possíveis de "isso já está aqui?".
 *
 * ── Atalhos ──
 * `⌘K` / `Ctrl+K` abre e fecha de qualquer lugar; `/` abre quando o foco não
 * está num campo. Nenhum dos dois age com outro diálogo aberto — um formulário
 * pela metade não pode perder o foco para a paleta.
 *
 * ── Por que o filtro do `cmdk` está desligado ──
 * A ordem é nossa (`lib/company-search.ts`): nome que começa com o texto antes
 * de nome que o contém, e os dois antes de cidade e categoria. O `cmdk` só
 * cuida do que faz bem — setas, Enter e a acessibilidade da lista.
 */

import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Plus, Search } from "lucide-react";

import { captureAgeShort, sortCompanies } from "@/lib/company-groups";
import { hasCompanyNamed, searchCompanies } from "@/lib/company-search";
import { findCountryByName } from "@/lib/countries";
import { useTaxonomy } from "@/lib/data-context";
import { todayString } from "@/lib/dates";
import { useAllCompanies, useAppStore } from "@/lib/store";
import { CompanyLogo } from "@/components/company/CompanyLogo";

/** Sem busca, a paleta mostra as últimas capturas — o "o que eu vi hoje?". */
const RECENT_COUNT = 5;

const CAPTURE_VALUE = "__capturar__";

/** Algum Radix Dialog/Sheet aberto? A paleta não se sobrepõe a formulário. */
function anotherDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const focusCompany = useAppStore((s) => s.focusCompany);
  const openAdd = useAppStore((s) => s.openAdd);
  const companies = useAllCompanies();
  const tax = useTaxonomy();
  const [query, setQuery] = useState("");

  // Atalhos globais. Lê o estado atual pela store, e não por closure, para o
  // listener não precisar ser recriado a cada abertura.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isOpen = useAppStore.getState().commandOpen;
      const toggle = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !isTypingTarget(event.target);

      if (!toggle && !slash) return;
      if (!isOpen && anotherDialogOpen()) return;
      if (slash && isOpen) return;

      event.preventDefault();
      // Fechar pelo atalho não passa pelo `onOpenChange` do Radix — então a
      // limpeza do texto tem que acontecer aqui também.
      if (isOpen) setQuery("");
      useAppStore.getState().setCommandOpen(!isOpen);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const today = todayString();
  const trimmed = query.trim();

  const results = useMemo(
    () =>
      trimmed
        ? searchCompanies(companies, trimmed, (slug) => tax.getCategory(slug).label)
        : sortCompanies(companies, "recentes").slice(0, RECENT_COUNT),
    [companies, trimmed, tax],
  );
  const offerCapture = !hasCompanyNamed(companies, trimmed);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Cada abertura começa limpa: o texto de uma busca anterior não é o que a
    // pessoa quer ver quando aperta ⌘K de novo.
    if (!next) setQuery("");
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--sunken)_55%,transparent)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(600px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)] duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">
            Buscar ou capturar empresa
          </DialogPrimitive.Title>

          <Command
            shouldFilter={false}
            loop
            label="Buscar ou capturar empresa"
            className="command-palette"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-3.5">
              <Search aria-hidden className="size-[18px] shrink-0 text-muted" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Nome, cidade ou país…"
                className="h-[52px] min-w-0 flex-1 bg-transparent text-base text-primary outline-none placeholder:text-muted/70"
              />
            </div>

            <Command.List className="scrollarea max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
              {results.length > 0 && (
                <Command.Group
                  heading={trimmed ? "No radar" : "Capturadas por último"}
                >
                  {results.map((company) => {
                    const meta = tax.getCategory(company.categorySlug);
                    const code = findCountryByName(company.country)?.code;
                    return (
                      <Command.Item
                        key={company.id}
                        value={company.id}
                        onSelect={() => {
                          handleOpenChange(false);
                          focusCompany(company);
                        }}
                        className="grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-lg px-2.5 py-[7px] data-[selected=true]:bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))]"
                      >
                        <CompanyLogo name={company.name} color={meta.color} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-primary">
                            {company.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {meta.label} · {company.city}, {code ?? company.country}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {captureAgeShort(company.addedAt, today)}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {offerCapture && (
                <Command.Item
                  value={CAPTURE_VALUE}
                  onSelect={() => {
                    handleOpenChange(false);
                    openAdd(trimmed ? { name: trimmed } : undefined);
                  }}
                  className="grid cursor-pointer grid-cols-[32px_1fr_auto] items-center gap-2.5 rounded-lg px-2.5 py-[7px] data-[selected=true]:bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))]"
                >
                  <span
                    aria-hidden
                    className="grid size-8 place-items-center rounded-md bg-accent text-accent-contrast"
                  >
                    <Plus className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-primary">
                      {trimmed ? (
                        <>
                          Capturar{" "}
                          <strong className="font-semibold text-accent">
                            &ldquo;{trimmed}&rdquo;
                          </strong>
                        </>
                      ) : (
                        "Capturar nova empresa"
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {trimmed
                        ? "abre o formulário com o nome preenchido"
                        : "abre o formulário de captura"}
                    </span>
                  </span>
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    ↵
                  </kbd>
                </Command.Item>
              )}
            </Command.List>
          </Command>

          <div className="flex gap-3.5 border-t border-border px-3.5 py-2 text-[11px] text-muted">
            <span>↑ ↓ navegar</span>
            <span>↵ abrir</span>
            <span>esc fechar</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
