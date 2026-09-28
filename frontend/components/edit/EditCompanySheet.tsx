"use client";

/**
 * Edição de empresa.
 *
 * ── Sem escrita otimista, ao contrário da captura ──
 * Na captura, a empresa aparece no mapa antes de o servidor confirmar, porque
 * atrito ali mata o produto. Aqui não: o sheet fica aberto com um indicador de
 * carregamento e **só fecha em caso de sucesso**. O ganho é que não existe
 * "desfazer" a construir — nada foi antecipado, então uma falha só precisa ser
 * contada, e os campos digitados continuam na tela por definição.
 *
 * ── O indicador vem de `useTransition` ──
 * `07-mutating-data.md:339` recomenda o par `useActionState`/pending para
 * exatamente este caso; usamos `useTransition` porque o envio não é um
 * `<form action>` — há geocoding a fazer antes de chamar a action. A doc do
 * React garante que `isPending` só volta a `false` depois de o estado final
 * estar na tela, o que evita o piscar do valor antigo.
 */

import { useState, useTransition } from "react";

import { updateCompanyAction } from "@/app/actions/companies";
import type { Company } from "@/lib/companies";
import { geocode } from "@/lib/map";
import { useAllCompanies, useAppStore } from "@/lib/store";
import { useIsMobile } from "@/lib/use-mobile";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CompanyFormFields,
  isValidUrl,
  toFormErrors,
  toOptionalNumber,
  type CompanyFormState,
  type ResolvedFormPlace,
} from "@/components/add/CompanyFormFields";
import { DeleteCompanyDialog } from "@/components/edit/DeleteCompanyDialog";

/** Empresa → formulário. Números viram texto; ausentes viram string vazia. */
function toFormState(company: Company): CompanyFormState {
  return {
    name: company.name,
    city: company.city,
    country: company.country,
    description: company.description,
    website: company.website ?? "",
    featuredProduct: company.featuredProduct ?? "",
    social: company.social ?? "",
    ceo: company.ceo ?? "",
    foundedYear: company.foundedYear?.toString() ?? "",
    marketCap: company.marketCap?.toString() ?? "",
  };
}

function EditForm({ company }: { company: Company }) {
  const closeEdit = useAppStore((s) => s.closeEdit);

  // Retrato de como a empresa chegou. É contra isto que o botão decide se há
  // algo para salvar — sem ele, "Salvar" ficaria sempre habilitado e um clique
  // sem alteração gastaria uma ida ao banco para regravar o que já estava lá.
  const [initial] = useState(() => ({
    form: toFormState(company),
    category: company.categorySlug,
    subcategories: company.subcategorySlugs,
    trackNews: company.trackNews ?? false,
  }));

  const [form, setForm] = useState<CompanyFormState>(initial.form);
  const [category, setCategory] = useState<string | null>(initial.category);
  const [subcategories, setSubcategories] = useState<string[]>(
    initial.subcategories,
  );
  const [trackNews, setTrackNews] = useState(initial.trackNews);
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedFormPlace | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const busy = geocoding || isPending;

  /**
   * Comparação **sem ordem**: a seleção cresce na ordem dos cliques, e o banco
   * devolve na ordem dele. Comparar posição a posição marcaria como alteração
   * desmarcar e remarcar os mesmos dois chips, e "Salvar" habilitaria para
   * regravar exatamente o que já estava lá. Slug só tem `a-z0-9-`, então `|`
   * nunca aparece dentro de um item e não há como dois conjuntos diferentes
   * produzirem a mesma string.
   */
  const sameSubcategories =
    [...subcategories].sort().join("|") ===
    [...initial.subcategories].sort().join("|");

  const dirty =
    category !== initial.category ||
    !sameSubcategories ||
    trackNews !== initial.trackNews ||
    (Object.keys(form) as (keyof CompanyFormState)[]).some(
      (key) => form[key] !== initial.form[key],
    );

  function update(key: keyof CompanyFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;

    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Informe o nome.";
    if (!category) nextErrors.category = "Escolha uma categoria.";
    if (!form.city.trim()) nextErrors.city = "Informe a cidade.";
    if (!form.country.trim()) nextErrors.country = "Informe o país.";
    if (form.website.trim() && !isValidUrl(form.website.trim()))
      nextErrors.website = "Endereço inválido.";

    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0 || !category) return;

    const city = form.city.trim();
    const country = form.country.trim();

    // ⚠️ Só geocodifica se o lugar mudou. Corrigir uma descrição não pode
    // gastar chamada no MapTiler nem, pior, mover o pin de posição.
    let lat = company.lat;
    let lng = company.lng;
    const placeChanged =
      city !== initial.form.city.trim() ||
      country !== initial.form.country.trim();

    // Escolher a cidade na lista já trouxe as coordenadas: o lugar mudou, mas
    // não há o que perguntar. Vale só enquanto os campos continuarem idênticos
    // à sugestão — corrigir o texto à mão depois volta a exigir o geocoding.
    const prefetched =
      resolvedPlace?.city === city && resolvedPlace?.country === country
        ? resolvedPlace
        : null;

    if (placeChanged && prefetched) {
      ({ lat, lng } = prefetched);
    } else if (placeChanged) {
      setGeocoding(true);
      const geo = await geocode(`${city}, ${country}`);
      setGeocoding(false);

      if (geo.status === "ok") {
        ({ lat, lng } = geo.point);
      } else if (geo.status === "not-found") {
        setErrors({
          city: "Não encontramos essa localização. Revise cidade e país.",
        });
        return;
      } else if (geo.status === "unavailable") {
        setFormError(
          "O serviço de localização não respondeu. Tente de novo em instantes.",
        );
        return;
      }
      // `disabled` (sem chave do MapTiler): mantém as coordenadas atuais, que
      // é melhor do que jogar a empresa para o centro do mapa numa edição.
    }

    const input = {
      name: form.name.trim(),
      categorySlug: category,
      subcategorySlugs: subcategories,
      city,
      country,
      lat,
      lng,
      description: form.description.trim(),
      website: form.website.trim(),
      featuredProduct: form.featuredProduct.trim(),
      trackNews,
      social: form.social.trim(),
      ceo: form.ceo.trim(),
      foundedYear: toOptionalNumber(form.foundedYear),
      marketCap: toOptionalNumber(form.marketCap),
    };

    startTransition(async () => {
      try {
        const result = await updateCompanyAction(company.id, input);

        if (result.ok) {
          closeEdit();
          return;
        }

        setErrors(toFormErrors(result.fieldErrors));
        setFormError(result.error);
      } catch (error) {
        // Mesma armadilha da captura: a action pode lançar em vez de retornar
        // (rede fora, ou o `proxy.ts` interceptando o POST). Sem o catch, o erro
        // sobe até o error boundary e derruba a página inteira —
        // `10-error-handling.md:375` é explícito de que exceções não tratadas
        // dentro de `startTransition` chegam lá.
        console.error("[orbital] updateCompanyAction lançou:", error);
        setFormError(
          "Não foi possível salvar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <ScrollArea className="flex-1 px-5 py-5">
        <CompanyFormFields
          form={form}
          onChange={update}
          category={category}
          onCategoryChange={setCategory}
          subcategories={subcategories}
          onSubcategoriesChange={setSubcategories}
          trackNews={trackNews}
          onTrackNewsChange={setTrackNews}
          onPlaceResolved={setResolvedPlace}
          errors={errors}
          formError={formError}
        />
      </ScrollArea>

      <SheetFooter>
        {/* `sm:mr-auto` no botão empurra o resto para a direita: destrutivo
            longe do "Salvar", para o clique errado não ser o vizinho. */}
        <DeleteCompanyDialog company={company} disabled={busy} />

        <Button
          type="button"
          variant="ghost"
          onClick={closeEdit}
          disabled={busy}
        >
          Cancelar
        </Button>
        <Button type="submit" variant="accent" disabled={busy || !dirty}>
          {geocoding ? "Localizando…" : isPending ? "Salvando…" : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function EditCompanySheet() {
  const editingId = useAppStore((s) => s.editingId);
  const closeEdit = useAppStore((s) => s.closeEdit);
  const companies = useAllCompanies();
  const isMobile = useIsMobile();

  const company = editingId
    ? companies.find((c) => c.id === editingId)
    : undefined;

  // Segura a última empresa durante a animação de saída, ajustando o estado
  // **durante o render** — o mesmo padrão do `CompanyDetailPanel`, documentado
  // em `frontend.md`. Sem isto o sheet ficaria em branco enquanto desliza.
  const [shown, setShown] = useState<Company | undefined>(company);
  if (company && company !== shown) {
    setShown(company);
  }

  return (
    <Sheet
      open={Boolean(company)}
      onOpenChange={(next) => {
        if (!next) closeEdit();
      }}
    >
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "max-h-[90vh]" : undefined}
      >
        <SheetHeader>
          <SheetTitle>Editar empresa</SheetTitle>
          <SheetDescription>
            As alterações valem depois de salvar — o sheet fecha sozinho quando
            o servidor confirmar.
          </SheetDescription>
        </SheetHeader>

        {/* `key` remonta o formulário ao trocar de empresa: sem ela, abrir outra
            empresa reaproveitaria o estado (e o retrato inicial) da anterior. */}
        {shown && <EditForm key={shown.id} company={shown} />}
      </SheetContent>
    </Sheet>
  );
}
