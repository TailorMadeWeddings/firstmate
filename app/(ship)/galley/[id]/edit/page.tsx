import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { currentMember } from "@/lib/players";
import { saveRecipe } from "../../actions";
import { loadRecipe } from "../../data";
import { RecipeFields } from "../../recipe-fields";

export const metadata: Metadata = { title: "Edit recipe · Galley · First Mate" };

export default function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <EditRecipe params={params} />
    </Suspense>
  );
}

async function EditRecipe({ params }: { params: Promise<{ id: string }> }) {
  await currentMember();
  const { id } = await params;
  const recipe = await loadRecipe(id);
  if (!recipe) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-baseline gap-3">
        <Link href={`/galley/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {recipe.title}
        </Link>
      </header>
      <h1 className="text-3xl">Edit recipe</h1>
      <ActionForm action={saveRecipe.bind(null, id)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
        <RecipeFields value={recipe} />
        <Button size="lg" className="self-start">
          Save changes
        </Button>
      </ActionForm>
    </div>
  );
}
