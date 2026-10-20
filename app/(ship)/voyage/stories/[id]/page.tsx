import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { personKey } from "@/lib/medical";
import { currentVoyageMember } from "@/lib/players";
import { saveStory } from "../../actions";
import { loadPeople, loadStory } from "../../data";
import { StoryFields } from "../story-fields";

export const metadata: Metadata = { title: "Edit story · Voyage · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function EditStoryPage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <EditStory {...props} />
      </Suspense>
    </div>
  );
}

async function EditStory({ params }: Props) {
  const member = await currentVoyageMember();
  const { id } = await params;
  // Row-level security: an Officer only finds their own.
  const story = await loadStory(id);
  if (!story) notFound();
  const { people } = await loadPeople(member.householdId);
  return (
    <>
      <Link href="/voyage/stories" className="text-sm text-muted-foreground hover:underline">
        ← Stories
      </Link>
      <h1 className="text-3xl">Edit story</h1>
      <ActionForm action={saveStory.bind(null, story.id)} reset={false} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <StoryFields people={people} values={{ ...story, person: personKey(story) }} />
        <Button size="lg" className="self-start">
          Save
        </Button>
      </ActionForm>
    </>
  );
}
