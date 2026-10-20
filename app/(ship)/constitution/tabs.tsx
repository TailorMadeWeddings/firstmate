import Link from "next/link";

/** Constitution's parts: your body measurements (Captains), exercise, and medical records. */
export function ConstitutionTabs({ current, fitness = true }: { current: "fitness" | "exercise" | "medical"; fitness?: boolean }) {
  const tab = "rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground";
  const link = (href: string, key: typeof current, label: string) => (
    <Link href={href} aria-current={current === key ? "page" : undefined} className={tab}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Constitution" className="flex self-start rounded-lg border bg-card p-0.5">
      {fitness && link("/constitution", "fitness", "Fitness")}
      {link("/constitution/exercise", "exercise", "Exercise")}
      {link("/constitution/medical", "medical", "Medical")}
    </nav>
  );
}
