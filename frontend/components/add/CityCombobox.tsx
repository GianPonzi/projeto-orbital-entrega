"use client";

/**
 * Campo de cidade com autocomplete do MapTiler.
 *
 * ── O ganho não é (só) evitar erro de digitação ──
 * Cada sugestão vem com as **coordenadas**. Escolher uma resolve o pin ali, e o
 * envio deixa de precisar do `geocode()` — some a espera de "Localizando…" e
 * some o caminho de erro `not-found`, que era o que dizia "revise cidade e
 * país" para um texto que quase sempre estava certo.
 *
 * ⚠️ **Digitar continua valendo.** A última linha da lista é sempre "usar o que
 * eu digitei": o MapTiler não conhece toda cidade, e um autocomplete que
 * *obriga* a escolher da lista transforma uma cidade ausente em captura
 * impossível — atrito no fluxo onde ele custa o produto. Nesse caminho o pin
 * volta a ser resolvido no envio, como antes.
 *
 * ── Por que `Input` + `PopoverAnchor`, e não botão que abre busca ──
 * O desenho documentado em `popover.tsx`: o usuário digita no campo que vê, e
 * as sugestões descem dele. Um botão-trigger (como o de país) obrigaria a
 * abrir um segundo campo só para digitar — e, aninhado no Sheet, o autofocus
 * desse segundo campo às vezes falha, e o sintoma é "cidade travada".
 */

import { useEffect, useState } from "react";
import { MapPin, Pencil } from "lucide-react";

import { findCountryByCode } from "@/lib/countries";
import { MAPTILER_KEY, searchCities, type PlaceSuggestion } from "@/lib/map";
import {
  ComboboxCommand,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

/** Lugar escolhido na lista — tudo o que o formulário precisa de uma vez. */
export interface ResolvedPlace {
  city: string;
  /**
   * Nome canônico da nossa lista. Fica `undefined` quando o país do MapTiler
   * não consta dela (Antártida, agrupamentos) — aí o campo de país continua
   * como o usuário deixou, em vez de receber uma grafia que não casa com nada.
   */
  country?: string;
  lat: number;
  lng: number;
}

/**
 * Espera entre a última tecla e a busca. Curto o bastante para parecer
 * instantâneo, longo o bastante para "são paulo" custar uma requisição em vez
 * de nove — a chave do MapTiler tem cota, e ela é a mesma do mapa.
 */
const DEBOUNCE_MS = 250;

/**
 * Identidade de uma busca: a mesma palavra em países diferentes é outra busca.
 * Guardar a chave junto da resposta é o que permite descobrir, **no render**,
 * se o que está em mãos ainda vale — sem um efeito de limpeza para cada vez que
 * a pergunta muda.
 */
function searchKey(query: string, countryCode?: string): string {
  return `${countryCode ?? ""}|${query}`;
}

export function CityCombobox({
  id,
  value,
  onChange,
  onResolve,
  countryCode,
  disabled,
}: {
  id?: string;
  value: string;
  /** Texto livre — o usuário escolheu "usar o que digitei". */
  onChange: (city: string) => void;
  /** Sugestão escolhida: cidade, país e coordenadas de uma vez. */
  onResolve: (place: ResolvedPlace) => void;
  /** ISO alpha-2 do país já escolhido. Restringe a busca; opcional. */
  countryCode?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  /**
   * ⚠️ **As duas guardam a chave da busca que as produziu, e é isso que
   * dispensa limpá-las.**
   *
   * A forma óbvia — um `results` e um `status`, zerados no começo do efeito —
   * é a que o `react-hooks/set-state-in-effect` acusa, e com razão: seria
   * estado derivado sendo sincronizado à mão, com um render entre a mudança da
   * pergunta e o descarte da resposta velha. Carregando a chave, "esta resposta
   * ainda vale?" é uma comparação no render, e apagar a busca não precisa de
   * efeito nenhum.
   */
  const [answer, setAnswer] = useState<{
    key: string;
    items: PlaceSuggestion[];
  } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const typed = value.trim();
  const key = searchKey(typed, countryCode);

  const results = answer?.key === key ? answer.items : [];
  const failed = failedKey === key;
  const loading = Boolean(typed) && !failed && answer?.key !== key;

  useEffect(() => {
    const q = value.trim();
    if (!open || !q) return;

    // ⚠️ O `AbortController` não é higiene: sem ele, a resposta de "par" chega
    // depois da de "paris" e sobrescreve a lista certa pela velha. Requisição
    // fora de ordem é o defeito clássico de autocomplete, e ele aparece como
    // "a lista às vezes mostra outra coisa" — nunca como erro.
    const controller = new AbortController();
    const current = searchKey(q, countryCode);

    const timer = setTimeout(async () => {
      try {
        const items = await searchCities(q, {
          countryCode,
          signal: controller.signal,
        });
        setAnswer({ key: current, items });
      } catch {
        // Cancelamento é fluxo normal (o usuário digitou mais uma letra), não
        // falha — anunciá-lo faria a lista piscar "não respondeu" a cada tecla.
        if (controller.signal.aborted) return;
        setFailedKey(current);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open, countryCode]);

  /**
   * ⚠️ Sem chave do MapTiler o campo volta a ser um input comum.
   *
   * O combobox degradaria para uma lista com uma opção só ("usar o que
   * digitei") — dois cliques para fazer o que digitar já fazia. `MAPTILER_KEY`
   * é constante de build, então este ramo nunca muda em tempo de execução e a
   * ordem dos hooks acima está a salvo.
   */
  if (!MAPTILER_KEY) {
    return (
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="São Paulo"
        autoComplete="off"
        disabled={disabled}
      />
    );
  }

  function chooseSuggestion(suggestion: PlaceSuggestion) {
    onResolve({
      city: suggestion.city,
      country: findCountryByCode(suggestion.countryCode)?.name,
      lat: suggestion.lat,
      lng: suggestion.lng,
    });
    setOpen(false);
  }

  function chooseTyped() {
    // O texto já está no `value` — só fecha a lista. Chamar `onChange` de novo
    // seria no-op, e reabrir o ciclo de busca sem motivo.
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Abrir ao digitar: a lista só tem o que mostrar depois da primeira
            // letra, mas abrir vazio também mostra "Digite para buscar."
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="São Paulo"
          autoComplete="off"
          disabled={disabled}
        />
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
        // Foco fica no Input âncora — sem isto o Radix puxaria o foco para o
        // painel e o usuário teria que clicar de novo para continuar digitando.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {/* `shouldFilter={false}`: quem filtra é o MapTiler, e a lista já chega
            pronta. Sem `ComboboxInput`: a busca é o Input âncora acima. */}
        <ComboboxCommand shouldFilter={false}>
          <ComboboxList>
            {loading && (
              <p className="px-3 py-6 text-center text-sm text-muted">
                Buscando…
              </p>
            )}

            {/* "Não achei" e "não consegui perguntar" pedem textos diferentes —
                a mesma distinção que `GeocodeOutcome` faz no envio. */}
            {failed && (
              <p className="px-3 py-6 text-center text-sm text-muted">
                O serviço de localização não respondeu. Você ainda pode usar o
                que digitou.
              </p>
            )}

            {!loading && !failed && typed && results.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">
                Nenhuma cidade encontrada.
              </p>
            )}

            {!typed && (
              <p className="px-3 py-6 text-center text-sm text-muted">
                Digite para buscar.
              </p>
            )}

            {results.map((suggestion) => (
              <ComboboxItem
                key={suggestion.id}
                value={suggestion.id}
                onSelect={() => chooseSuggestion(suggestion)}
                className="items-start"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{suggestion.city}</span>
                  {/* A hierarquia é o que distingue Paris (França) de Paris
                      (Texas) — sem ela a lista mostra cinco linhas iguais. */}
                  <span className="truncate text-xs text-muted">
                    {suggestion.context}
                  </span>
                </span>
              </ComboboxItem>
            ))}

            {typed && (
              <ComboboxItem
                value={`__typed__${typed}`}
                onSelect={chooseTyped}
                className="text-muted"
              >
                <Pencil className="size-4 shrink-0" />
                <span className="truncate">
                  Usar &ldquo;{typed}&rdquo; como digitei
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxCommand>
      </PopoverContent>
    </Popover>
  );
}
