import { cn } from "@/lib/utils";
import { monogram } from "@/lib/text";

/**
 * O logo da empresa — por enquanto, sempre o monograma tingido pela categoria.
 *
 * ⚠️ **Quando o upload de logo existir, é aqui que ele entra**, e em nenhum
 * outro lugar: índice, galeria e detalhe usam este componente, e o monograma
 * continua sendo o fallback de quem não tiver imagem.
 *
 * Recebe a **cor pronta**, não o slug da categoria. Quem usa já tem o índice
 * da taxonomy em mãos (`useTaxonomy()` no topo do componente); resolver aqui
 * dentro faria cada linha da lista montar o próprio índice.
 */

const SIZES = {
  sm: "size-8 rounded-md text-[11px]",
  lg: "size-[52px] rounded-lg text-[15px]",
  xl: "size-[60px] rounded-[10px] text-[17px]",
} as const;

export function CompanyLogo({
  name,
  color,
  size = "sm",
  className,
}: {
  name: string;
  color: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-bold tracking-[0.02em] [font-stretch:112%]",
        SIZES[size],
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 17%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent)`,
        color: `color-mix(in oklab, ${color} var(--cat-strength), var(--ink))`,
      }}
    >
      {monogram(name)}
    </span>
  );
}
