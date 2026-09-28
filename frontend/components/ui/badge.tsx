/**
 * ⚠️ `"use client"` explícito, e não por acaso: `CategoryBadge` lê a taxonomy do
 * React Context, o que torna este arquivo cliente-only. Antes ele era
 * isomórfico e funcionava em RSC. Depender de "hoje só quem usa é client
 * component" seria uma restrição não escrita num diretório de primitivos.
 */
"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useTaxonomy } from "@/lib/data-context";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-sunken text-muted",
        accent: "border-accent/30 bg-accent/10 text-accent",
        outline: "border-border text-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A category badge: a colored dot + label, tinted by the category color. */
function CategoryBadge({
  categorySlug,
  className,
  withDot = true,
}: {
  categorySlug: string;
  className?: string;
  withDot?: boolean;
}) {
  const meta = useTaxonomy().getCategory(categorySlug);
  return (
    <span
      data-slot="category-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        color: meta.color,
        borderColor: `color-mix(in oklab, ${meta.color} 30%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
      }}
    >
      {withDot && (
        <span
          aria-hidden
          className="size-1.5 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
      )}
      {meta.label}
    </span>
  );
}

export { Badge, CategoryBadge, badgeVariants };
