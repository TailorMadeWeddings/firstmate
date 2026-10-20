"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { formatMedicare, maskMedicare } from "@/lib/medical";

/** A Medicare number, mostly hidden until someone asks to see it. */
export function Medicare({ number, irn, expiry }: { number: string; irn: string | null; expiry: string | null }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-base tracking-wider">{shown ? formatMedicare(number) : maskMedicare(number)}</span>
      {irn && <span className="text-sm text-muted-foreground">Ref {irn}</span>}
      {expiry && <span className="text-sm text-muted-foreground">Expires {expiry}</span>}
      <button
        type="button"
        onClick={() => setShown(!shown)}
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-primary hover:bg-muted dark:text-blue-400"
      >
        {shown ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />} {shown ? "Hide" : "Show number"}
      </button>
    </span>
  );
}
