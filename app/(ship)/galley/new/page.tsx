import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { currentCrew } from "@/lib/players";
import { saveRecipe } from "../actions";
import { RecipeFields } from "../recipe-fields";

export const metadata: Metadata = { title: "New recipe · Galley · First Mate" };

export default function NewRecipePage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-baseline gap-3">
        <Link href="/galley" className="text-sm text-muted-foreground hover:underline">
          ← Galley
        </Link>
        <h1 className="text-3xl">New recipe</h1>
      </header>
      <Suspense>
        <NewRecipe />
      </Suspense>
    </div>
  );
}

async function NewRecipe() {
  await currentCrew();
  return (
    <ActionForm action={saveRecipe.bind(null, null)} reset={false} className="flex flex-col gap-6 rounded-2xl border bg-card p-5">
      <RecipeFields />
      <Button size="lg" className="self-start">
        Add to the Galley
      </Button>
    </ActionForm>
  );
}
