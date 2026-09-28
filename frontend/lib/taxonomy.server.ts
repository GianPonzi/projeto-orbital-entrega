/**
 * Leitura da taxonomy no Postgres — camada de SERVIDOR.
 *
 * Ver `lib/companies.server.ts` para o porquê do `import "server-only"`.
 *
 * ── Por que isto existe ──
 * `data/taxonomy.json` é import **estático**: o bundler cola o conteúdo no
 * build, e o app rodando nunca volta ao disco. Enquanto a taxonomy for lida de
 * lá, editá-la pela interface é impossível — o app não veria a mudança, e em
 * produção o filesystem é read-only de qualquer forma.
 *
 * `data/taxonomy.json` deixou de ser lido pelo app — sobrou como fixture do
 * `prisma/seed.ts`, que roda fora do Next.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { CategoryMeta } from "@/lib/categories";
import type {
  CategoryInput,
  MoveDirection,
  SubcategoryInput,
} from "@/lib/taxonomy-schema";
import { slugify } from "@/lib/text";

export async function getTaxonomy(): Promise<CategoryMeta[]> {
  const rows = await prisma.category.findMany({
    // `sortOrder` nos dois níveis: o Postgres não garante ordem de linhas, e
    // esta é a ordem de exibição nos filtros e no formulário.
    orderBy: { sortOrder: "asc" },
    include: {
      subcategories: {
        orderBy: { sortOrder: "asc" },
        select: { slug: true, label: true },
      },
    },
  });

  return rows.map((row) => ({
    // ⚠️ `id` aqui é o **slug**, não o cuid da linha — é o que casa com
    // `Company.categorySlug` e com as chaves compostas `categoria:sub` dos
    // filtros. O cuid não atravessa esta fronteira: se atravessasse, a UI
    // exibiria "Sem categoria" (regra dura nº 2).
    id: row.slug,
    label: row.label,
    color: row.color,
    blurb: row.blurb,
    // Coluna nullable vira `undefined`: `getCategoryIcon` já trata a ausência.
    iconKey: row.iconKey ?? undefined,
    subcategories: row.subcategories.map((sub) => ({
      id: sub.slug,
      label: sub.label,
    })),
  }));
}

// ── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Nome que colide com uma categoria já existente depois de normalizado
 * ("Robótica" com "robotica" cadastrada), ou subcategoria repetida **dentro da
 * mesma categoria**.
 *
 * Como em `Company`, a autoridade é o índice `@unique` do Postgres: tentamos
 * gravar e traduzimos o P2002. Consultar antes não dispensaria o tratamento
 * (entre consultar e inserir cabe outra requisição) e custaria uma query no
 * caminho feliz.
 */
export class DuplicateTaxonomyError extends Error {
  constructor(readonly label: string) {
    super(`Já existe algo chamado "${label}" aqui.`);
    this.name = "DuplicateTaxonomyError";
  }
}

/** Categoria ou subcategoria que não está (mais) no banco. */
export class TaxonomyNotFoundError extends Error {
  constructor(readonly slug: string) {
    super(`"${slug}" não existe.`);
    this.name = "TaxonomyNotFoundError";
  }
}

/**
 * Categoria que ainda tem empresas.
 *
 * ⚠️ `Company.category` é `onDelete: Restrict`, então o banco **recusa** o
 * delete com um P2003. A UI desabilita o botão antes disso, contando as
 * empresas no cliente — mas a action é um endpoint público, e alguém chamando
 * direto merece a mensagem certa em vez do erro cru do Postgres.
 */
export class CategoryInUseError extends Error {
  constructor(readonly categorySlug: string) {
    super(`A categoria "${categorySlug}" ainda tem empresas.`);
    this.name = "CategoryInUseError";
  }
}

/**
 * Slug derivado do label, com o mesmo fallback de `Company`.
 *
 * ⚠️ Um label sem caractere latino ("机器人") normaliza para string vazia. Sem o
 * sufixo aleatório, a primeira categoria nessa situação ficaria com slug vazio e
 * a segunda receberia "já existe" — mensagem errada para um problema diferente.
 */
function buildSlug(label: string, prefix: string): string {
  return slugify(label) || `${prefix}-${randomUUID().slice(0, 8)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

/** P2003 — violação de foreign key, que aqui só pode ser o `Restrict`. */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

/** Traduz slug de categoria em cuid, ou lança. */
async function categoryIdBySlug(slug: string): Promise<string> {
  const row = await prisma.category.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!row) throw new TaxonomyNotFoundError(slug);
  return row.id;
}

// ── Categoria ───────────────────────────────────────────────────────────────

/**
 * A categoria nova entra **no fim** da lista.
 *
 * `max(sortOrder) + 1` em vez de `count()`: os dois divergem assim que houver
 * qualquer buraco na numeração, e um empate de `sortOrder` produz ordem
 * indefinida — o Postgres não promete estabilidade entre consultas, então a
 * lista trocaria de ordem sozinha entre dois reloads.
 */
export async function createCategory(input: CategoryInput): Promise<void> {
  const last = await prisma.category.aggregate({ _max: { sortOrder: true } });

  try {
    await prisma.category.create({
      data: {
        slug: buildSlug(input.label, "categoria"),
        label: input.label,
        color: input.color,
        iconKey: input.iconKey,
        blurb: input.blurb,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateTaxonomyError(input.label);
    throw error;
  }
}

/**
 * Renomear, recolorir, trocar ícone e descrição. **O slug não muda.**
 *
 * ⚠️ É o oposto da empresa, onde o slug acompanha o nome, e a diferença é
 * concreta: nada aponta para o slug de uma empresa (a identidade é o cuid), mas
 * o **estado de filtro do cliente** aponta para o slug de categoria —
 * `excludedCategories` guarda slugs e `activeSubcategories` guarda chaves
 * compostas `categoria:sub`. Regerar deixaria entradas órfãs nesses conjuntos:
 * a categoria voltaria a aparecer no mapa com o chip ainda com cara de
 * desligado, e "Mostrar todas" ficaria visível para sempre sem efeito. Nada
 * disso dá erro.
 *
 * Custo aceito: depois de um rename, slug e label podem divergir.
 */
export async function updateCategory(
  slug: string,
  input: CategoryInput,
): Promise<void> {
  /**
   * ⚠️ **Rename precisa desta consulta porque o slug é congelado.**
   *
   * Na empresa, renomear regera o slug e uma colisão cai no P2002 do índice —
   * o banco é a autoridade e não há consulta prévia. Aqui o slug **não** muda,
   * então nenhum índice é violado e o Postgres aceita duas categorias com o
   * mesmo label. O resultado seriam duas linhas idênticas nos filtros, sem nada
   * que as distinga: a interface mentindo em silêncio, de novo.
   *
   * A corrida (duas renomeações simultâneas para o mesmo nome) fica em aberto e
   * é aceitável: o app é single-user, e o pior caso é o nome repetido que esta
   * checagem existe para evitar — não corrupção de dado.
   */
  const clash = await prisma.category.findFirst({
    where: {
      label: { equals: input.label, mode: "insensitive" },
      slug: { not: slug },
    },
    select: { id: true },
  });
  if (clash) throw new DuplicateTaxonomyError(input.label);

  try {
    await prisma.category.update({
      where: { slug },
      data: {
        label: input.label,
        color: input.color,
        iconKey: input.iconKey,
        blurb: input.blurb,
      },
    });
  } catch (error) {
    if (isRecordNotFound(error)) throw new TaxonomyNotFoundError(slug);
    throw error;
  }
}

/**
 * Apaga a categoria.
 *
 * ⚠️ Ao contrário de apagar empresa, **uma categoria que já sumiu é erro aqui**.
 * Lá o silêncio era certo porque o desfecho pedido já valia; aqui a operação
 * quase sempre chega junto de outras (o diálogo lista contagens), e "sumiu
 * sozinha" é informação que o usuário precisa para entender a tela.
 */
export async function deleteCategory(slug: string): Promise<void> {
  try {
    await prisma.category.delete({ where: { slug } });
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new CategoryInUseError(slug);
    if (isRecordNotFound(error)) throw new TaxonomyNotFoundError(slug);
    throw error;
  }
}

/**
 * Troca a categoria de lugar com a vizinha.
 *
 * ── Renumera a lista inteira em vez de trocar dois valores ──
 * Trocar `sortOrder` entre dois vizinhos falha em silêncio quando eles têm o
 * **mesmo** valor — e ter é plausível: a coluna tem `@default(0)`, então
 * qualquer linha criada fora deste código (Prisma Studio, `psql`) nasce com
 * zero. Reescrever 0..n-1 conserta a numeração de quebra, toda vez.
 *
 * A transação existe porque são n UPDATEs que só fazem sentido juntos: metade
 * aplicada é uma ordem que nunca foi pedida.
 */
export async function moveCategory(
  slug: string,
  direction: MoveDirection,
): Promise<void> {
  const rows = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true },
  });

  const from = rows.findIndex((row) => row.slug === slug);
  if (from === -1) throw new TaxonomyNotFoundError(slug);

  const to = direction === "up" ? from - 1 : from + 1;
  // Já está na ponta: não é erro, é um clique sem efeito.
  if (to < 0 || to >= rows.length) return;

  const reordered = [...rows];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];

  await prisma.$transaction(
    reordered.map((row, index) =>
      prisma.category.update({
        where: { id: row.id },
        data: { sortOrder: index },
      }),
    ),
  );
}

// ── Subcategoria ────────────────────────────────────────────────────────────

export async function createSubcategory(
  categorySlug: string,
  input: SubcategoryInput,
): Promise<void> {
  const categoryId = await categoryIdBySlug(categorySlug);
  const last = await prisma.subcategory.aggregate({
    where: { categoryId },
    _max: { sortOrder: true },
  });

  try {
    await prisma.subcategory.create({
      data: {
        categoryId,
        slug: buildSlug(input.label, "sub"),
        label: input.label,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateTaxonomyError(input.label);
    throw error;
  }
}

/**
 * Só o label. O slug de subcategoria é imutável **pelo mesmo motivo** que o de
 * categoria, e com um agravante: `activeSubcategories` guarda a chave composta
 * `categoria:sub`, então renomear o slug deixaria a entrada do filtro órfã sem
 * que nada na tela indique isso.
 */
export async function updateSubcategory(
  categorySlug: string,
  slug: string,
  input: SubcategoryInput,
): Promise<void> {
  const categoryId = await categoryIdBySlug(categorySlug);

  // Mesmo motivo do `updateCategory`: slug congelado significa que o índice
  // `@@unique([categoryId, slug])` não é violado por um label repetido.
  const clash = await prisma.subcategory.findFirst({
    where: {
      categoryId,
      label: { equals: input.label, mode: "insensitive" },
      slug: { not: slug },
    },
    select: { id: true },
  });
  if (clash) throw new DuplicateTaxonomyError(input.label);

  try {
    await prisma.subcategory.update({
      where: { categoryId_slug: { categoryId, slug } },
      data: { label: input.label },
    });
  } catch (error) {
    if (isRecordNotFound(error)) throw new TaxonomyNotFoundError(slug);
    throw error;
  }
}

/**
 * Apaga a subcategoria.
 *
 * ⚠️ **Isso desassocia de todas as empresas que a carregavam**, pelo `Cascade`
 * da m2m — e o Postgres faz isso em silêncio, sem erro e sem contagem. Nenhuma
 * camada abaixo da interface tem como avisar; quem avisa é a confirmação,
 * antes, com o número de empresas afetadas. Mesmo desenho do
 * `DeleteCompanyDialog`, que já conta relações.
 */
export async function deleteSubcategory(
  categorySlug: string,
  slug: string,
): Promise<void> {
  const categoryId = await categoryIdBySlug(categorySlug);

  try {
    await prisma.subcategory.delete({
      where: { categoryId_slug: { categoryId, slug } },
    });
  } catch (error) {
    if (isRecordNotFound(error)) throw new TaxonomyNotFoundError(slug);
    throw error;
  }
}

/** Mesma renumeração de `moveCategory`, escopada a uma categoria. */
export async function moveSubcategory(
  categorySlug: string,
  slug: string,
  direction: MoveDirection,
): Promise<void> {
  const categoryId = await categoryIdBySlug(categorySlug);
  const rows = await prisma.subcategory.findMany({
    where: { categoryId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true },
  });

  const from = rows.findIndex((row) => row.slug === slug);
  if (from === -1) throw new TaxonomyNotFoundError(slug);

  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length) return;

  const reordered = [...rows];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];

  await prisma.$transaction(
    reordered.map((row, index) =>
      prisma.subcategory.update({
        where: { id: row.id },
        data: { sortOrder: index },
      }),
    ),
  );
}
