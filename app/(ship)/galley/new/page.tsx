import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentMember } from "@/lib/players";
import { saveRecipe } from "../actions";
import { accessTo, loadCollections } from "../data";
import { importRecipe } from "../import";
import { RecipeFields } from "../recipe-fields";

export const metadata: Metadata = { title: "New recipe · Galley · First Mate" };

type Search = { collection?: string; from?: string };

export default function NewRecipePage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-baseline gap-3">
        <Link href="/galley" className="text-sm text-muted-foreground hover:underline">
          ← Galley
        </Link>
        <h1 className="text-3xl">New recipe</h1>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewRecipe searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewRecipe({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await currentMember();
  const { collection: collectionId, from } = await searchParams;
  const collection = collectionId ? (await loadCollections()).find((c) => c.id === collectionId) : undefined;
  // Visitors write recipes only into a collection shared with them to add to.
  if (collection && accessTo(collection, member) === "read") notFound();
  if (member.role === "guest" && !collection) notFound();
  const imported = from ? await importRecipe(from) : null;

  return (
    <>
      {/* A plain GET form: the import happens as this page loads, then you check it over. */}
      <form action="/galley/new" className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
        <label htmlFor="from" className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4" aria-hidden /> Import from a recipe website
        </label>
        <div className="flex flex-wrap gap-2">
          {collection && <input type="hidden" name="collection" value={collection.id} />}
          <Input id="from" name="from" type="url" inputMode="url" placeholder="https://www.taste.com.au/recipes/…" defaultValue={from} required className="min-w-0 flex-1" />
          <Button variant="secondary">Import</Button>
        </div>
        {typeof imported === "string" ? (
          <p role="alert" className="text-sm text-red-600">
            {imported}
          </p>
        ) : imported ? (
          <p role="status" className="text-sm text-muted-foreground">
            Imported. Check it over below, then save it.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Or fill it in yourself below.</p>
        )}
      </form>

      {/* Keyed by the import, so a new import replaces what's in the form. */}
      <ActionForm key={from ?? "blank"} action={saveRecipe.bind(null, null)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        {collection && (
          <p className="text-sm">
            Adding to <span className="font-semibold">{collection.name}</span>
            <input type="hidden" name="collection" value={collection.id} />
          </p>
        )}
        <RecipeFields value={imported && typeof imported !== "string" ? imported : undefined} />
        <Button size="lg" className="self-start">
          Add to the Galley
        </Button>
      </ActionForm>
    </>
  );
}
