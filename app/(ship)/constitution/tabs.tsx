import Link from "next/link";

/** Constitution's two halves: your own fitness (private to you) and the family's medical records. */
export function ConstitutionTabs({ current }: { current: "fitness" | "medical" }) {
  const tab = "rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground";
  return (
    <nav aria-label="Constitution" className="flex self-start rounded-lg border bg-card p-0.5">
      <Link href="/constitution" aria-current={current === "fitness" ? "page" : undefined} className={tab}>
        Fitness
      </Link>
      <Link href="/constitution/medical" aria-current={current === "medical" ? "page" : undefined} className={tab}>
        Medical
      </Link>
    </nav>
  );
}
