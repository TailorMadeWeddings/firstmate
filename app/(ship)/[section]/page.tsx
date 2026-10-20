import { notFound } from "next/navigation";
import { sections } from "@/lib/sections";

const BUILT: string[] = ["ledger", "logbook", "galley", "duties"];

// Sections that aren't built yet. Each gets its own folder once it is;
// anything else is a 404 below.
export const generateStaticParams = () =>
  sections.filter((s) => !BUILT.includes(s.slug)).map((s) => ({ section: s.slug }));

export default async function Placeholder({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const s = sections.find((x) => x.slug === section);
  if (!s) notFound();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold">{s.name}</h1>
      <p className="text-muted-foreground">{s.blurb}</p>
      <p className="mt-6 text-sm text-muted-foreground">Not built yet.</p>
    </section>
  );
}
