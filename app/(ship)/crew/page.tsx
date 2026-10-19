import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { textOn } from "@/lib/logbook";
import { addChild, updateCrew } from "../logbook/actions";
import { type CrewMember, currentCrew, loadCrew } from "../logbook/data";

export const metadata: Metadata = { title: "Crew · First Mate" };

export default function CrewPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Crew />
    </Suspense>
  );
}

async function Crew() {
  const member = await currentCrew();
  const crew = await loadCrew(member.householdId);
  const captain = member.role === "owner";
  // Captains tidy up anyone; everyone else just themselves.
  const canEdit = (c: CrewMember) => captain || (c.kind === "profile" && c.id === member.id);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/logbook" className="text-sm text-muted-foreground hover:underline">
          ← Logbook
        </Link>
        <h1 className="text-4xl">Crew</h1>
        <p className="text-sm text-muted-foreground">
          Names and colours show on the Logbook. Each person&apos;s colour marks their events on The Helm.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {crew.map((c) => (
          <li key={c.key} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-full font-serif text-xl font-black italic"
              style={{ background: c.color, color: textOn(c.color) }}
              aria-hidden
            >
              {c.name.slice(0, 1).toUpperCase()}
            </span>
            {canEdit(c) ? (
              <ActionForm action={updateCrew.bind(null, c.kind, c.id)} reset={false} className="flex flex-1 flex-wrap items-end gap-3">
                <div className="grid min-w-40 flex-1 gap-1">
                  <Label htmlFor={`name-${c.key}`}>{c.label}</Label>
                  <Input id={`name-${c.key}`} name="name" defaultValue={c.name} required />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`colour-${c.key}`}>Colour</Label>
                  <Input id={`colour-${c.key}`} name="color" type="color" defaultValue={c.color} className="h-9 w-16 p-1" />
                </div>
                <Button variant="secondary">Save</Button>
              </ActionForm>
            ) : (
              <div className="flex flex-col">
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm text-muted-foreground">{c.label}</span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {captain && (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Add a child</h2>
          <p className="text-sm text-muted-foreground">
            Children don&apos;t log in; they&apos;re here so events can be theirs.
          </p>
          <ActionForm action={addChild} className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-40 flex-1 gap-1">
              <Label htmlFor="child-name">Name</Label>
              <Input id="child-name" name="name" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="child-born">Birthday (optional)</Label>
              <Input id="child-born" name="date_of_birth" type="date" />
            </div>
            <Button>Add</Button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
