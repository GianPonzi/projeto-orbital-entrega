"use client";

/**
 * Os campos do formulário de empresa, sem nenhuma lógica de envio.
 *
 * Existe porque captura e edição precisam dos **mesmos campos** e de lógicas de
 * envio **bem diferentes**: a captura é otimista e fecha o sheet na hora; a
 * edição espera o servidor, só fecha em caso de sucesso e só geocodifica se
 * cidade ou país mudarem. Misturar as duas num `handleSubmit`
 * só produziria uma sequência de `if (editando)`.
 *
 * Aqui fica o que as duas compartilham de verdade — a tela.
 */

import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/categories";
import { COUNTRIES, findCountryByName } from "@/lib/countries";
import { useTaxonomy } from "@/lib/data-context";
import { normalizeUrl } from "@/lib/company-schema";
import {
  CityCombobox,
  type ResolvedPlace,
} from "@/components/add/CityCombobox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

/**
 * Fora do componente porque a lista é constante — ~250 países que não dependem
 * de nada do render. Montá-la dentro custaria um `map` sobre o arquivo inteiro
 * a cada abertura de sheet, para produzir sempre o mesmo array.
 */
const COUNTRY_OPTIONS: ComboboxOption[] = COUNTRIES.map((country) => ({
  value: country.name,
  label: country.name,
  // A sigla e o nome em inglês entram na busca: "us", "usa" e "united" acham
  // "Estados Unidos", que é como o campo grava.
  keywords: [country.code, country.en],
}));

export interface CompanyFormState {
  name: string;
  city: string;
  country: string;
  description: string;
  website: string;
  featuredProduct: string;

  /** Sempre visível: o card o exibe em destaque e ele é barato de preencher. */
  ceo: string;

  /**
   * Enriquecimento, atrás do "Mais detalhes". Números vivem como texto no
   * formulário e são convertidos no envio — um `<input>` vazio é `""`, não
   * `undefined`, e converter cedo transformaria "campo em branco" em `NaN`.
   */
  social: string;
  foundedYear: string;
  marketCap: string;
}

/**
 * Cidade escolhida no autocomplete, **com as coordenadas que vieram junto**.
 *
 * Carrega `city`/`country` porque o par só vale enquanto os campos continuarem
 * exatamente como a sugestão os deixou: é comparando com o que está na tela na
 * hora do envio que quem grava decide entre reusar estas coordenadas e pedir o
 * geocoding de novo.
 */
export interface ResolvedFormPlace {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

export const EMPTY_FORM: CompanyFormState = {
  name: "",
  city: "",
  country: "",
  description: "",
  website: "",
  featuredProduct: "",
  social: "",
  foundedYear: "",
  marketCap: "",
  ceo: "",
};

/**
 * `""` → `undefined`; qualquer outra coisa → número (`NaN` incluso, e o schema
 * o recusa com erro de campo).
 *
 * Morava em `EditCompanySheet` enquanto só a edição mandava estes campos. Veio
 * para cá quando a captura passou a mandá-los também: duas cópias divergiriam
 * exatamente na borda que importa — o campo em branco.
 */
export function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

export function isValidUrl(value: string): boolean {
  try {
    new URL(normalizeUrl(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * O schema chama os campos de `categorySlug`/`subcategorySlugs`; o formulário,
 * de `category`/`subcategories`.
 *
 * Erros de `lat`/`lng` não têm campo na tela — eles só existem se alguém
 * burlar o formulário. Ficam de fora daqui e aparecem na mensagem geral.
 */
export function toFormErrors(
  fieldErrors: Record<string, string> = {},
): Record<string, string> {
  const { categorySlug, subcategorySlugs, ...rest } = fieldErrors;
  return {
    ...rest,
    ...(categorySlug ? { category: categorySlug } : {}),
    ...(subcategorySlugs ? { subcategories: subcategorySlugs } : {}),
  };
}

export function CompanyFormFields({
  form,
  onChange,
  category,
  onCategoryChange,
  subcategories,
  onSubcategoriesChange,
  trackNews,
  onTrackNewsChange,
  onPlaceResolved,
  errors,
  formError,
}: {
  form: CompanyFormState;
  onChange: (key: keyof CompanyFormState, value: string) => void;
  category: string | null;
  onCategoryChange: (slug: string) => void;
  /** Slugs simples, sem a chave composta — já estão escopados à categoria. */
  subcategories: string[];
  onSubcategoriesChange: (slugs: string[]) => void;
  trackNews: boolean;
  onTrackNewsChange: (value: boolean) => void;
  /**
   * Avisa que a cidade veio da lista, **com coordenadas**. Quem envia usa isso
   * para pular o geocoding — e é por isso que carrega `city`/`country` junto:
   * o par só vale enquanto os campos continuarem exatamente como a sugestão os
   * deixou. Editado à mão depois, o pin volta a ser resolvido no envio.
   */
  onPlaceResolved?: (place: ResolvedFormPlace) => void;
  errors: Record<string, string>;
  formError: string | null;
}) {
  const { categories } = useTaxonomy();

  /**
   * ⚠️ Inicializador preguiçoso, e o valor inicial é o **conteúdo do form**.
   *
   * Na captura os três nascem vazios e a seção nasce fechada, que é o ponto
   * dela. Na edição de uma empresa já enriquecida, nascer fechada esconderia
   * dado existente atrás de um clique — e um campo que o usuário não vê é um
   * campo que ele não sabe que pode corrigir. Ler o form uma vez resolve os
   * dois casos sem prop nova: depois disso quem manda é o clique.
   */
  const [detailsOpen, setDetailsOpen] = useState(
    () => Boolean(form.social || form.foundedYear || form.marketCap),
  );

  /**
   * ⚠️ **Erro dentro da seção a força aberta**, e isto não é polimento.
   *
   * Sem isto: o usuário abre "Mais detalhes", digita `199a` no ano, recolhe a
   * seção e envia. O schema recusa com erro **de campo**, o `Field` o desenha —
   * dentro de um bloco que não está na tela. O envio falharia sem nada visível
   * explicando o motivo, que é a forma de falha silenciosa que a regra dura nº
   * 10 existe para proibir.
   *
   * Derivado, não sincronizado por efeito: o erro chega junto com o render que
   * o produz, e não há estado a manter em dia.
   */
  const detailsHaveError = Boolean(
    errors.social || errors.foundedYear || errors.marketCap,
  );
  const detailsVisible = detailsOpen || detailsHaveError;

  // Prefixo por instância: sem ele, dois sheets montados ao mesmo tempo dariam
  // o mesmo `id` a dois inputs, e o `<label htmlFor>` apontaria para o errado.
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;

  const selected = categories.find((c) => c.id === category);
  const available = selected?.subcategories ?? [];

  /**
   * O país já escolhido, quando ele consta da lista. Serve a duas coisas:
   * restringir a busca de cidade (Paris/França × Paris/Texas) e decidir se o
   * texto gravado precisa entrar na lista como opção extra.
   */
  const selectedCountry = findCountryByName(form.country);

  /**
   * ⚠️ **Um país fora da lista vira opção dele mesmo, e isso não é detalhe.**
   *
   * O `Combobox` mostra "nada escolhido" para um `value` que não esteja em
   * `options`. Empresas cadastradas quando o campo era texto livre podem ter
   * qualquer grafia ("EUA", "Coreia do Sul (ROK)"), e sem esta linha abrir a
   * edição de uma delas mostraria o país **em branco** — um campo obrigatório
   * apagado sem nada avisando, que o "Salvar" então recusaria.
   */
  const countryOptions = useMemo<ComboboxOption[]>(() => {
    const typed = form.country.trim();
    if (!typed || selectedCountry) return COUNTRY_OPTIONS;
    return [
      { value: typed, label: typed, hint: "atual" },
      ...COUNTRY_OPTIONS,
    ];
  }, [form.country, selectedCountry]);

  /**
   * ⚠️ O ícone é montado **aqui**, não dentro do `Combobox`.
   *
   * O primitivo é de `ui/` e não conhece taxonomy: dar-lhe uma `iconKey` para
   * resolver contra `lib/categories.ts` arrastaria `lucide-react` e o registry
   * de ícones para todo consumidor dele — a mesma armadilha que separou
   * `lib/taxonomy-options.ts` de `lib/categories.ts`. Ele recebe o elemento
   * pronto e só posiciona.
   */
  const categoryOptions = useMemo<ComboboxOption[]>(
    () =>
      categories.map((c) => {
        const Icon = getCategoryIcon(c.iconKey);
        return {
          value: c.id,
          label: c.label,
          adornment: (
            <Icon className="size-4 shrink-0" style={{ color: c.color }} />
          ),
        };
      }),
    [categories],
  );

  /**
   * ⚠️ Trocar de categoria **limpa a seleção**, e isso mora aqui de propósito.
   *
   * Não é cosmético: a escrita resolve os slugs de dentro da categoria, então
   * uma subcategoria remanescente da categoria anterior faria o servidor
   * recusar o envio inteiro. Deixar a limpeza a cargo de quem chama significaria
   * dois lugares para acertar — e a captura e a edição já erram por caminhos
   * diferentes. Aqui é o único ponto que sabe que os dois campos são um só.
   */
  function pickCategory(slug: string) {
    if (slug === category) return;
    onCategoryChange(slug);
    onSubcategoriesChange([]);
  }

  /**
   * Uma cidade escolhida na lista traz país e coordenadas junto — os três são
   * gravados de uma vez.
   *
   * ⚠️ O país **só é sobrescrito quando o MapTiler soube dizer qual é**. Um
   * `?? ""` aqui apagaria um país já preenchido só porque a sugestão veio de um
   * território fora da nossa lista, e o campo é obrigatório.
   */
  function applyResolvedPlace(place: ResolvedPlace) {
    onChange("city", place.city);
    if (place.country) onChange("country", place.country);
    onPlaceResolved?.({
      city: place.city,
      country: place.country ?? form.country,
      lat: place.lat,
      lng: place.lng,
    });
  }

  function toggleSubcategory(slug: string) {
    onSubcategoriesChange(
      subcategories.includes(slug)
        ? subcategories.filter((s) => s !== slug)
        : [...subcategories, slug],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      <Field
        label="Nome"
        htmlFor={fieldId("name")}
        required
        error={errors.name}
      >
        <Input
          id={fieldId("name")}
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Ex.: Helix Diagnósticos"
          autoComplete="off"
        />
      </Field>

      <Field
        label="Categoria"
        htmlFor={fieldId("category")}
        required
        error={errors.category}
      >
        {/* Era uma grade de botões, e virou combobox quando a taxonomy passou a
            ser editável: a lista não tem mais teto, e um formulário de 340px
            não comporta N categorias sem empurrar cidade e país para fora da
            primeira dobra. A busca é o que mantém a escolha em um gesto. */}
        <Combobox
          id={fieldId("category")}
          options={categoryOptions}
          value={category}
          onChange={pickCategory}
          placeholder="Escolha uma categoria"
          searchPlaceholder="Buscar categoria…"
          emptyText="Nenhuma categoria com esse nome."
        />
      </Field>

      {/* Só aparece depois de a categoria ser escolhida, e só se ela tiver
          subcategorias. Mostrar um grupo vazio ("nenhuma opção") seria pedir ao
          usuário que interpretasse a ausência. */}
      {selected && available.length > 0 && (
        <Field
          label="Subcategorias"
          htmlFor={fieldId("subcategories")}
          error={errors.subcategories}
        >
          <div
            id={fieldId("subcategories")}
            role="group"
            aria-label="Subcategorias"
            className="flex flex-wrap gap-1.5"
          >
            {available.map((sub) => {
              const active = subcategories.includes(sub.id);
              return (
                <button
                  key={sub.id}
                  type="button"
                  // `aria-pressed`, não `role="radio"`: são múltiplas e podem
                  // ficar todas desmarcadas, que é o oposto de um radiogroup.
                  aria-pressed={active}
                  onClick={() => toggleSubcategory(sub.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-transparent text-on-category"
                      : "border-border text-muted hover:text-primary",
                  )}
                  style={
                    active ? { backgroundColor: selected.color } : undefined
                  }
                >
                  {sub.label}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Cidade"
          htmlFor={fieldId("city")}
          required
          error={errors.city}
        >
          <CityCombobox
            id={fieldId("city")}
            value={form.city}
            onChange={(city) => onChange("city", city)}
            onResolve={applyResolvedPlace}
            countryCode={selectedCountry?.code}
          />
        </Field>
        <Field
          label="País"
          htmlFor={fieldId("country")}
          required
          error={errors.country}
        >
          <Combobox
            id={fieldId("country")}
            options={countryOptions}
            value={form.country || null}
            onChange={(name) => onChange("country", name)}
            placeholder="Brasil"
            searchPlaceholder="Buscar país…"
            emptyText="Nenhum país com esse nome."
          />
        </Field>
      </div>

      <Field label="O que faz" htmlFor={fieldId("description")}>
        <Textarea
          id={fieldId("description")}
          value={form.description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Uma ou duas frases — o motivo de ela estar aqui."
          rows={3}
        />
      </Field>

      <Field
        label="Link (site ou social)"
        htmlFor={fieldId("website")}
        error={errors.website}
      >
        <Input
          id={fieldId("website")}
          value={form.website}
          onChange={(e) => onChange("website", e.target.value)}
          placeholder="exemplo.com"
          inputMode="url"
          autoComplete="off"
        />
      </Field>

      <Field label="Produto destaque" htmlFor={fieldId("product")}>
        <Input
          id={fieldId("product")}
          value={form.featuredProduct}
          onChange={(e) => onChange("featuredProduct", e.target.value)}
          placeholder="Produto que te interessa (opcional)"
          autoComplete="off"
        />
      </Field>

      <Field label="CEO" htmlFor={fieldId("ceo")}>
        <Input
          id={fieldId("ceo")}
          value={form.ceo}
          onChange={(e) => onChange("ceo", e.target.value)}
          placeholder="Nome de quem lidera"
          autoComplete="off"
        />
      </Field>

      {/* ── Enriquecimento, recolhido ──
          Estes três existem no schema desde o começo e são exibidos no card.
          Durante um bom tempo **só a edição os oferecia**, para não alongar a
          captura — a métrica que decide empates aqui é atrito. Recolher em vez
          de esconder mantém as duas velocidades no mesmo formulário: com pressa
          ninguém abre; com tempo, é um clique. Fechado, custa uma linha.

          ⚠️ CEO ficou **fora** daqui, sempre visível: o card o exibe em
          destaque, e enterrá-lo atrás de um clique é o tipo de campo que nunca
          chega a ser preenchido. */}
      <div className="flex flex-col gap-4 rounded-lg border border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => setDetailsOpen((prev) => !prev)}
          aria-expanded={detailsVisible}
          aria-controls={fieldId("details")}
          className="flex items-center gap-2 text-left text-sm text-muted transition-colors hover:text-primary"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform",
              detailsVisible && "rotate-180",
            )}
          />
          Mais detalhes
          <span className="text-xs text-muted/70">
            social, fundação, valor de mercado
          </span>
        </button>

        {/* Desmontado quando fechado, não escondido por CSS: um input oculto
            continua sendo alcançado por Tab e pela busca do navegador. O estado
            digitado sobrevive de qualquer forma — ele mora no `form` de quem
            chama, não aqui dentro. */}
        {detailsVisible && (
          <div id={fieldId("details")} className="flex flex-col gap-4">
            {/* O `error` aqui não é enfeite: um erro no Social força a
                seção a abrir (`detailsHaveError`), e sem ele a seção abriria
                sem dizer por quê. */}
            <Field
              label="Social"
              htmlFor={fieldId("social")}
              error={errors.social}
            >
              <Input
                id={fieldId("social")}
                value={form.social}
                onChange={(e) => onChange("social", e.target.value)}
                placeholder="@perfil ou link"
                autoComplete="off"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Fundada em"
                htmlFor={fieldId("founded")}
                error={errors.foundedYear}
              >
                <Input
                  id={fieldId("founded")}
                  value={form.foundedYear}
                  onChange={(e) => onChange("foundedYear", e.target.value)}
                  placeholder="1993"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Valor de mercado (US$)"
                htmlFor={fieldId("marketcap")}
                error={errors.marketCap}
              >
                <Input
                  id={fieldId("marketcap")}
                  value={form.marketCap}
                  onChange={(e) => onChange("marketCap", e.target.value)}
                  placeholder="230000000000"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
        <input
          type="checkbox"
          checked={trackNews}
          onChange={(e) => onTrackNewsChange(e.target.checked)}
          className="size-4 accent-accent"
        />
        <span className="text-sm text-primary">Notícias quentes</span>
        <span className="text-xs text-muted">
          acompanhar (grandes empresas)
        </span>
      </label>
    </div>
  );
}
