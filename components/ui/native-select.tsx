import * as React from "react";

import { cn } from "@/lib/utils";

/** A plain <select> styled like Input. Native, so phones show their own picker. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm [&>option]:bg-background",
        className,
      )}
      {...props}
    />
  );
}
