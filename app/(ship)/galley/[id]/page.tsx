import type { Metadata } from "next";
import { ChefHat, Clock, ExternalLink, Timer, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { minutes } from "@/lib/galley";
import { currentCrew } from "@/lib/players";
import { deleteRecipe } from "../actions";
import { loadRecipe } from "../data";
import { Ingredients } from "./ingredients";

export const metadata: Metadata = { title: "Recipe · Galley · First Mate" };

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <RecipeView params={params} />
    </Suspense>
  );
}

async function RecipeView({ params }: { params: Promise<{ id: string }> }) {
  const member = await currentCrew();
  const { id } = await params;
  const recipe = await loadRecipe(id);
  if (!recipe) notFound();
  // Row-level security has the final say; this just hides buttons that wouldn't work.
  const canChange = member.role === "owner" || recipe.created_by === member.id;
  const facts = [
    recipe.prep_minutes ? { icon: Clock, label: "Prep", value: minutes(recipe.prep_minutes) } : null,
    recipe.cook_minutes ? { icon: Timer, label: "Cook", value: minutes(recipe.cook_minutes) } : null,
    recipe.servings ? { icon: Users, label: "Serves", value: String(recipe.servings) } : null,
  ].filter((f) => f !== null);

  return (
    <article className="flex max-w-3xl flex-col gap-8">
      <Link href="/galley" className="text-sm text-muted-foreground hover:underline">
        ← Galley
      </Link>

      <header className="flex flex-col gap-3 border-b pb-6">
        <h1 className="text-4xl md:text-5xl">{recipe.title}</h1>
        {recipe.description && <p className="font-serif text-xl italic text-muted-foreground">{recipe.description}</p>}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {facts.map((f) => (
            <span key={f.label} className="flex items-center gap-1.5">
              <f.icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">{f.label}</span> <span className="font-semibold">{f.value}</span>
            </span>
          ))}
          {recipe.source_url && (
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-primary hover:underline dark:text-blue-400">
              Original recipe <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
        {recipe.steps.length > 0 && (
          <Button asChild size="lg" className="self-start">
            <Link href={`/galley/${recipe.id}/cook`}>
              <ChefHat aria-hidden /> Cook this
            </Link>
          </Button>
        )}
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.map((t) => (
              <Link key={t} href={`/galley?tag=${encodeURIComponent(t)}`} className="rounded-full bg-muted px-3 py-1 text-sm hover:bg-muted/70">
                {t}
              </Link>
            ))}
          </div>
        )}
      </header>

      {recipe.ingredients.length > 0 && <Ingredients ingredients={recipe.ingredients} servings={recipe.servings} />}

      {recipe.steps.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-serif text-2xl font-black">Method</h2>
          <ol className="flex flex-col gap-4">
            {recipe.steps.map((s, n) => (
              <li key={n} className="flex gap-4">
                <span className="font-serif text-3xl font-black italic leading-none text-primary dark:text-blue-400" aria-hidden>
                  {n + 1}
                </span>
                <p className="pt-1 text-base leading-relaxed">
                  <span className="sr-only">Step {n + 1}: </span>
                  {s.instruction}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {canChange && (
        <footer className="flex flex-wrap items-center gap-3 border-t pt-6">
          <Button asChild variant="secondary">
            <Link href={`/galley/${recipe.id}/edit`}>Edit recipe</Link>
          </Button>
          <ActionForm action={deleteRecipe.bind(null, recipe.id)} confirm={`Delete ${recipe.title}?`}>
            <Button variant="outline" className="text-red-600">
              Delete
            </Button>
          </ActionForm>
        </footer>
      )}
    </article>
  );
}
