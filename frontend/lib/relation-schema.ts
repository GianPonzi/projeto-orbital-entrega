/**
 * Schema de entrada de relação — PURO, sem I/O e sem `server-only`.
 *
 * Mesmo desenho dos outros dois schemas: os dois lados o usam, e a action
 * revalida do zero porque é um endpoint HTTP público.
 *
 * ── O que NÃO está aqui ──
 * A normalização da ordem dos ids em tipos simétricos. Ela é **regra de
 * escrita**, não de forma: depende de saber que `parceria` é simétrica, e
 * precisa valer mesmo para quem chame a action direto. Fica em
 * `lib/relations.server.ts`.
 */

import { z } from "zod";

import type { RelationType } from "@/lib/relations";

const MAX_LABEL = 80;

/**
 * `as const satisfies` mantém a tupla literal que o `z.enum` exige **e** faz o
 * TypeScript recusar um valor que não seja `RelationType` — um erro de digitação
 * vira erro de compilação, não escrita recusada em runtime.
 */
const RELATION_TYPE_VALUES = [
  "parceria",
  "fornecedor",
  "subsidiaria",
] as const satisfies readonly RelationType[];

export const relationInputSchema = z
  .object({
    /** cuids de `Company.id` — não slugs. Ver `lib/relations.ts`. */
    sourceId: z.string().min(1, { error: "Escolha a empresa de origem." }),
    targetId: z.string().min(1, { error: "Escolha a outra empresa." }),

    type: z.enum(RELATION_TYPE_VALUES, { error: "Escolha o tipo." }),

    label: z
      .string()
      .trim()
      .max(MAX_LABEL, { error: "Descrição muito longa." })
      .optional()
      .transform((value) => (value ? value : undefined)),

    /** Ano de início. Mesma faixa de `foundedYear`, pelo mesmo motivo. */
    since: z
      .number({ error: "Ano inválido." })
      .int({ error: "Ano inválido." })
      .min(1000, { error: "Ano fora de faixa." })
      .max(2200, { error: "Ano fora de faixa." })
      .optional(),
  })
  /**
   * ⚠️ Uma empresa não se relaciona consigo mesma.
   *
   * Nada no banco impede: `@@unique([sourceId, targetId, type])` aceita o par
   * (X, X), e as duas FKs apontam para uma linha que existe. O mapa desenharia
   * um arco de um ponto para ele mesmo — `arcPoints` receberia `dist = 0` e
   * cairia no `|| 1`, produzindo uma curva sem sentido a partir do nada.
   */
  .refine((input) => input.sourceId !== input.targetId, {
    error: "Escolha duas empresas diferentes.",
    path: ["targetId"],
  });

export type RelationInput = z.output<typeof relationInputSchema>;
