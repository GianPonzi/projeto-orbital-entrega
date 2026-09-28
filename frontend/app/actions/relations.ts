/**
 * Server Actions de relação.
 *
 * ⚠️ **Mais dois endpoints POST públicos** (`data-security.md:276`), cada um com
 * `getSession()` própria. Este arquivo exporta apenas actions.
 *
 * ── O que é decidido aqui e o que é decidido na camada de dados ──
 * A normalização da ordem dos ids em `parceria` fica em
 * `lib/relations.server.ts`, não aqui e muito menos no componente: ela precisa
 * valer para quem chame a action direto, e é o que impede a mesma relação
 * virar duas curvas no mapa.
 */

"use server";

import { refresh } from "next/cache";
import type { ZodError } from "zod";

import { getSession } from "@/lib/auth.server";
import { relationInputSchema } from "@/lib/relation-schema";
import {
  createRelation,
  deleteRelation,
  DuplicateRelationError,
  RelationEndpointMissingError,
  RelationNotFoundError,
} from "@/lib/relations.server";

export type RelationResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const EXPIRED_SESSION =
  "Sua sessão expirou. Recarregue a página e entre novamente.";

export async function createRelationAction(
  input: unknown,
): Promise<RelationResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  const parsed = relationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revise os campos destacados.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  try {
    await createRelation(parsed.data);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DuplicateRelationError) {
      return {
        ok: false,
        error: "Essas duas empresas já têm uma relação desse tipo.",
      };
    }

    /**
     * ⚠️ Acontece de verdade: a lista de empresas do painel é um retrato do
     * servidor, e a outra ponta pode ter sido apagada em outra janela — ou pelo
     * Prisma Studio ao lado — entre abrir o diálogo e confirmar.
     */
    if (error instanceof RelationEndpointMissingError) {
      return {
        ok: false,
        error: "Uma das empresas não existe mais. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao criar relação:", error);
    return {
      ok: false,
      error: "Não foi possível salvar agora. Tente de novo em instantes.",
    };
  }
}

export async function deleteRelationAction(
  id: unknown,
): Promise<RelationResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: EXPIRED_SESSION };

  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Relação inválida." };
  }

  try {
    await deleteRelation(id);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof RelationNotFoundError) {
      return {
        ok: false,
        error: "Essa relação já não existe. Recarregue a página.",
      };
    }

    console.error("[orbital] falha ao apagar relação:", error);
    return {
      ok: false,
      error: "Não foi possível apagar agora. Tente de novo em instantes.",
    };
  }
}

/** Não exportado: neste arquivo, exportar é publicar um endpoint HTTP. */
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
