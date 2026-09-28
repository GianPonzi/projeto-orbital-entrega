import {
  Activity,
  BatteryCharging,
  Beaker,
  Bot,
  Brain,
  Building2,
  Car,
  Code,
  Coins,
  Cpu,
  Database,
  Factory,
  Gem,
  Globe,
  GraduationCap,
  HeartPulse,
  Landmark,
  Leaf,
  Microscope,
  Package,
  Pill,
  Plane,
  Recycle,
  Rocket,
  Satellite,
  Server,
  Ship,
  ShoppingCart,
  Sprout,
  Stethoscope,
  Sun,
  Truck,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { IconKey } from "@/lib/taxonomy-options";
export interface Subcategory {
  id: string;
  label: string;
}

export interface CategoryMeta {
  id: string;
  label: string;
  /**
   * Chave do ícone no registry abaixo — **não** o componente, que não cabe numa
   * coluna do Postgres. Opcional porque a coluna é nullable: categoria sem
   * escolha feita cai no ícone genérico em vez de quebrar.
   */
  iconKey?: string;
  /**
   * Hex literal, aplicado inline: `color-mix(in oklab, …)` nos chips e badges,
   * e a expressão `match` das camadas WebGL do mapa.
   *
   * ⚠️ Hex inválido **não dá erro**: o `color-mix` ignora a declaração e o
   * MapLibre não avisa. Quem escreve esta cor tem que validá-la na entrada.
   */
  color: string;
  blurb?: string;
  subcategories: Subcategory[];
}

/**
 * Ícones continuam em código porque são **componentes React** — não cabem numa
 * coluna. O que foi para o banco é a **escolha** (`Category.iconKey`), e a lista
 * de escolhas válidas mora em `lib/taxonomy-options.ts`, que é puro.
 *
 * ⚠️ **O tipo `Record<IconKey, LucideIcon>` é a trava.** Acrescentar uma chave
 * lá sem o componente aqui (ou o contrário) quebra o build — sem ele, a
 * divergência viraria ícone genérico em silêncio, que é exatamente o modo de
 * falha que esta fatia existe para eliminar.
 */
const ICONS: Record<IconKey, LucideIcon> = {
  // Saúde e ciência
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  pill: Pill,
  microscope: Microscope,
  beaker: Beaker,
  activity: Activity,
  // Energia e meio ambiente
  zap: Zap,
  sun: Sun,
  wind: Wind,
  battery: BatteryCharging,
  leaf: Leaf,
  recycle: Recycle,
  sprout: Sprout,
  // Tecnologia
  cpu: Cpu,
  server: Server,
  database: Database,
  code: Code,
  satellite: Satellite,
  globe: Globe,
  brain: Brain,
  // Indústria e robótica
  bot: Bot,
  factory: Factory,
  wrench: Wrench,
  // Suprimento e logística
  package: Package,
  truck: Truck,
  ship: Ship,
  plane: Plane,
  cart: ShoppingCart,
  // Negócio e outros
  building: Building2,
  rocket: Rocket,
  car: Car,
  coins: Coins,
  gem: Gem,
  graduation: GraduationCap,
  landmark: Landmark,
};

const FALLBACK_ICON: LucideIcon = Building2;

/** Shown when a company references a category slug no longer in the taxonomy. */
const UNKNOWN_CATEGORY: CategoryMeta = {
  id: "__unknown__",
  label: "Sem categoria",
  color: "#8b98a9",
  subcategories: [],
};

/**
 * ⚠️ Recebe `iconKey`, **não** o slug da categoria. Chave ausente ou
 * desconhecida (registry encolheu, dado antigo) cai no genérico sem quebrar.
 */
export function getCategoryIcon(iconKey: string | undefined): LucideIcon {
  if (!iconKey) return FALLBACK_ICON;
  return (ICONS as Record<string, LucideIcon>)[iconKey] ?? FALLBACK_ICON;
}

// ── Índice sobre uma taxonomy recebida ──────────────────────────────────────

/**
 * Buscas sobre uma taxonomy **passada como argumento** — a que o servidor
 * entregou —, e não lida no carregamento do módulo.
 *
 * ── O contrato que isto estabelece ──
 * Chama-se `useTaxonomy()` **uma vez, no topo do componente**, e usa-se o objeto
 * devolvido dentro dos `.map()`. É o que dissolve a objeção "hook não pode ser
 * chamado em laço" que manteve a taxonomy em código — e é o mesmo padrão que
 * `CompanyDetailPanel` já usa para resolver a outra ponta de cada relação.
 *
 * A função é **pura**: recebe a lista, devolve o índice. Quem a memoiza é o
 * hook, não ela.
 */
export interface TaxonomyIndex {
  categories: CategoryMeta[];
  /** Sempre devolve algo — cai em `UNKNOWN_CATEGORY` para slug desconhecido. */
  getCategory: (slug: string) => CategoryMeta;
  getSubcategories: (
    categorySlug: string,
    subcategorySlugs: string[],
  ) => Subcategory[];
  /** Pares [slug, cor, …] para a expressão `match` do MapLibre. */
  colorPairs: string[];
}

export function buildTaxonomyIndex(categories: CategoryMeta[]): TaxonomyIndex {
  const bySlug = new Map(categories.map((c) => [c.id, c]));

  const getCategory = (slug: string): CategoryMeta =>
    bySlug.get(slug) ?? UNKNOWN_CATEGORY;

  return {
    categories,
    getCategory,
    getSubcategories: (categorySlug, subcategorySlugs) => {
      const cat = getCategory(categorySlug);
      return subcategorySlugs
        .map((sid) => cat.subcategories.find((s) => s.id === sid))
        .filter((s): s is Subcategory => s !== undefined);
    },
    colorPairs: categories.flatMap((c) => [c.id, c.color]),
  };
}
