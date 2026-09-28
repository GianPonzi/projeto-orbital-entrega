import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight scroll container with the app's quiet themed scrollbars
 * (see `.scrollarea` in globals.css). No extra dependency required.
 */
function ScrollArea({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("scrollarea overflow-y-auto overflow-x-hidden", className)}
      {...props}
    />
  );
}

export { ScrollArea };
