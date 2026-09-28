"use client";

import { useState } from "react";
import { createCompanyAction } from "@/app/actions/companies";
import { normalizeUrl } from "@/lib/company-schema";
import { geocode } from "@/lib/map";
import { todayString } from "@/lib/dates";
import { useTaxonomy } from "@/lib/data-context";
import type { Company } from "@/lib/companies";
import { useAppStore } from "@/lib/store";
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
  EMPTY_FORM,
  isValidUrl,
  toFormErrors,
  toOptionalNumber,
  type CompanyFormState,
  type ResolvedFormPlace,
} from "@/components/add/CompanyFormFields";

export function AddCompanySheet() {
  const addOpen = useAppStore((s) => s.addOpen);
  const setAddOpen = useAppStore((s) => s.setAddOpen);
  const addPendingCompany = useAppStore((s) => s.addPendingCompany);
  const resolvePendingCompany = useAppStore((s) => s.resolvePendingCompany);
  const discardPendingCompany = useAppStore((s) => s.discardPendingCompany);
  const focusCompany = useAppStore((s) => s.focusCompany);
  const addPrefill = useAppStore((s) => s.addPrefill);
  const isMobile = useIsMobile();

  const { categories, getSubcategories } = useTaxonomy();

  const [form, setForm] = useState<CompanyFormState>(EMPTY_FORM);
  const [category, setCategory] = useState<string | null>(null);
  const [subcategories, setSubcategories] = useState<string[]>([]);

  /**
   * Pré-preenchimento: só o nome, vindo do ⌘K ("Capturar 'Acme'"), ou a
   * proposta inteira do agente, vinda do chat. O `token` muda a cada pedido, e
   * é comparado **durante o render** — o mesmo padrão de ajuste de estado do
   * `CompanyDetailPanel`, sem efeito e sem um render com os campos vazios.
   *
   * Parte de `EMPTY_FORM` e não do `form` atual: a paleta não abre com outro
   * diálogo aberto, e o chat fica atrás do sheet modal — então a captura chega
   * aqui sempre fechada, e fechada ela já foi zerada pelo `reset()`.
   *
   * ⚠️ Categoria e subcategorias são **conferidas contra a taxonomy de agora**.
   * A proposta usa a taxonomy do momento da pergunta; se a categoria foi
   * apagada depois, o campo fica vazio e o envio pede para escolher — em vez
   * de o servidor recusar a captura inteira depois de o otimista já ter
   * aparecido no mapa. Subcategoria de fora da categoria some pelo mesmo motivo.
   */
  const [appliedPrefill, setAppliedPrefill] = useState(addPrefill?.token ?? 0);
  if (addPrefill && addPrefill.token !== appliedPrefill) {
    setAppliedPrefill(addPrefill.token);
    const { categorySlug, subcategorySlugs = [], ...fields } = addPrefill.values;
    const prefilledCategory =
      categorySlug && categories.some((c) => c.id === categorySlug)
        ? categorySlug
        : null;
    setForm({ ...EMPTY_FORM, ...fields });
    setCategory(prefilledCategory);
    setSubcategories(
      prefilledCategory
        ? getSubcategories(prefilledCategory, subcategorySlugs).map((s) => s.id)
        : [],
    );
  }
  const [trackNews, setTrackNews] = useState(false);
  /** Coordenadas que vieram junto da cidade escolhida no autocomplete. */
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedFormPlace | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Mensagem que não pertence a nenhum campo (falha do servidor, duplicata). */
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setForm(EMPTY_FORM);
    setCategory(null);
    setSubcategories([]);
    setTrackNews(false);
    setResolvedPlace(null);
    setErrors({});
    setFormError(null);
    setSubmitting(false);
  }

  function update(key: keyof CompanyFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(next: boolean) {
    setAddOpen(next);
    if (!next) reset();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

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

    /**
     * Cidade escolhida no autocomplete já chegou com coordenadas — o geocoding
     * do envio seria uma segunda pergunta para a mesma resposta, e some com ele
     * a espera de "Localizando…" no caminho mais comum.
     *
     * ⚠️ A comparação com o texto atual é o que sustenta isso: editar cidade ou
     * país à mão depois de escolher da lista invalida o par, e o pin volta a ser
     * resolvido. Sem ela, a empresa iria para o mapa na coordenada da cidade
     * anterior — errada e sem nada indicando que está.
     */
    const prefetched =
      resolvedPlace?.city === city && resolvedPlace?.country === country
        ? resolvedPlace
        : null;

    let lat: number;
    let lng: number;

    if (prefetched) {
      ({ lat, lng } = prefetched);
    } else {
      // Resolve the pin from the typed city/country via geocoding.
      setSubmitting(true);
      const geo = await geocode(`${city}, ${country}`);
      setSubmitting(false);

      // O sheet segue aberto durante o geocoding, e dá para fechá-lo com Esc ou
      // clique fora (só o botão Cancelar fica desabilitado). Fechar é cancelar:
      // continuar gravaria uma empresa que o usuário desistiu de adicionar.
      if (!useAppStore.getState().addOpen) return;

      if (geo.status === "ok") {
        ({ lat, lng } = geo.point);
      } else if (geo.status === "disabled") {
        // Sem chave do MapTiler: larga no centro do mapa para o fluxo não morrer.
        const center = useAppStore.getState().mapView;
        lat = center.lat;
        lng = center.lng;
      } else if (geo.status === "not-found") {
        // A API respondeu e não achou — o texto é que está errado.
        setErrors({
          city: "Não encontramos essa localização. Revise cidade e país.",
        });
        return;
      } else {
        // Fora do ar ou prazo estourado. Mandar o usuário "revisar cidade e país"
        // aqui seria pedir que ele conserte um texto que provavelmente está certo.
        setFormError(
          "O serviço de localização não respondeu. Tente de novo em instantes.",
        );
        return;
      }
    }

    // O que vai para a action — cru, sem normalizar: o schema é a autoridade
    // sobre a forma final, e duas normalizações divergem com o tempo.
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

      // ⚠️ Estes quatro passaram a ser oferecidos na captura (CEO à vista, os
      // outros três atrás de "Mais detalhes"). O schema e o `createCompany`
      // sempre os aceitaram — não mandá-los aqui faria o usuário digitar e o
      // dado ser descartado em silêncio, que é a regra dura nº 11 pela quarta
      // vez, agora em campos que já existiam.
      social: form.social.trim(),
      ceo: form.ceo.trim(),
      foundedYear: toOptionalNumber(form.foundedYear),
      marketCap: toOptionalNumber(form.marketCap),
    };

    // Retrato do formulário ANTES de fechar: `handleOpenChange(false)` chama
    // `reset()`. Sem isto, uma falha depois do round-trip devolveria o sheet
    // vazio, e o usuário teria perdido tudo o que digitou.
    // `resolvedPlace` entra junto: sem ele, o reenvio depois de uma falha
    // geocodificaria de novo uma cidade que já tinha coordenadas — o mesmo
    // formulário ficaria lento na segunda tentativa, sem motivo visível.
    const snapshot = { form, category, subcategories, trackNews, resolvedPlace };

    const today = todayString();
    const optimistic: Company = {
      // Prefixo explícito: é o id que a store troca pelo cuid real ao resolver.
      id: `pending-${crypto.randomUUID()}`,
      name: input.name,
      categorySlug: category,
      subcategorySlugs: subcategories,
      city,
      country,
      lat,
      lng,
      description: input.description,
      website: input.website ? normalizeUrl(input.website) : undefined,
      featuredProduct: input.featuredProduct || undefined,
      trackNews,

      // O card lê estes do DTO. Sem eles aqui, a empresa apareceria no mapa
      // sem o que o usuário acabou de digitar e ganharia os campos sozinha
      // quando o servidor confirmasse — um pisca sem explicação.
      social: input.social || undefined,
      ceo: input.ceo || undefined,
      foundedYear: input.foundedYear,
      marketCap: input.marketCap,
      // Espelham os defaults do banco (schema.prisma). Se eles mudarem lá, o
      // otimista fica errado por um instante até o servidor confirmar.
      status: "interesse",
      favorite: false,
      priority: 0,
      addedAt: today,
      updatedAt: today,
    };

    // A empresa aparece no mapa AGORA. A gravação segue em segundo plano — é o
    // que preserva a instantaneidade da captura, que é a métrica do produto.
    addPendingCompany(optimistic);
    focusCompany(optimistic);
    handleOpenChange(false);

    // Desfaz o otimista e devolve o formulário como estava, com o erro.
    function rollback(message: string, fieldErrors?: Record<string, string>) {
      discardPendingCompany(optimistic.id);
      setForm(snapshot.form);
      setCategory(snapshot.category);
      setSubcategories(snapshot.subcategories);
      setTrackNews(snapshot.trackNews);
      setResolvedPlace(snapshot.resolvedPlace);
      setErrors(toFormErrors(fieldErrors));
      setFormError(message);
      setAddOpen(true);
    }

    try {
      const result = await createCompanyAction(input);

      if (result.ok) {
        resolvePendingCompany(optimistic.id, result.company);
        return;
      }

      rollback(result.error, result.fieldErrors);
    } catch (error) {
      // ⚠️ Sem este catch, uma exceção deixa a empresa otimista na tela para
      // sempre, parecendo salva — o `rollback` nunca roda e nenhum aviso
      // aparece. É a pior falha possível no fluxo de captura, porque o usuário
      // só descobre no próximo reload, quando já não dá para recuperar o que
      // ele digitou. Cobre queda de rede no meio do POST e qualquer erro do
      // servidor que escape como exceção em vez de valor de retorno.
      // A mensagem cobre duas causas de propósito. Sem cookie, o `proxy.ts`
      // devolve um redirect antes de a action rodar, e o cliente lança ao
      // receber HTML onde esperava resposta de action — o mesmo caminho de uma
      // queda de rede. Distinguir os dois aqui exigiria inspecionar o erro
      // interno do Next; recarregar resolve os dois casos.
      console.error("[orbital] createCompanyAction lançou:", error);
      rollback(
        "Não foi possível salvar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
      );
    }
  }

  return (
    <Sheet open={addOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "max-h-[90vh]" : undefined}
      >
        <SheetHeader>
          <SheetTitle>Capturar empresa</SheetTitle>
          <SheetDescription>
            Entra no radar na hora. O resto dá para completar depois.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="accent" disabled={submitting}>
              {submitting ? "Localizando…" : "Capturar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
