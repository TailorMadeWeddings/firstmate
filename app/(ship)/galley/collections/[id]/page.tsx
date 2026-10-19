import type { Metadata } from "next";
import { Plus, Share2, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findRecipes } from "@/lib/galley";
import { currentMember } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { deleteCollection, renameCollection, shareCollection, unshareCollection } from "../../actions";
import { accessTo, loadCollections, loadRecipeCards } from "../../data";
import { RecipeList } from "../../recipe-list";

export const metadata: Metadata = { title: "Collection · Galley · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function CollectionPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <CollectionView params={params} />
    </Suspense>
  );
}

const PERMISSION = { read: "Can look", contribute: "Can add recipes" } as const;
const ROLE = { trusted: "Officer", guest: "Visitor" } as const;

async function CollectionView({ params }: Props) {
  const member = await currentMember();
  const { id } = await params;
  const [collections, cards] = await Promise.all([loadCollections(), loadRecipeCards()]);
  const collection = collections.find((c) => c.id === id);
  if (!collection) notFound();
  const access = accessTo(collection, member);
  const recipes = findRecipes(cards, { collection: id, sort: "az" });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/galley" className="text-sm text-muted-foreground hover:underline">
        ← Galley
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Collection</p>
          <h1 className="text-4xl">{collection.name}</h1>
          <p className="text-sm text-muted-foreground">
            {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
            {access !== "owner" && collection.shares.some((s) => s.profile_id === member.id) && (
              <> · shared with you ({access === "contribute" ? "you can add recipes" : "to look at"})</>
            )}
          </p>
        </div>
        {access !== "read" && (
          <Button asChild>
            <Link href={`/galley/new?collection=${id}`}>
              <Plus aria-hidden /> New recipe here
            </Link>
          </Button>
        )}
      </header>

      {access === "owner" && <Sharing collectionId={id} shares={collection.shares} householdId={collection.household_id} />}

      {recipes.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          Nothing in here yet.{" "}
          {access !== "read" && "Add recipes from a recipe's page, or start a new one here."}
        </p>
      ) : (
        <RecipeList recipes={recipes} layout="grid" />
      )}

      {access === "owner" && (
        <details className="rounded-2xl border bg-card p-5">
          <summary className="cursor-pointer font-semibold">Rename or delete</summary>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <ActionForm action={renameCollection.bind(null, id)} reset={false} className="flex flex-wrap gap-2">
              <Input name="name" defaultValue={collection.name} aria-label="Collection name" required className="w-56" />
              <Button variant="secondary">Rename</Button>
            </ActionForm>
            <ActionForm action={deleteCollection.bind(null, id)} confirm={`Delete the ${collection.name} collection? The recipes stay in the Galley.`}>
              <Button variant="outline" className="text-red-600">
                Delete collection
              </Button>
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}

/** Captains share with Officers and Visitors, to look at or to add to; removing a share takes effect at once. */
async function Sharing({ collectionId, shares, householdId }: { collectionId: string; shares: { profile_id: string; permission: "read" | "contribute" }[]; householdId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("household_members")
    .select("profile_id, role, profiles(display_name)")
    .eq("household_id", householdId)
    .neq("role", "owner")
    .order("joined_at");
  const people = ((data ?? []) as unknown as { profile_id: string; role: keyof typeof ROLE; profiles: { display_name: string } | null }[]).map((m) => ({
    id: m.profile_id,
    name: m.profiles?.display_name ?? "Crew",
    role: ROLE[m.role],
  }));
  const unshared = people.filter((p) => !shares.some((s) => s.profile_id === p.id));
  const select = "h-9 rounded-md border bg-background px-2 text-sm";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5" aria-labelledby="sharing">
      <h2 id="sharing" className="flex items-center gap-2 font-semibold">
        <Share2 className="size-4" aria-hidden /> Shared with
      </h2>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">There&apos;s no one else in the household to share with yet. Captains see every collection already.</p>
      ) : (
        <>
          {shares.length === 0 && <p className="text-sm text-muted-foreground">Only Captains and Officers can see this for now.</p>}
          <ul className="flex flex-col divide-y">
            {shares.map((s) => {
              const who = people.find((p) => p.id === s.profile_id);
              return (
                <li key={s.profile_id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{who?.name ?? "Someone"}</span>{" "}
                    <span className="text-xs text-muted-foreground">{who?.role}</span>
                  </span>
                  <ActionForm action={shareCollection.bind(null, collectionId)} reset={false} className="flex items-center gap-2">
                    <input type="hidden" name="profile" value={s.profile_id} />
                    <select name="permission" defaultValue={s.permission} aria-label={`What ${who?.name ?? "they"} can do`} className={select}>
                      {Object.entries(PERMISSION).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="secondary">
                      Change
                    </Button>
                  </ActionForm>
                  <ActionForm action={unshareCollection.bind(null, collectionId, s.profile_id)}>
                    <Button size="sm" variant="ghost" aria-label={`Stop sharing with ${who?.name ?? "them"}`}>
                      <X aria-hidden />
                    </Button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
          {unshared.length > 0 && (
            <ActionForm action={shareCollection.bind(null, collectionId)} className="flex flex-wrap items-center gap-2 border-t pt-3">
              <select name="profile" aria-label="Share with" required className={select}>
                {unshared.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
              <select name="permission" defaultValue="read" aria-label="What they can do" className={select}>
                {Object.entries(PERMISSION).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button size="sm">Share</Button>
            </ActionForm>
          )}
        </>
      )}
    </section>
  );
}
