/**
 * Schema de entrada da taxonomy — PURO, sem I/O e sem `server-only`.
 *
 * Mesmo desenho de `lib/company-schema.ts`: os dois lados o usam. O formulário
 * valida para dar erro imediato no campo, e a Server Action valida **de novo**,
 * porque validação no cliente é UX, não segurança — a action é um endpoint HTTP
 * público, chamável sem nunca renderizar a tela.
 *
 * ── O que NÃO está aqui ──
 * `slug` e `sortOrder`. O primeiro o servidor deriva do label; o segundo só é
 * alterado pelas ações de mover, que não passam por este schema. Aceitar `slug`
 * do cliente seria pior do que inútil: ele é tratado como **imutável** (ver
 * abaixo), então um valor vindo daqui só poderia ser ignorado ou obedecido, e
 * as duas opções são armadilha.
 *
 * ⚠️ Não importa `lib/categories.ts`. As listas de validação vêm de
 * `lib/taxonomy-options.ts`, que é puro — `lib/categories.ts` importa
 * `lucide-react` e o arrastaria para todo bundle que tocasse este schema.
 */

import { z } from "zod";

import { CATEGORY_SWATCHES, ICON_KEYS } from "@/lib/taxonomy-options";

/** Cabe no índice de 340px sem quebrar a linha do contador. */
const MAX_LABEL = 40;
const MAX_BLURB = 160;

export const categoryInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { error: "Informe o nome." })
    .max(MAX_LABEL, { error: "Nome muito longo." }),

  /**
   * Paleta fechada. O `z.enum` sobre a tupla `as const` faz o TypeScript
   * recusar um hex que não esteja lá **e** produz a mensagem certa em runtime
   * para quem chamar a action direto.
   */
  color: z.enum(CATEGORY_SWATCHES, { error: "Escolha uma cor da paleta." }),

  /**
   * Obrigatório na entrada, embora a coluna seja nullable. O seletor sempre tem
   * um selecionado, então exigir aqui não custa nada — e a coluna continua
   * nullable porque linhas anteriores à migration podem não ter, e porque uma
   * chave pode sair do registry no futuro.
   */
  iconKey: z.enum(ICON_KEYS, { error: "Escolha um ícone." }),

  blurb: z
    .string()
    .trim()
    .max(MAX_BLURB, { error: "Descrição muito longa." })
    .default(""),
});

export type CategoryInput = z.output<typeof categoryInputSchema>;

/**
 * Subcategoria só tem label — é por isso que ela é editada **inline**, no
 * próprio chip, em vez de abrir um diálogo para um campo só.
 */
export const subcategoryInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { error: "Informe o nome." })
    .max(MAX_LABEL, { error: "Nome muito longo." }),
});

export type SubcategoryInput = z.output<typeof subcategoryInputSchema>;

/**
 * Mover é uma ação de vizinhança, não uma posição absoluta.
 *
 * Mandar o índice de destino convidaria o cliente a calcular a ordem, e ele tem
 * um retrato possivelmente velho da lista. "Para cima" é uma intenção que o
 * servidor resolve contra o estado atual.
 */
export const moveDirectionSchema = z.enum(["up", "down"]);

export type MoveDirection = z.output<typeof moveDirectionSchema>;
