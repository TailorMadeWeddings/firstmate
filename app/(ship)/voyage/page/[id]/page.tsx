import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { dayKey } from "@/lib/logbook";
import { type PersonKey, personKey } from "@/lib/medical";
import { currentVoyageCaptain } from "@/lib/players";
import { pageName, template } from "@/lib/voyage";
import { saveSection } from "../../actions";
import { homeOf, loadEntry, loadPeople, loadPhotos, loadSections } from "../../data";
import { PageView, PhotoGrid, area } from "../../parts";
import { PhotoAdder } from "../../photo-adder";

export const metadata: Metadata = { title: "Voyage · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function EntryPage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Read {...props} />
      </Suspense>
    </div>
  );
}

async function Read({ params }: Props) {
  const member = await currentVoyageCaptain();
  const { id } = await params;
  const entry = await loadEntry(id);
  if (!entry) notFound();
  const t = template(entry.template);
  const [{ people }, photos, sections] = await Promise.all([
    loadPeople(member.householdId),
    loadPhotos("entry_id", [entry.id]),
    t.family ? loadSections(entry.id) : Promise.resolve([]),
  ]);
  const home = homeOf(entry, people);
  const today = dayKey(new Date());

  return (
    <>
      <Link href={home.href} className="text-sm text-muted-foreground hover:underline">
        ← {home.label}
      </Link>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {t.repeat === "many" ? t.title : home.person ? `${home.person.name}'s book` : "The family"}
          </p>
          <h1 className="text-4xl">{pageName(entry.template, entry.period, entry.title)}</h1>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/voyage/page/${entry.id}/edit`}>
            <Pencil aria-hidden /> Edit
          </Link>
        </Button>
      </header>

      <PageView entry={entry} today={today} />

      <section aria-label="Photos" className="flex flex-col gap-3">
        <PhotoGrid photos={photos.get(entry.id) ?? []} canDelete={() => true} />
        <PhotoAdder householdId={member.householdId} on={{ entry_id: entry.id }} />
      </section>

      {t.each && (
        <section aria-labelledby="each" className="flex flex-col gap-4">
          <h2 id="each" className="font-serif text-2xl font-black">
            For each of us
          </h2>
          {people.map((p) => (
            <Section key={p.key} entryId={entry.id} person={p.key} prompt={t.each!.replaceAll("{name}", p.name)} color={p.color} body={sections.find((s) => personKey(s) === p.key)?.body ?? ""} />
          ))}
        </section>
      )}
    </>
  );
}

/** One person's part of a family page, written in place. */
function Section({ entryId, person, prompt, color, body }: { entryId: string; person: PersonKey; prompt: string; color: string; body: string }) {
  return (
    <ActionForm action={saveSection.bind(null, entryId, person)} reset={false} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <label htmlFor={`s-${person}`} className="flex items-center gap-2 font-medium">
        <span className="size-3 rounded-full" style={{ background: color }} aria-hidden />
        {prompt}
      </label>
      <textarea id={`s-${person}`} name="body" rows={3} defaultValue={body} className={area} />
      <Button size="sm" variant="secondary" className="self-start">
        Save
      </Button>
    </ActionForm>
  );
}
