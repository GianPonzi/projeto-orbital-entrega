/**
 * Acesso a empresas no Postgres — camada de SERVIDOR.
 *
 * ── Por que `import "server-only"` ──
 * `"use client"` é uma fronteira de módulo: tudo que um arquivo cliente importa
 * entra no bundle do navegador, recursivamente. Se este módulo fosse alcançado
 * dali, o `pg` (que depende de `net`/`tls`) iria junto e o build quebraria com
 * um "Module not found" obscuro, longe da causa. A diretiva antecipa isso para
 * um erro explícito. Não é preciso instalar o pacote — o Next intercepta o
 * import internamente.
 *
 * ── Este arquivo é o único ponto de tradução ──
 * Duas conversões acontecem aqui e em lugar nenhum mais:
 *   1. cuid vs slug — `id` recebe o cuid (a escrita vai precisar dele para
 *      update/delete); `categorySlug` recebe o slug, que é o que casa com a
 *      taxonomy entregue à UI e com o estado dos filtros.
 *   2. `Date` → string "YYYY-MM-DD", o formato que a UI já exibe.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { CompanyCrmInput, CompanyInput } from "@/lib/company-schema";
import { toDateString } from "@/lib/dates";
import { slugify } from "@/lib/text";
import type { Company, CompanyStatus, Priority } from "@/lib/companies";

/**
 * Uma definição só, usada na leitura e na escrita — é o que garante que as duas
 * entreguem exatamente a linha que `toCompany` sabe traduzir.
 */
const COMPANY_INCLUDE = {
  category: { select: { slug: true } },
  subcategories: { select: { slug: true } },
} as const;

function findCompanies() {
  return prisma.company.findMany({
    include: COMPANY_INCLUDE,
    // No JSON a ordem era a do array — arbitrária, mas estável. No banco é
    // preciso escolher: prioridade primeiro, captura recente em seguida.
    orderBy: [{ priority: "desc" }, { addedAt: "desc" }],
  });
}

/** Linha do banco já com as relações incluídas, derivada da própria query. */
type CompanyRow = Awaited<ReturnType<typeof findCompanies>>[number];

export async function getCompanies(): Promise<Company[]> {
  const rows = await findCompanies();
  return rows.map(toCompany);
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Nome que já existe no banco depois de normalizado ("NVIDIA" com "Nvidia" já
 * cadastrada). É erro **esperado** do fluxo de captura, não falha de sistema —
 * por isso tem tipo próprio: a action precisa distingui-lo de um banco fora do
 * ar para escolher a mensagem.
 */
export class DuplicateCompanyError extends Error {
  constructor(readonly companyName: string) {
    super(`Já existe uma empresa com o nome "${companyName}".`);
    this.name = "DuplicateCompanyError";
  }
}

/**
 * Slug de categoria que não existe no banco.
 *
 * ⚠️ **Este erro precisa de tipo próprio, e o motivo não é elegância.** Deixar
 * o `connect: { slug }` falhar sozinho produziria um **P2025**, que é o mesmo
 * código que `updateCompany` já traduz como "essa empresa não existe mais" — o
 * usuário leria que a empresa sumiu por causa de uma categoria, num formulário
 * que ele não teria como destravar.
 *
 * Não vale o precedente do P2002 (colisão de slug), onde deixamos o banco ser a
 * autoridade: lá o código é **inequívoco** (`Company` só tem uma constraint
 * `@unique`) e existe corrida real entre consultar e inserir. Aqui o código é
 * ambíguo entre duas causas, e "esta categoria existe?" não é uma corrida.
 */
export class UnknownCategoryError extends Error {
  constructor(readonly categorySlug: string) {
    super(`Categoria "${categorySlug}" não existe.`);
    this.name = "UnknownCategoryError";
  }
}

/**
 * Subcategoria que não existe **dentro da categoria escolhida**.
 *
 * ⚠️ Os dois casos que isto cobre são diferentes e chegam pela mesma porta: o
 * slug não existe em lugar nenhum, ou existe mas pertence a outra categoria
 * (`logistica` está em Robótica **e** em Fornecedores). O segundo é justamente
 * a lacuna que `banco-de-dados.md` registra: o `@@unique([categoryId, slug])`
 * impede colisão de nome entre categorias, mas **não** impede uma empresa de
 * Saúde carregar `solar`, que é de Energia. Nada no Postgres barra isso — quem
 * barra é a resolução abaixo.
 */
export class UnknownSubcategoryError extends Error {
  constructor(readonly subcategorySlugs: string[]) {
    super(`Subcategorias inválidas: ${subcategorySlugs.join(", ")}.`);
    this.name = "UnknownSubcategoryError";
  }
}

/**
 * Traduz os slugs da taxonomy em cuids, ou lança.
 *
 * ── Uma query só, e é ela que garante a integridade ──
 * As subcategorias são buscadas **de dentro** da categoria, não pelo slug solto.
 * Um slug que exista em outra categoria simplesmente não volta, e cai no
 * `missing` abaixo — a validação sai de graça do jeito de perguntar.
 *
 * Custa um SELECT a mais por escrita, e o motivo de ele existir não é este: é
 * poder distinguir "categoria não existe" de "empresa não existe", que o Prisma
 * reporta com o mesmo P2025.
 */
async function resolveTaxonomy(
  categorySlug: string,
  subcategorySlugs: string[],
): Promise<{ categoryId: string; subcategoryIds: string[] }> {
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    select: {
      id: true,
      subcategories: {
        where: { slug: { in: subcategorySlugs } },
        select: { id: true, slug: true },
      },
    },
  });

  if (!category) throw new UnknownCategoryError(categorySlug);

  // Os slugs já vêm deduplicados do schema, então comparar por presença basta.
  const found = new Set(category.subcategories.map((s) => s.slug));
  const missing = subcategorySlugs.filter((slug) => !found.has(slug));
  if (missing.length > 0) throw new UnknownSubcategoryError(missing);

  return {
    categoryId: category.id,
    subcategoryIds: category.subcategories.map((s) => s.id),
  };
}

/**
 * Grava a empresa e devolve o mesmo DTO que a leitura produz — nunca a linha
 * crua do Prisma. Um formato de `Company` só em todo o projeto, e o cliente
 * recebe apenas o que ele já sabia receber.
 *
 * O que o servidor decide sozinho: `slug` (derivado do nome) e `categoryId`
 * (resolvido a partir do slug). `addedAt`, `updatedAt`, `status`, `favorite` e
 * `priority` ficam com o default do banco.
 */
export async function createCompany(input: CompanyInput): Promise<Company> {
  const { categoryId, subcategoryIds } = await resolveTaxonomy(
    input.categorySlug,
    input.subcategorySlugs,
  );

  try {
    const row = await prisma.company.create({
      data: {
        slug: buildSlug(input.name),
        name: input.name,
        categoryId,

        /**
         * ⚠️ `connect` é escrita **aninhada**, e escrita aninhada abre transação
         * — o que reexpõe a criação ao `maxWait`, o prazo que a resolução do
         * `categoryId` tinha acabado de eliminar. Não há como evitar com m2m
         * implícita: a tabela de junção não é escrita diretamente.
         *
         * O `undefined` quando não há subcategoria não é micro-otimização: é o
         * que mantém a **captura sem subcategoria** — o caminho mais quente do
         * produto — fora de transação, como estava.
         */
        subcategories:
          subcategoryIds.length > 0
            ? { connect: subcategoryIds.map((id) => ({ id })) }
            : undefined,

        city: input.city,
        country: input.country,
        lat: input.lat,
        lng: input.lng,

        // A coluna é `String` não-nula; o formulário deixa o campo opcional.
        description: input.description ?? "",
        website: input.website ?? null,
        featuredProduct: input.featuredProduct ?? null,
        trackNews: input.trackNews,

        // Enriquecimento: CEO à vista na captura, os outros três em "Mais
        // detalhes". Todos opcionais — o vazio vira `null`.
        social: input.social ?? null,
        ceo: input.ceo ?? null,
        foundedYear: input.foundedYear ?? null,
        marketCap: input.marketCap ?? null,
      },
      include: COMPANY_INCLUDE,
    });

    return toCompany(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateCompanyError(input.name);
    }
    throw error;
  }
}

/**
 * Regrava a empresa inteira a partir do formulário de edição.
 *
 * ── Substituição, não merge ──
 * Todo campo do schema é escrito, e um campo apagado na tela vira `null` no
 * banco. É o contrato certo para um formulário completo: o que está na tela é o
 * que passa a valer. (O `updateCompanyCrm` acima é o oposto — patch parcial —
 * porque lá cada controle manda só o que ele mexeu.)
 *
 * ── O slug acompanha o nome ──
 * Renomear regera o slug, e isso só é seguro porque a identidade é o **cuid**:
 * nada aponta para o slug, então ele pode mudar sem quebrar seleção, relações
 * ou o painel aberto. Em troca, renomear pode colidir com uma empresa existente
 * — mesmo P2002, mesma mensagem de nome repetido que a criação daria.
 *
 * ⚠️ Como `createCompany`, resolve a categoria **antes** e grava o `categoryId`
 * direto — mas aqui o `set` das subcategorias torna o UPDATE aninhado de
 * qualquer forma, e portanto transacional. Não dá para evitar: `set` é o que
 * permite **desmarcar** o último chip, e é o único caminho para isso.
 */
export async function updateCompany(
  id: string,
  input: CompanyInput,
): Promise<Company> {
  const { categoryId, subcategoryIds } = await resolveTaxonomy(
    input.categorySlug,
    input.subcategorySlugs,
  );

  try {
    const row = await prisma.company.update({
      where: { id },
      data: {
        slug: buildSlug(input.name),
        name: input.name,
        categoryId,

        /**
         * `set`, não `connect`: este formulário é substituição, então o vínculo
         * que saiu da tela tem que sair do banco. Com `connect` um chip
         * desmarcado ficaria gravado para sempre, e a única forma de perceber
         * seria pelo filtro de subcategoria continuar achando a empresa.
         *
         * ⚠️ Trocar de categoria **precisa** limpar a seleção na tela. Se não
         * limpasse, `resolveTaxonomy` recusaria o envio inteiro — a subcategoria
         * antiga não pertence à categoria nova.
         */
        subcategories: { set: subcategoryIds.map((id) => ({ id })) },

        city: input.city,
        country: input.country,
        lat: input.lat,
        lng: input.lng,

        description: input.description ?? "",
        website: input.website ?? null,
        featuredProduct: input.featuredProduct ?? null,
        trackNews: input.trackNews,

        social: input.social ?? null,
        ceo: input.ceo ?? null,
        foundedYear: input.foundedYear ?? null,
        marketCap: input.marketCap ?? null,
      },
      include: COMPANY_INCLUDE,
    });

    return toCompany(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateCompanyError(input.name);
    }
    if (isRecordNotFound(error)) {
      throw new CompanyNotFoundError(id);
    }
    throw error;
  }
}

/**
 * Empresa que não está (mais) no banco. Erro **esperado**, não falha de
 * sistema: acontece de verdade quando o app está aberto em duas janelas, ou
 * quando a linha foi apagada pelo Prisma Studio com a tela ainda mostrando ela.
 */
export class CompanyNotFoundError extends Error {
  constructor(readonly companyId: string) {
    super(`Empresa ${companyId} não encontrada.`);
    this.name = "CompanyNotFoundError";
  }
}

/**
 * Altera só os campos de CRM (status, favorito, prioridade), e devolve o mesmo
 * DTO que a leitura produz.
 *
 * As chaves ausentes do `patch` chegam como `undefined`, e o Prisma trata
 * `undefined` como "não mexa nesta coluna" — é isso que permite um controle
 * mandar apenas o que ele mudou, sem reenviar os outros dois.
 *
 * Sem `connect` nenhum, então é um UPDATE simples: não abre transação, e
 * portanto não esbarra no `maxWait` que derrubava a criação quando o banco
 * estava longe (ver `banco-de-dados.md`).
 */
export async function updateCompanyCrm(
  id: string,
  patch: CompanyCrmInput,
): Promise<Company> {
  try {
    const row = await prisma.company.update({
      where: { id },
      data: patch,
      include: COMPANY_INCLUDE,
    });

    return toCompany(row);
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new CompanyNotFoundError(id);
    }
    throw error;
  }
}

/**
 * Apaga a empresa.
 *
 * ⚠️ **As relações dela vão junto**, por `onDelete: Cascade` nas duas pontas
 * (`schema.prisma:140,142`). Isso é o desenho certo no banco — sem cascade a FK
 * bloquearia o delete ou sobraria aresta apontando para o vazio —, mas é perda
 * de dado que o banco faz em silêncio. Quem precisa avisar é a tela, antes.
 */
export async function deleteCompany(id: string): Promise<void> {
  try {
    await prisma.company.delete({ where: { id } });
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new CompanyNotFoundError(id);
    }
    throw error;
  }
}

/**
 * `Company.slug` é @unique e obrigatório, e o formulário não o pede — ele
 * pede o nome. Derivar do nome é o único caminho.
 *
 * ⚠️ O caso que não é óbvio: `slugify` só preserva `a-z0-9`, então um nome sem
 * nenhum caractere latino ("比亚迪", escopo explícito do produto) devolve string
 * vazia. Um fallback fixo como "empresa" colidiria com o próximo nome nessa
 * situação e produziria "já existe" para duas empresas que não têm nada a ver
 * uma com a outra — mensagem errada para um problema diferente. O sufixo
 * aleatório fecha isso sem laço de repetição.
 */
function buildSlug(name: string): string {
  return slugify(name) || `empresa-${randomUUID().slice(0, 8)}`;
}

/**
 * A única constraint @unique de `Company` é o `slug`, então qualquer P2002
 * vindo daqui é colisão de nome normalizado.
 *
 * Deliberadamente **não** existe consulta prévia ("o slug está livre?"). Ela
 * não dispensaria este tratamento — entre consultar e inserir cabe outra
 * requisição — e custaria uma query no caminho feliz. O índice do Postgres é
 * atômico e é a autoridade final.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** P2025 — o `update`/`delete` não encontrou a linha do `where`. */
function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,

    categorySlug: row.category.slug,
    subcategorySlugs: row.subcategories.map((s) => s.slug),

    city: row.city,
    country: row.country,
    lat: row.lat,
    lng: row.lng,

    description: row.description,
    // Colunas nullable viram `undefined`: o tipo da UI usa opcional, e `null`
    // apareceria como "null" em qualquer render descuidado.
    website: row.website ?? undefined,
    social: row.social ?? undefined,
    foundedYear: row.foundedYear ?? undefined,

    marketCap: row.marketCap,
    ceo: row.ceo ?? undefined,
    featuredProduct: row.featuredProduct ?? undefined,
    trackNews: row.trackNews,

    status: row.status as CompanyStatus,
    favorite: row.favorite,
    priority: row.priority as Priority,

    addedAt: toDateString(row.addedAt),
    updatedAt: toDateString(row.updatedAt),
  };
}
