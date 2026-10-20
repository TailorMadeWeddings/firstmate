import type { Metadata } from "next";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { personKey } from "@/lib/medical";
import { currentVoyageMember } from "@/lib/players";
import { deleteStory, saveStory } from "../actions";
import { type Note, type Person, loadPeople, loadPhotos, loadStories } from "../data";
import { PhotoGrid, onDay } from "../parts";
import { PhotoAdder } from "../photo-adder";
import { StoryFields } from "./story-fields";

export const metadata: Metadata = { title: "Stories · Voyage · First Mate" };

type Props = { searchParams: Promise<{ person?: string }> };

export default function StoriesPage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Stories {...props} />
      </Suspense>
    </div>
  );
}

async function Stories({ searchParams }: Props) {
  const member = await currentVoyageMember();
  const { person } = await searchParams;
  const [{ people, crew }, stories] = await Promise.all([loadPeople(member.householdId), loadStories()]);
  const photos = await loadPhotos("note_id", stories.map((s) => s.id));
  const captain = member.role === "owner";
  const name = (id: string) => crew.find((c) => c.kind === "profile" && c.id === id)?.name ?? "Someone";

  return (
    <>
      <header className="flex flex-col gap-2">
        {captain && (
          <Link href="/voyage" className="text-sm text-muted-foreground hover:underline">
            ← Voyage
          </Link>
        )}
        <h1 className="text-4xl">Stories from the crew</h1>
        <p className="text-sm text-muted-foreground">
          {captain
            ? "Stories anyone in the crew has told about the family. They show in each person's book."
            : "Tell a story about one of the family: a memory, something funny, what their parent was like at their age. Only you and the Captains can see what you write."}
        </p>
      </header>

      <ActionForm action={saveStory.bind(null, null)} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <h2 className="font-serif text-2xl font-black">Tell a story</h2>
        <StoryFields people={people} values={{ person: people.some((p) => p.key === person) ? person : undefined }} />
        <Button size="lg" className="self-start">
          Save the story
        </Button>
      </ActionForm>

      <section aria-labelledby="told" className="flex flex-col gap-4">
        <h2 id="told" className="font-serif text-2xl font-black">
          {captain ? "All the stories" : "Your stories"}
        </h2>
        {stories.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {stories.map((s) => (
          <Story
            key={s.id}
            story={s}
            about={people.find((p) => p.key === personKey(s))}
            teller={name(s.created_by)}
            photos={photos.get(s.id) ?? []}
            mine={captain || s.created_by === member.id}
            canDelete={(p) => captain || p.created_by === member.id}
            householdId={member.householdId}
          />
        ))}
      </section>
    </>
  );
}

function Story({
  story,
  about,
  teller,
  photos,
  mine,
  canDelete,
  householdId,
}: {
  story: Note;
  about: Person | undefined;
  teller: string;
  photos: Parameters<typeof PhotoGrid>[0]["photos"];
  mine: boolean;
  canDelete: Parameters<typeof PhotoGrid>[0]["canDelete"];
  householdId: string;
}) {
  return (
    <article id={story.id} className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {about && <span className="size-2.5 rounded-full" style={{ background: about.color }} aria-hidden />}
            About {about?.name ?? "someone"} · told by {teller}
            {story.occurred_on && ` · ${onDay(story.occurred_on)}`}
          </p>
          {story.title && <h3 className="font-serif text-xl font-black">{story.title}</h3>}
        </div>
        {mine && (
          <div className="flex gap-1">
            <Button asChild size="sm" variant="ghost" aria-label="Edit story">
              <Link href={`/voyage/stories/${story.id}`}>
                <Pencil aria-hidden />
              </Link>
            </Button>
            <ActionForm action={deleteStory.bind(null, story.id)} confirm="Delete this story and its photos?">
              <Button size="sm" variant="ghost" aria-label="Delete story">
                <Trash2 aria-hidden />
              </Button>
            </ActionForm>
          </div>
        )}
      </header>
      <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{story.body}</p>
      <PhotoGrid photos={photos} canDelete={canDelete} />
      {mine && <PhotoAdder householdId={householdId} on={{ note_id: story.id }} />}
    </article>
  );
}
