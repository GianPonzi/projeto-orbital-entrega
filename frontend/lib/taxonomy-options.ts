/**
 * Os valores que uma categoria pode assumir em cor e ícone — PURO, sem nenhum
 * import.
 *
 * ── Por que não vive em `lib/categories.ts` ──
 * Porque `lib/taxonomy-schema.ts` precisa validar contra estas listas, e aquele
 * arquivo importa `lucide-react`. `lib/company-schema.ts` já pagou esse preço
 * uma vez: enquanto importava `lib/categories.ts`, arrastava a biblioteca
 * inteira de ícones para todo bundle que tocasse o schema. Separar as **listas**
 * dos **componentes** resolve na origem.
 *
 * A ligação entre as duas metades é verificada em tempo de compilação: o
 * registry em `lib/categories.ts` é tipado como `Record<IconKey, LucideIcon>`,
 * então acrescentar uma chave aqui sem o ícone correspondente (ou o contrário)
 * quebra o build em vez de virar ícone genérico em silêncio.
 */

/**
 * Chaves de ícone, na ordem em que o seletor as exibe.
 *
 * ⚠️ **Descrevem o desenho, não o assunto** (`heart-pulse`, não `saude`). Antes
 * o ícone era chaveado pelo slug da categoria, o que só funcionava para as cinco
 * semeadas — qualquer categoria nova caía calada no genérico.
 *
 * ⚠️ **Chave publicada nunca deve ser renomeada**: ela está gravada em linhas do
 * Postgres, e renomear devolve as categorias afetadas ao ícone genérico sem erro
 * nenhum. Acrescentar é sempre seguro.
 */
export const ICON_KEYS = [
  // Saúde e ciência
  "heart-pulse",
  "stethoscope",
  "pill",
  "microscope",
  "beaker",
  "activity",
  // Energia e meio ambiente
  "zap",
  "sun",
  "wind",
  "battery",
  "leaf",
  "recycle",
  "sprout",
  // Tecnologia
  "cpu",
  "server",
  "database",
  "code",
  "satellite",
  "globe",
  "brain",
  // Indústria e robótica
  "bot",
  "factory",
  "wrench",
  // Suprimento e logística
  "package",
  "truck",
  "ship",
  "plane",
  "cart",
  // Negócio e outros
  "building",
  "rocket",
  "car",
  "coins",
  "gem",
  "graduation",
  "landmark",
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

/**
 * Paleta fechada de cores de categoria.
 *
 * ⚠️ **Não é preferência estética, é a única validação possível.** Hex inválido
 * não dá erro em lugar nenhum: o `color-mix` descarta a declaração e o MapLibre
 * não avisa — o pin some do mapa em silêncio. Campo livre exigiria validar o
 * formato **e** garantir contraste sobre o mapa escuro; a paleta resolve os dois
 * de uma vez.
 *
 * As cinco primeiras são as das categorias semeadas, para uma edição que não
 * mexe na cor reencontrar exatamente a que já estava lá.
 */
export const CATEGORY_SWATCHES = [
  "#34d399", // saúde
  "#fbbf24", // energia
  "#38bdf8", // tecnologia
  "#a78bfa", // robótica
  "#f59e0b", // fornecedores
  "#f87171",
  "#fb7185",
  "#e879f9",
  "#818cf8",
  "#22d3ee",
  "#2dd4bf",
  "#a3e635",
  "#facc15",
  "#fb923c",
  "#94a3b8",
] as const;

export type CategorySwatch = (typeof CATEGORY_SWATCHES)[number];
