/**
 * Server Actions de empresa.
 *
 * ── Por que verificar a sessão aqui, se a página já checa ──
 * Porque a página não protege isto. A doc é literal: *"A page-level
 * authentication check does not extend to the Server Actions defined within
 * it"* (`02-guides/data-security.md:333`) e *"Server Functions are reachable
 * via direct POST requests, not just through your application's UI"*
 * (`07-mutating-data.md:30`). O `proxy.ts` também não cobre: ele só olha a
 * presença do cookie, sem verificar assinatura.
 *
 * Traduzindo: esta função é uma porta de entrada HTTP própria. Quem a tranca é
 * a primeira linha dela.
 */

"use server";

import { refresh } from "next/cache";
import type { ZodError } from "zod";

import { getSession } from "@/lib/auth.server";
import type { Company } from "@/lib/companies";
import { companyCrmSchema, companyInputSchema } from "@/lib/company-schema";
import {
  CompanyNotFoundError,
  createCompany,
  deleteCompany,
  DuplicateCompanyError,
  UnknownCategoryError,
  UnknownSubcategoryError,
  updateCompany,
  updateCompanyCrm,
} from "@/lib/companies.server";

/** Categoria que sumiu entre a tela ser montada e o formulário ser enviado. */
const UNKNOWN_CATEGORY_FIELD_ERROR = {
  categorySlug: "Essa categoria não existe mais. Escolha outra.",
};

/**
 * Subcategoria que sumiu, ou que não pertence à categoria escolhida.
 *
 * ⚠️ A segunda causa não deveria acontecer pela tela — trocar de categoria
 * limpa a seleção. Ela cobre o POST direto na action, que é um endpoint público
 * como qualquer outro (`data-security.md:276`), e a corrida de a subcategoria
 * ser apagada em outra janela entre abrir o formulário e enviar.
 */
const UNKNOWN_SUBCATEGORY_FIELD_ERROR = {
  subcategorySlugs: "Alguma subcategoria não existe mais. Revise a seleção.",
};

/** Mesma frase nas duas actions — sessão expirada não muda de significado. */
const EXPIRED_SESSION =
  "Sua sessão expirou. Recarregue a página e entre novamente.";

/** Resultado das duas actions que passam pelo formulário completo. */
export type CompanyFormResult =
  | { ok: true; company: Company }
  /**
   * `error` é a mensagem geral; `fieldErrors` casa com o `errors` que o
   * formulário já mantém, para o erro aparecer sob o campo certo.
   */
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createCompanyAction(
  input: unknown,
): Promise<CompanyFormResult> {
  /**
   * `getSession()`, **não** `requireAuth()`.
   *
   * Não é limitação do framework — `redirect()` é suportado em Server Action.
   * É escolha de produto: um redirect **descarta o formulário inteiro**, e o
   * usuário perde tudo o que digitou. Neste fluxo, baixo atrito na captura é a
   * métrica que decide empates; devolver o erro como valor deixa o cliente
   * repor os campos e mostrar o motivo.
   *
   * De quebra, mantém o mesmo contrato do resto da action: erro esperado é
   * valor de retorno, não exceção (`10-error-handling.md:25`).
   */
  const session = await getSession();
  if (!session) {
    return { ok: false, error: EXPIRED_SESSION };
  }

  // Revalidação, não primeira validação. O formulário já checou; isto existe
  // para quem não passou pelo formulário.
  const parsed = companyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    const company = await createCompany(parsed.data);

    // Atualiza o Router para a próxima navegação/recarga trazer a empresa do
    // servidor. Não é `revalidatePath` porque `/` é `force-dynamic` — não há
    // cache de rota a invalidar. Se a página deixar de ser force-dynamic, esta
    // escolha precisa ser revista. Exclusivo de Server Action (`refresh.md:10`).
    refresh();

    return { ok: true, company };
  } catch (error) {
    if (error instanceof DuplicateCompanyError) {
      return {
        ok: false,
        error: `Você já tem uma empresa chamada "${parsed.data.name}".`,
        fieldErrors: { name: "Esse nome já está cadastrado." },
      };
    }

    if (error instanceof UnknownCategoryError) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: UNKNOWN_CATEGORY_FIELD_ERROR,
      };
    }

    if (error instanceof UnknownSubcategoryError) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: UNKNOWN_SUBCATEGORY_FIELD_ERROR,
      };
    }

    // Falha inesperada (banco fora do ar, timeout do pooler). O detalhe fica no
    // log do servidor; o cliente recebe uma frase acionável e nada mais.
    console.error("[orbital] falha ao criar empresa:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

/**
 * Regrava a empresa inteira a partir do formulário de edição.
 *
 * Mesma verificação de sessão e mesma tradução de erros da criação — muda que
 * aqui existe um `id`, e que o P2025 (linha que sumiu) é um desfecho possível.
 */
export async function updateCompanyAction(
  id: unknown,
  input: unknown,
): Promise<CompanyFormResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: EXPIRED_SESSION };
  }

  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Empresa inválida." };
  }

  const parsed = companyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    const company = await updateCompany(id, parsed.data);
    refresh();
    return { ok: true, company };
  } catch (error) {
    if (error instanceof DuplicateCompanyError) {
      return {
        ok: false,
        error: `Você já tem uma empresa chamada "${parsed.data.name}".`,
        fieldErrors: { name: "Esse nome já está cadastrado." },
      };
    }

    // ⚠️ A ordem destes dois `if` não importa, mas a distinção importa muito:
    // sem `UnknownCategoryError` tipado, uma categoria inexistente chegaria
    // aqui como P2025 — o mesmo código de "empresa não encontrada" — e o
    // usuário leria que a empresa sumiu por causa da categoria.
    if (error instanceof UnknownCategoryError) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: UNKNOWN_CATEGORY_FIELD_ERROR,
      };
    }

    if (error instanceof UnknownSubcategoryError) {
      return {
        ok: false,
        error: "Revise os campos destacados.",
        fieldErrors: UNKNOWN_SUBCATEGORY_FIELD_ERROR,
      };
    }

    if (error instanceof CompanyNotFoundError) {
      return {
        ok: false,
        error: "Essa empresa não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao editar empresa:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

/** Apagar não devolve empresa nenhuma — só deu ou não deu. */
export type DeleteCompanyResult = { ok: true } | { ok: false; error: string };

/**
 * Apaga a empresa e, por cascata do banco, as relações que a tocam.
 *
 * ⚠️ Uma empresa que já sumiu **não** é tratada como erro aqui. Se o usuário
 * apagou em outra janela, o desfecho que ele pediu já está valendo — devolver
 * "não encontrada" transformaria sucesso em susto. O `refresh()` acerta a tela.
 */
export async function deleteCompanyAction(
  id: unknown,
): Promise<DeleteCompanyResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: EXPIRED_SESSION };
  }

  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Empresa inválida." };
  }

  try {
    await deleteCompany(id);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      refresh();
      return { ok: true };
    }

    console.error("[orbital] falha ao apagar empresa:", error);
    return {
      ok: false,
      error: "Não foi possível apagar agora. Tente de novo em instantes.",
    };
  }
}

export type CompanyCrmResult =
  | { ok: true; company: Company }
  /** Sem `fieldErrors`: não há campo de formulário onde pendurar a mensagem. */
  | { ok: false; error: string };

/**
 * Altera status, favorito e/ou prioridade.
 *
 * ⚠️ **É um endpoint HTTP próprio**, exatamente como o `createCompanyAction` —
 * alcançável por POST direto, sem passar pela tela (`data-security.md:276`).
 * Por isso repete a verificação de sessão em vez de confiar em quem chamou.
 *
 * Diferente da captura, aqui **não há escrita otimista**: a tela mostra o valor
 * do servidor o tempo todo, e o controle fica pendente até o dado novo chegar.
 * Foi decisão de produto — nestes três campos o round-trip é curto e a
 * complexidade de desfazer não se paga. Ver `decisoes-tecnicas.md`.
 */
export async function updateCompanyCrmAction(
  id: unknown,
  patch: unknown,
): Promise<CompanyCrmResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, error: EXPIRED_SESSION };
  }

  // O id vem do cliente como qualquer outro campo — checado, não confiado.
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Empresa inválida." };
  }

  const parsed = companyCrmSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: "Alteração inválida." };
  }

  try {
    const company = await updateCompanyCrm(id, parsed.data);
    refresh();
    return { ok: true, company };
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      return {
        ok: false,
        error: "Essa empresa não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao atualizar empresa:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

/**
 * Uma mensagem por campo, chaveada pelo nome do campo — a primeira ganha.
 *
 * Montado a partir de `issues` em vez de `z.flattenError`: `flatten` devolve
 * `string[]` por campo, e o formulário exibe uma linha só.
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
