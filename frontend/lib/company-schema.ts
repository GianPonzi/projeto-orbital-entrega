/**
 * Schema de entrada da captura de empresa — PURO, sem I/O e sem `server-only`.
 *
 * Vive fora da camada de servidor de propósito: os dois lados o usam. O
 * formulário valida para dar erro imediato no campo, e a Server Action valida
 * **de novo**, porque validação no cliente é UX, não segurança — a action é um
 * endpoint HTTP público, chamável sem nunca renderizar a tela.
 *
 * ── O que NÃO está aqui é tão importante quanto o que está ──
 * `id`, `slug`, `categoryId`, `addedAt` e `updatedAt` não são aceitos do
 * cliente: os três primeiros o servidor deriva, os dois últimos têm default no
 * banco. `status`, `favorite` e `priority` também ficam com o default — a
 * captura não os oferece, e aceitá-los "de brinde" abriria caminho para o
 * cliente gravar o que quisesse neles.
 *
 * ── Espelha o formulário de hoje, não uma versão mais rígida ──
 * `description` é opcional aqui porque é opcional em `AddCompanySheet`. A
 * coluna do Prisma é `String` não-nula, então o vazio vira `""` na escrita.
 * Torná-la obrigatória seria mudança de produto contra a métrica de baixo
 * atrito, não detalhe de validação.
 */

import { z } from "zod";

import type { CompanyStatus } from "@/lib/companies";

/**
 * Tetos generosos: existem para barrar payload absurdo, não para editar o texto
 * de ninguém. Um nome de empresa não passa de 120 caracteres na prática.
 */
const MAX_NAME = 120;
const MAX_PLACE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 500;
/** Teto de payload, não de produto: nenhuma categoria tem tanta subcategoria. */
const MAX_SUBCATEGORIES = 20;

/** "exemplo.com" → "https://exemplo.com". Sem isso o `new URL()` recusa. */
export function normalizeUrl(value: string): string {
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Texto opcional: `""` e ausente colapsam no mesmo `undefined`. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));
}

export const companyInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Informe o nome." })
    .max(MAX_NAME, { error: "Nome muito longo." }),

  /**
   * Só presença. **Quem existe é o banco**, e é ele quem decide: a camada de
   * escrita resolve o slug em cuid antes de gravar e lança `UnknownCategoryError`
   * se não achar, que a action traduz em erro deste campo.
   *
   * Validar aqui contra uma lista era possível enquanto a taxonomy vivia em
   * código. Com ela no banco, a lista teria que ser buscada — e ficaria velha
   * entre a busca e a escrita de qualquer forma.
   *
   * ⚠️ O `.min(1)` não é decorativo: sem ele, `""` passaria e só falharia lá na
   * frente, com a mensagem errada.
   */
  categorySlug: z.string().min(1, { error: "Escolha uma categoria." }),

  /**
   * Slugs de subcategoria, que só fazem sentido **dentro** da categoria acima.
   *
   * Mesma divisão de trabalho do `categorySlug`: aqui só forma, e quem existe é
   * o banco. A camada de escrita resolve os slugs em cuids buscando apenas
   * dentro da categoria escolhida — e é isso que fecha, na origem, a lacuna
   * descrita em `banco-de-dados.md`: nada no Postgres impede associar uma
   * empresa a uma subcategoria de outra categoria. Validar o par aqui exigiria
   * a taxonomy inteira num módulo que é puro de propósito.
   *
   * `.default([])` porque "nenhuma subcategoria" é estado legítimo, não erro —
   * e porque a captura pode simplesmente não mandar o campo.
   *
   * O `Set` dedupe: dois cliques no mesmo chip não podem virar dois `connect`
   * para a mesma linha, nem inflar a contagem que a resolução confere.
   */
  subcategorySlugs: z
    .array(z.string().min(1))
    .max(MAX_SUBCATEGORIES, { error: "Subcategorias demais." })
    .default([])
    .transform((slugs) => [...new Set(slugs)]),

  city: z
    .string()
    .trim()
    .min(1, { error: "Informe a cidade." })
    .max(MAX_PLACE, { error: "Cidade muito longa." }),
  country: z
    .string()
    .trim()
    .min(1, { error: "Informe o país." })
    .max(MAX_PLACE, { error: "País muito longo." }),

  /**
   * O cliente resolve por geocoding, mas manda o par pronto — então a faixa é
   * checada aqui. A faixa também descarta `NaN` e `Infinity`, que nenhuma
   * comparação de ordem aprova.
   */
  lat: z
    .number({ error: "Latitude inválida." })
    .min(-90, { error: "Latitude fora de faixa." })
    .max(90, { error: "Latitude fora de faixa." }),
  lng: z
    .number({ error: "Longitude inválida." })
    .min(-180, { error: "Longitude fora de faixa." })
    .max(180, { error: "Longitude fora de faixa." }),

  description: optionalText(MAX_DESCRIPTION),

  website: z
    .string()
    .trim()
    .max(MAX_URL, { error: "Endereço muito longo." })
    .optional()
    .transform((value) => (value ? normalizeUrl(value) : undefined))
    .refine((value) => value === undefined || isValidUrl(value), {
      error: "Endereço inválido.",
    }),

  featuredProduct: optionalText(MAX_NAME),

  trackNews: z.boolean().default(false),

  /**
   * ── Enriquecimento ──
   * Captura e edição oferecem os quatro: `ceo` à vista, os outros três na seção
   * recolhida "Mais detalhes". Opcionais, porque capturar com pressa é o caso
   * comum — o mesmo schema serve às duas telas.
   */
  social: optionalText(MAX_URL),
  ceo: optionalText(MAX_NAME),

  /**
   * O formulário converte texto em número antes de mandar, como já faz com
   * `lat`/`lng`. Campo em branco vira `undefined`; texto não-numérico vira
   * `NaN`, que nenhuma comparação de faixa aprova — daí o erro de campo.
   */
  foundedYear: z
    .number({ error: "Ano inválido." })
    .int({ error: "Ano inválido." })
    .min(1000, { error: "Ano fora de faixa." })
    .max(2200, { error: "Ano fora de faixa." })
    .optional(),
  marketCap: z
    .number({ error: "Valor inválido." })
    .min(0, { error: "Valor fora de faixa." })
    .max(1e15, { error: "Valor fora de faixa." })
    .optional(),
});

/** Forma **de saída** do parse: é o que a escrita recebe, já normalizado. */
export type CompanyInput = z.output<typeof companyInputSchema>;

// ── CRM: status, favorito e prioridade ──────────────────────────────────────

/**
 * Estes três campos ficam **de fora** do schema de captura acima, e continuam
 * fora: lá eles têm default do banco, e aceitá-los na criação abriria caminho
 * para o cliente gravar o que quisesse. Aqui eles são o assunto inteiro.
 *
 * `as const satisfies` mantém a tupla literal que o `z.enum` exige **e** faz o
 * TypeScript recusar um valor que não seja `CompanyStatus` — um erro de
 * digitação vira erro de compilação, não escrita recusada em runtime.
 */
const STATUS_VALUES = [
  "interesse",
  "avaliando",
  "ativa",
  "arquivada",
] as const satisfies readonly CompanyStatus[];

/**
 * Toda chave é opcional porque cada controle manda só o que mudou — favoritar
 * não deve reenviar status e prioridade junto. O `refine` no fim fecha o caso
 * degenerado: um objeto vazio passaria pelo parse e viraria um UPDATE sem
 * nenhuma coluna, que é uma ida ao banco para não fazer nada.
 */
export const companyCrmSchema = z
  .object({
    status: z.enum(STATUS_VALUES).optional(),
    favorite: z.boolean().optional(),
    // Literais, não `number().min(0).max(2)`: só assim o tipo de saída é
    // `Priority` (0 | 1 | 2) em vez de `number`.
    priority: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    error: "Nada para alterar.",
  });

export type CompanyCrmInput = z.output<typeof companyCrmSchema>;
