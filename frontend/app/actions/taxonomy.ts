/**
 * Server Actions da taxonomy.
 *
 * ⚠️ **São sete endpoints POST públicos**, alcançáveis sem passar pela tela
 * (`data-security.md:276`). Por isso cada uma abre com `getSession()` própria e
 * trata todo argumento recebido como entrada não confiável — não existe "esta é
 * interna porque só a tela chama".
 *
 * ⚠️ **Este arquivo exporta apenas actions.** Um helper exportado aqui "para
 * organizar" viraria API pública sem ninguém perceber. O que é compartilhado
 * mora em `lib/taxonomy.server.ts` (dados) e `lib/taxonomy-schema.ts` (forma).
 *
 * ── Por que mexer na taxonomy é mais perigoso que mexer numa empresa ──
 * Uma empresa mal gravada afeta uma linha. Uma categoria mal gravada afeta
 * **todas as empresas dentro dela**, e duas operações aqui destroem dado que
 * ninguém pediu para destruir: apagar categoria esbarra no `Restrict`, e apagar
 * subcategoria desassocia de todas as empresas em silêncio pelo `Cascade`.
 */

"use server";

import { refresh } from "next/cache";
import type { ZodError } from "zod";

import { getSession } from "@/lib/auth.server";
import {
  categoryInputSchema,
  moveDirectionSchema,
  subcategoryInputSchema,
} from "@/lib/taxonomy-schema";
import {
  CategoryInUseError,
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  DuplicateTaxonomyError,
  moveCategory,
  moveSubcategory,
  TaxonomyNotFoundError,
  updateCategory,
  updateSubcategory,
} from "@/lib/taxonomy.server";

/**
 * Sem `fieldErrors` na maioria: só o formulário de categoria tem campos onde
 * pendurar mensagem. As demais operações acontecem em chips e botões, e a falha
 * vai para a fila de avisos.
 */
export type TaxonomyResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const EXPIRED_SESSION =
  "Sua sessão expirou. Recarregue a página e entre novamente.";

// ── Categoria ───────────────────────────────────────────────────────────────

export async function createCategoryAction(
  input: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    await createCategory(parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DuplicateTaxonomyError) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: { label: "Já existe uma categoria com esse nome." },
      };
    }

    console.error("[orbital] falha ao criar categoria:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

export async function updateCategoryAction(
  slug: unknown,
  input: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (typeof slug !== "string" || slug.length === 0) {
    return { ok: false, error: "Categoria inválida." };
  }

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    await updateCategory(slug, parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DuplicateTaxonomyError) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: { label: "Já existe uma categoria com esse nome." },
      };
    }

    if (error instanceof TaxonomyNotFoundError) {
      return {
        ok: false,
        error: "Essa categoria não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao editar categoria:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

export async function deleteCategoryAction(
  slug: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (typeof slug !== "string" || slug.length === 0) {
    return { ok: false, error: "Categoria inválida." };
  }

  try {
    await deleteCategory(slug);
    refresh();
    return { ok: true };
  } catch (error) {
    /**
     * ⚠️ A UI já desabilita o botão contando as empresas no cliente, então
     * chegar aqui significa uma de duas coisas: alguém chamou a action direto,
     * ou uma empresa foi criada nesta categoria em outra janela depois de a
     * lista de filtros montar. A segunda é real, e a mensagem precisa fazer sentido para
     * quem está olhando um botão que parecia habilitado.
     */
    if (error instanceof CategoryInUseError) {
      return {
        ok: false,
        error:
          "Essa categoria ainda tem empresas. Mova ou apague as empresas antes.",
      };
    }

    if (error instanceof TaxonomyNotFoundError) {
      return {
        ok: false,
        error: "Essa categoria já não existe. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao apagar categoria:", error);
    return {
      ok: false,
      error: "Não foi possível apagar agora. Tente de novo em instantes.",
    };
  }
}

export async function moveCategoryAction(
  slug: unknown,
  direction: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (typeof slug !== "string" || slug.length === 0) {
    return { ok: false, error: "Categoria inválida." };
  }

  const parsedDirection = moveDirectionSchema.safeParse(direction);
  if (!parsedDirection.success) {
    return { ok: false, error: "Movimento inválido." };
  }

  try {
    await moveCategory(slug, parsedDirection.data);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof TaxonomyNotFoundError) {
      return {
        ok: false,
        error: "Essa categoria não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao mover categoria:", error);
    return {
      ok: false,
      error: "Não foi possível reordenar agora. Tente de novo em instantes.",
    };
  }
}

// ── Subcategoria ────────────────────────────────────────────────────────────

export async function createSubcategoryAction(
  categorySlug: unknown,
  input: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (typeof categorySlug !== "string" || categorySlug.length === 0) {
    return { ok: false, error: "Categoria inválida." };
  }

  const parsed = subcategoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  }

  try {
    await createSubcategory(categorySlug, parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DuplicateTaxonomyError) {
      return {
        ok: false,
        error: "Essa categoria já tem uma subcategoria com esse nome.",
      };
    }

    if (error instanceof TaxonomyNotFoundError) {
      return {
        ok: false,
        error: "Essa categoria não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao criar subcategoria:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

export async function updateSubcategoryAction(
  categorySlug: unknown,
  slug: unknown,
  input: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (
    typeof categorySlug !== "string" ||
    categorySlug.length === 0 ||
    typeof slug !== "string" ||
    slug.length === 0
  ) {
    return { ok: false, error: "Subcategoria inválida." };
  }

  const parsed = subcategoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  }

  try {
    await updateSubcategory(categorySlug, slug, parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DuplicateTaxonomyError) {
      return {
        ok: false,
        error: "Essa categoria já tem uma subcategoria com esse nome.",
      };
    }

    if (error instanceof TaxonomyNotFoundError) {
      return {
        ok: false,
        error: "Essa subcategoria não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao renomear subcategoria:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

export async function deleteSubcategoryAction(
  categorySlug: unknown,
  slug: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (
    typeof categorySlug !== "string" ||
    categorySlug.length === 0 ||
    typeof slug !== "string" ||
    slug.length === 0
  ) {
    return { ok: false, error: "Subcategoria inválida." };
  }

  try {
    await deleteSubcategory(categorySlug, slug);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof TaxonomyNotFoundError) {
      return {
        ok: false,
        error: "Essa subcategoria já não existe. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao apagar subcategoria:", error);
    return {
      ok: false,
      error: "Não foi possível apagar agora. Tente de novo em instantes.",
    };
  }
}

export async function moveSubcategoryAction(
  categorySlug: unknown,
  slug: unknown,
  direction: unknown,
): Promise<TaxonomyResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (
    typeof categorySlug !== "string" ||
    categorySlug.length === 0 ||
    typeof slug !== "string" ||
    slug.length === 0
  ) {
    return { ok: false, error: "Subcategoria inválida." };
  }

  const parsedDirection = moveDirectionSchema.safeParse(direction);
  if (!parsedDirection.success) {
    return { ok: false, error: "Movimento inválido." };
  }

  try {
    await moveSubcategory(categorySlug, slug, parsedDirection.data);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof TaxonomyNotFoundError) {
      return {
        ok: false,
        error: "Essa subcategoria não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao mover subcategoria:", error);
    return {
      ok: false,
      error: "Não foi possível reordenar agora. Tente de novo em instantes.",
    };
  }
}

/**
 * Uma mensagem por campo — a primeira ganha. Gêmeo do helper de
 * `app/actions/companies.ts`, e **não exportado**: neste arquivo, exportar é
 * publicar um endpoint HTTP.
 */
function toFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}
