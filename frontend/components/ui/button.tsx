"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,color,border-color,filter,opacity] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 select-none",
  {
    variants: {
      variant: {
        accent:
          "bg-accent text-accent-contrast font-semibold hover:brightness-110 active:brightness-95",
        secondary:
          "border border-border bg-surface-raised text-primary hover:border-border-strong hover:bg-sunken",
        outline:
          "border border-border bg-transparent text-primary hover:bg-sunken hover:border-border-strong",
        ghost: "text-muted hover:bg-sunken hover:text-primary",
        /** Ação que destrói dado — apagar empresa, categoria. */
        danger:
          "border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25",
        /** O gatilho discreto de uma ação destrutiva (abre a confirmação). */
        "danger-ghost": "text-danger hover:bg-danger/10",
        link: "text-accent underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        default: "h-9 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
