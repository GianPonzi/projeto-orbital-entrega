/**
 * Acesso a relações no Postgres — camada de SERVIDOR.
 * Ver `lib/companies.server.ts` para o porquê do `import "server-only"`.
 *
 * Nota sobre ids: `source` e `target` recebem os **cuids** das empresas, para
 * ficarem consistentes com `Company.id`. Nos JSONs eles eram slugs ("amd"),
 * porque lá o id da empresa era o próprio slug. Quem casa aresta com empresa é
 * o `Company.id`, então os dois lados têm que falar a mesma língua.
 */

import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RelationInput } from "@/lib/relation-schema";
import type { Relation, RelationType } from "@/lib/relations";

export async function getRelations(): Promise<Relation[]> {
  const rows = await prisma.relation.findMany({
    // Ordem estável para o fan-out de curvatura dos arcos paralelos no mapa
    // não trocar de lado entre um carregamento e outro.
    orderBy: { id: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    source: row.sourceId,
    target: row.targetId,
    type: row.type as RelationType,
    label: row.label ?? undefined,
    since: row.since ?? undefined,
  }));
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Relação que já existe entre as duas empresas, no mesmo tipo.
 *
 * Erro **esperado**, não falha de sistema: o `@@unique([sourceId, targetId,
 * type])` existe justamente para impedir a duplicata, e a autoridade é ele —
 * consultar antes não dispensaria este tratamento e custaria uma query no
 * caminho feliz. Mesmo raciocínio do P2002 de `Company.slug`.
 */
export class DuplicateRelationError extends Error {
  constructor() {
    super("Essa relação já existe.");
    this.name = "DuplicateRelationError";
  }
}

/** Uma das pontas não existe (mais) — P2003 nas FKs de `Relation`. */
export class RelationEndpointMissingError extends Error {
  constructor() {
    super("Uma das empresas não existe mais.");
    this.name = "RelationEndpointMissingError";
  }
}

/** Relação que não está (mais) no banco. */
export class RelationNotFoundError extends Error {
  constructor(readonly relationId: string) {
    super(`Relação ${relationId} não encontrada.`);
    this.name = "RelationNotFoundError";
  }
}

/**
 * Grava a aresta.
 *
 * ── ⚠️ Tipos simétricos têm a ordem dos ids normalizada ──
 * `parceria` é simétrica: "A é parceira de B" e "B é parceira de A" são a mesma
 * informação. Mas `@@unique([sourceId, targetId, type])` **não** impede as duas
 * linhas — para o índice, (A,B) e (B,A) são pares diferentes.
 *
 * O estrago seria no mapa: o `pairKey` de `MapCanvas.tsx` ordena os ids ao
 * agrupar arestas paralelas, então as duas linhas cairiam no mesmo grupo e
 * sairiam como um **leque de duas curvas** — a mesma relação desenhada duas
 * vezes, sem nada indicando que é duplicata.
 *
 * Ordenar os cuids antes de gravar faz o índice fazer o trabalho: a segunda
 * tentativa vira P2002 e recebe "essa relação já existe".
 *
 * Os tipos direcionados (`fornecedor`, `subsidiaria`) **não** são normalizados —
 * ali a ordem É a informação: quem fornece para quem.
 */
export async function createRelation(input: RelationInput): Promise<void> {
  const { sourceId, targetId } = normalizeEndpoints(
    input.sourceId,
    input.targetId,
    input.type,
  );

  try {
    await prisma.relation.create({
      data: {
        sourceId,
        targetId,
        type: input.type,
        label: input.label ?? null,
        since: input.since ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateRelationError();
    if (isForeignKeyViolation(error)) throw new RelationEndpointMissingError();
    throw error;
  }
}

/**
 * ⚠️ A normalização mora **aqui**, e não no componente, porque a action é um
 * endpoint HTTP público: um POST direto com (B,A) precisa cair na mesma regra
 * que a tela aplica. Deixar isso no cliente seria deixar a integridade do mapa
 * a cargo de quem chama.
 */
function normalizeEndpoints(
  sourceId: string,
  targetId: string,
  type: RelationType,
): { sourceId: string; targetId: string } {
  const symmetric = type === "parceria";
  if (!symmetric) return { sourceId, targetId };

  return sourceId <= targetId
    ? { sourceId, targetId }
    : { sourceId: targetId, targetId: sourceId };
}

/**
 * Apaga a aresta.
 *
 * Ao contrário de apagar empresa, **uma relação que já sumiu é erro** — não há
 * cascata nem efeito colateral aqui, e o painel lista as relações a partir do
 * dado do servidor: um sumiço silencioso significaria que a tela está velha, e
 * é isso que a mensagem diz.
 */
export async function deleteRelation(id: string): Promise<void> {
  try {
    await prisma.relation.delete({ where: { id } });
  } catch (error) {
    if (isRecordNotFound(error)) throw new RelationNotFoundError(id);
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
