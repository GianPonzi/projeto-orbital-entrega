/**
 * Company types and the shared matching rule — PURO, sem I/O.
 *
 * Este arquivo é importado dos dois lados da fronteira: Client Components o
 * usam para tipar e filtrar, e a camada de servidor o usa para saber que forma
 * produzir. Por isso ele não pode ganhar nenhum import que fale com o banco —
 * `"use client"` contamina a cadeia de imports para baixo, e o `pg` acabaria
 * no bundle do navegador.
 *
 * ── Onde o dado vive ──────────────────────────────────────────────────────
 * No Postgres. A leitura acontece em `lib/companies.server.ts` (marcado com
 * `server-only`), é feita pelo Server Component em `app/page.tsx` e chega à
 * árvore cliente via `lib/data-context.tsx`.
 *
 * `filterCompanies` é a regra de correspondência compartilhada pela lista e
 * pelo mapa, e continua rodando 100% no cliente: o dataset é pequeno e mandar
 * cada clique de chip ao banco destruiria a instantaneidade do mapa.
 */

import { daysBetween } from "@/lib/dates";
import { normalize } from "@/lib/text";

/**
 * Janela de "capturada nesta semana": o pulso no pin, o grupo do topo do
 * índice e da galeria. Um número só, para os três lugares concordarem.
 */
export const RECENT_CAPTURE_DAYS = 7;

/** A empresa foi capturada dentro da janela recente? `today` vem de `todayString()`. */
export function isRecentCapture(company: Company, today: string): boolean {
  return daysBetween(company.addedAt, today) < RECENT_CAPTURE_DAYS;
}

/** Lifecycle of a company in the dashboard (incl. supplier pipeline). */
export type CompanyStatus = "interesse" | "avaliando" | "ativa" | "arquivada";

/** 0 = normal · 1 = alta · 2 = máxima. Drives emphasis on map and list. */
export type Priority = 0 | 1 | 2;

export interface Company {
  /** cuid do banco. Opaco de propósito — não é o que casa com a taxonomy. */
  id: string;
  /**
   * Id legível ("amd"). O servidor sempre produz — é `@unique` e obrigatório no
   * schema. Continua opcional aqui porque a entrada otimista, que aparece no
   * mapa antes de passar pelo servidor, não tem como saber qual slug o servidor
   * vai derivar (ele pode ganhar sufixo, ou ser recusado por já existir).
   */
  slug?: string;
  name: string;

  // ── Categorização (referências à taxonomy) ──
  /**
   * Slugs, não ids de banco: casam com `Category.slug` / `Subcategory.slug`.
   * O nome diz `Slug` de propósito — passar isto para um `where: { id }` do
   * Prisma não acha nada, e o nome do campo é o que impede o engano.
   */
  categorySlug: string;
  subcategorySlugs: string[];

  // ── Localização (cidade/país aprox.) ──
  city: string;
  country: string;
  lat: number;
  lng: number;

  // ── Conteúdo ──
  description: string;
  website?: string;
  social?: string;
  foundedYear?: number;

  // ── Empresas de maior porte (opcionais) ──
  marketCap?: number | null;
  ceo?: string;

  /** Produto específico que torna a empresa interessante (texto livre). */
  featuredProduct?: string;
  /** Marca a empresa para acompanhamento de notícias (grandes empresas). */
  trackNews?: boolean;

  // ── CRM ──
  status: CompanyStatus;
  favorite: boolean;
  priority: Priority;

  // ── Metadados ──
  addedAt: string;
  updatedAt: string;
}

export interface CompanyFilter {
  query?: string;
  /**
   * Slugs de categoria **desligadas**. Conjunto vazio = todas passam.
   *
   * ⚠️ Semântica de **exclusão**, ao contrário de `statuses` logo abaixo, que é
   * allowlist. A assimetria é deliberada e tem uma razão só: a lista de
   * categorias é dinâmica (vem do banco e o usuário edita), a de status é fixa
   * (enum do Prisma).
   *
   * Com allowlist, o estado inicial precisaria conhecer todas as categorias no
   * carregamento do módulo — e uma categoria criada depois nasceria **fora** do
   * conjunto, invisível no mapa até alguém clicar nela. Por exclusão, o estado
   * inicial é o conjunto vazio, que não depende de conhecer nada.
   */
  excludedCategories?: ReadonlySet<string> | string[];
  /**
   * Selected subcategories as composite `categorySlug:subcategorySlug` keys
   * (subcategory slugs are NOT globally unique). A company passes when its
   * category has no selected subcategory, OR it carries one of the selected.
   */
  subcategories?: ReadonlySet<string> | string[];
  /** Active statuses. When provided, a company must match one of them. */
  statuses?: ReadonlySet<CompanyStatus> | CompanyStatus[];
  /** When true, only favorites pass. */
  favoriteOnly?: boolean;
}

function toSet<T>(value: ReadonlySet<T> | T[] | undefined): ReadonlySet<T> | null {
  if (value === undefined) return null;
  return value instanceof Set ? value : new Set(value as T[]);
}

/**
 * Pure, shared matching rule used by the index, the gallery and the map.
 * A company matches when its category is active AND it satisfies the query
 * (by name, city or country, accent-insensitive).
 */
export function filterCompanies(
  companies: Company[],
  {
    query,
    excludedCategories,
    subcategories,
    statuses,
    favoriteOnly,
  }: CompanyFilter,
): Company[] {
  const excludedCats = toSet(excludedCategories);
  const activeSubs = toSet(subcategories);
  const activeStatuses = toSet(statuses);
  const q = normalize(query ?? "");

  return companies.filter((company) => {
    // Exclusão (ver o comentário em CompanyFilter): ausente da lista = passa.
    if (excludedCats?.has(company.categorySlug)) return false;
    if (activeStatuses && !activeStatuses.has(company.status)) return false;
    if (favoriteOnly && !company.favorite) return false;

    // Subcategory refine, scoped to the company's own category. Selected subs
    // of OTHER categories don't affect this company.
    if (activeSubs && activeSubs.size > 0) {
      const prefix = `${company.categorySlug}:`;
      let categoryHasSelection = false;
      for (const key of activeSubs) {
        if (key.startsWith(prefix)) {
          categoryHasSelection = true;
          break;
        }
      }
      if (categoryHasSelection) {
        const hit = company.subcategorySlugs.some((sid) =>
          activeSubs.has(`${prefix}${sid}`),
        );
        if (!hit) return false;
      }
    }

    if (!q) return true;
    const haystack = normalize(
      `${company.name} ${company.city} ${company.country}`,
    );
    return haystack.includes(q);
  });
}

