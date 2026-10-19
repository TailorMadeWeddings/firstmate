"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionIcons } from "@/lib/sections";

export type NavItem = { slug: string; name: string; href: string };

/**
 * The section links, as the mock-up's sidebar (icon over a small uppercase
 * label, a dot under the current one) or, on phones, a bottom tab bar.
 */
export function ShipNav({ items, layout }: { items: NavItem[]; layout: "sidebar" | "tabs" }) {
  const path = usePathname();
  const sidebar = layout === "sidebar";
  return (
    <nav
      aria-label="Sections"
      className={sidebar ? "flex flex-col gap-6" : "grid w-full"}
      style={sidebar ? undefined : { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const Icon = sectionIcons[item.slug] ?? CalendarDays;
        const current = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.slug}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`group flex flex-col items-center gap-1 rounded-lg transition-colors ${
              sidebar ? "w-24 py-1" : "py-2"
            } ${current ? "text-primary dark:text-blue-400" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon
              aria-hidden
              className={`size-6 transition-transform group-hover:scale-110 ${current ? "stroke-[2.5px]" : ""}`}
            />
            <span
              className={`max-w-full truncate font-semibold ${
                sidebar ? "text-[10px] uppercase tracking-wide" : "text-[10px]"
              }`}
            >
              {item.name}
            </span>
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${current ? "bg-primary dark:bg-blue-400" : "bg-transparent"}`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
