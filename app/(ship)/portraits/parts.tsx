// Pieces shared by the Portraits pages.
import Link from "next/link";

/** A small rounded link: a person, a word, an album. */
export function Pill({ href, children, color }: { href: string; children: React.ReactNode; color?: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium hover:bg-muted">
      {color && <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </Link>
  );
}
