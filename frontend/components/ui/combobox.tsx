"use client";

/**
 * Combobox — campo que se escolhe de uma lista, com busca.
 *
 * ── Por que um primitivo, e não mais um controle à mão ──
 * Três telas pediam a mesma coisa e nenhuma tinha onde apoiar: a categoria (que
 * cresce sem teto desde que a taxonomy virou editável), cidade/país, e a outra
 * ponta da relação em `AddRelationDialog` — que resolveu à mão, com um input de
 * busca e uma lista rolável, justamente porque este arquivo não existia.
 *
 * ── O que vem do `cmdk`, e por que não foi feito à mão ──
 * Navegação por setas, `Enter`/`Esc`, item ativo seguindo o scroll e o par
 * `aria-activedescendant`/`role="option"`. É a parte que quebra em silêncio
 * quando escrita à mão, e ela não aparece em teste visual nenhum.
 *
 * ⚠️ **A busca ignora acento, e isso é escolha nossa, não do `cmdk`.** O filtro
 * dele pontua por similaridade sobre o texto cru, então "saude" não acharia
 * "Saúde". Trocamos por `normalize` (`lib/text.ts`) — o mesmo do ⌘K e do
 * filtro de empresas, para as três buscas do app se comportarem igual.
 */

import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";

import { normalize } from "@/lib/text";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ComboboxOption {
  /** Identidade do item. É o que volta em `onChange`. */
  value: string;
  label: string;
  /** Termos extras que a busca também considera (sigla, nome em outra língua). */
  keywords?: string[];
  /** Elemento à esquerda do rótulo — o ícone colorido da categoria, por ex. */
  adornment?: React.ReactNode;
  /** Texto secundário, alinhado à direita. */
  hint?: string;
}

/**
 * Casa `search` contra o valor e as palavras-chave, sem acento e sem caixa.
 *
 * `cmdk` espera uma **pontuação**: 0 esconde o item, qualquer positivo mantém.
 * Não devolvemos graus de relevância porque a ordem da lista é informação — a
 * taxonomy tem `sortOrder`, e reordenar por similaridade a desmancharia.
 */
function scoreByNormalizedSubstring(
  value: string,
  search: string,
  keywords?: string[],
): number {
  const needle = normalize(search);
  if (!needle) return 1;
  const haystack = normalize([value, ...(keywords ?? [])].join(" "));
  return haystack.includes(needle) ? 1 : 0;
}

/**
 * A raiz do `cmdk` com o filtro do projeto.
 *
 * `shouldFilter={false}` desliga a filtragem local inteira — é o que a busca de
 * cidade usa, porque lá quem filtra é o MapTiler e a lista já chega pronta.
 */
function ComboboxCommand({
  className,
  ...props
}: React.ComponentProps<typeof Command>) {
  return (
    <Command
      filter={scoreByNormalizedSubstring}
      className={cn("flex w-full flex-col overflow-hidden", className)}
      {...props}
    />
  );
}

function ComboboxInput({
  className,
  ...props
}: React.ComponentProps<typeof Command.Input>) {
  return (
    <div className="flex items-center border-b border-border px-3">
      <Command.Input
        className={cn(
          "h-9 w-full bg-transparent text-sm text-primary outline-none",
          "placeholder:text-muted/70 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function ComboboxList({
  className,
  ...props
}: React.ComponentProps<typeof Command.List>) {
  return (
    <Command.List
      className={cn(
        "scrollarea max-h-64 overflow-y-auto overflow-x-hidden p-1",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxEmpty({
  className,
  ...props
}: React.ComponentProps<typeof Command.Empty>) {
  return (
    <Command.Empty
      className={cn("px-3 py-6 text-center text-sm text-muted", className)}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  ...props
}: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-primary",
        // `data-[selected]` é o item sob o cursor **ou** sob as setas — o cmdk
        // mantém os dois no mesmo estado, e é o que faz teclado e mouse
        // destacarem a mesma linha.
        "data-[selected=true]:bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))]",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * O caso comum: escolher **um** item de uma lista que já está na memória.
 *
 * ⚠️ Um `value` que não esteja em `options` aparece como "nada escolhido". Quem
 * chama é que decide o que fazer com isso — o campo de país, por exemplo,
 * injeta o texto já gravado como opção extra, porque uma empresa cadastrada
 * antes desta lista existir não pode ter o país apagado por não constar dela.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  disabled,
  className,
}: {
  id?: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/**
         * ⚠️ **Sem `role="combobox"` neste botão, de propósito.**
         *
         * Ele é o que *abre* o popover; o combobox de verdade é o campo de
         * busca lá dentro, e o `cmdk` já o marca como tal (com o
         * `aria-controls` apontando para a lista). Dois comboboxes aninhados
         * fariam o leitor de tela anunciar dois controles onde há um.
         *
         * O que o botão precisa anunciar — `aria-haspopup`, `aria-expanded` e
         * `aria-controls` — é o Radix que injeta, em runtime, através do
         * `asChild`. Escrevê-los à mão duplicaria o que já vem pronto (e o
         * `role` escrito à mão era justamente o que o `jsx-a11y` acusava, por
         * não enxergar os atributos que chegam pelo Slot).
         */}
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-canvas px-3 text-sm",
            "transition-[border-color]",
            "hover:border-border-strong focus-visible:border-accent/60",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2 text-primary">
              {selected.adornment}
              <span className="truncate">{selected.label}</span>
            </span>
          ) : (
            <span className="truncate text-muted/70">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <ComboboxCommand>
          <ComboboxInput placeholder={searchPlaceholder} />
          <ComboboxList>
            <ComboboxEmpty>{emptyText}</ComboboxEmpty>
            {options.map((option, index) => (
              <ComboboxItem
                // `value` pode repetir se quem chama injetar uma opção "atual"
                // com o mesmo rótulo da lista — o índice desambigua a key do
                // React sem mudar o que `onChange` grava.
                key={`${option.value}::${index}`}
                value={option.value}
                keywords={[option.label, ...(option.keywords ?? [])]}
                onSelect={() => {
                  // A closure, e não o argumento de `onSelect`: o cmdk devolve
                  // o `value` já em caixa baixa, o que estragaria qualquer
                  // identidade que não seja slug (o código ISO do país, p. ex.).
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.adornment}
                <span className="truncate">{option.label}</span>
                {option.hint && (
                  <span className="ml-auto shrink-0 text-xs text-muted">
                    {option.hint}
                  </span>
                )}
                {option.value === value && (
                  <Check className="ml-auto size-4 shrink-0 text-accent" />
                )}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxCommand>
      </PopoverContent>
    </Popover>
  );
}

export {
  ComboboxCommand,
  ComboboxInput,
  ComboboxList,
  ComboboxEmpty,
  ComboboxItem,
};
