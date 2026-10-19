"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A search field that updates ?q= as you type, a moment after you stop
 * (debounced), keeping the page's other filters.
 */
export function SearchBox({ placeholder, label }: { placeholder: string; label: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    if (value === (params.get("q") ?? "")) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      router.replace(`${path}?${next}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [value, params, path, router]);

  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border bg-card pl-9 pr-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
