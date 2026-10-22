import type { Metadata } from "next";
import { CalendarPlus, Check, ChefHat, Clock, ExternalLink, History, Plus, Timer, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PHOTO_BUCKET, minutes } from "@/lib/galley";
import { dayKey } from "@/lib/logbook";
import { currentMember } from "@/lib/players";
import { deleteRecipe, fileRecipe, planMeal, setRecipePhoto } from "../actions";
import { accessTo, loadCollections, loadRecipe } from "../data";
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
  const member = await currentMember();
  const { id } = await params;
  const [recipe, collections] = await Promise.all([loadRecipe(id), loadCollections()]);
  if (!recipe) notFound();
  // Row-level security has the final say; this just hides buttons that wouldn't work.
  const canChange = member.role === "owner" || recipe.created_by === member.id;
  const crew = member.role !== "guest";
  // Collections it's in, and (for Captains and contributors) the ones it could go in.
  const filing = collections.map((c) => ({
    ...c,
    filed: recipe.collections.includes(c.id),
    canFile: accessTo(c, member) !== "read",
  }));
  const facts = [
    recipe.prep_minutes ? { icon: Clock, label: "Prep", value: minutes(recipe.prep_minutes) } : null,
    recipe.cook_minutes ? { icon: Timer, label: "Cook", value: minutes(recipe.cook_minutes) } : null,
    recipe.servings ? { icon: Users, label: "Serves", value: String(recipe.servings) } : null,
    recipe.cooked_at ? { icon: History, label: "Last cooked", value: ago(recipe.cooked_at) } : null,
  ].filter((f) => f !== null);

  return (
    <article className="flex max-w-3xl flex-col gap-8">
      <Link href="/galley" className="text-sm text-muted-foreground hover:underline">
        ← Galley
      </Link>

      {(recipe.photo || canChange) && (
        <div className="relative overflow-hidden rounded-2xl border bg-muted">
          {recipe.photo ? (
            // Private, signed links: next/image's optimiser can't fetch them anyway.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={recipe.photo} alt={recipe.title} className="aspect-[16/9] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/5] items-center justify-center" aria-hidden>
              <span className="font-serif text-7xl font-black italic text-foreground/15">{recipe.title.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
          {canChange && (
            <div className="absolute bottom-3 left-3">
              <PhotoPicker bucket={PHOTO_BUCKET} folder={recipe.id} save={setRecipePhoto.bind(null, recipe.id)} hasPhoto={Boolean(recipe.photo)} />
            </div>
          )}
        </div>
      )}

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
        <div className="flex flex-wrap items-start gap-3">
          {recipe.steps.length > 0 && (
            <Button asChild size="lg">
              <Link href={`/galley/${recipe.id}/cook`}>
                <ChefHat aria-hidden /> Cook this
              </Link>
            </Button>
          )}
          {crew && (
            <details className="group rounded-lg border bg-card">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold">
                <CalendarPlus className="size-4" aria-hidden /> Add to meal plan
              </summary>
              <ActionForm action={planMeal.bind(null, recipe.id)} reset={false} className="flex flex-wrap items-end gap-3 border-t p-4">
                <div className="grid gap-1">
                  <Label htmlFor="meal-date">Day</Label>
                  <Input id="meal-date" name="date" type="date" defaultValue={dayKey(new Date())} required />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="meal-time">Start cooking</Label>
                  <Input id="meal-time" name="time" type="time" defaultValue="17:30" required />
                </div>
                <Button>Add to the Logbook</Button>
              </ActionForm>
            </details>
          )}
        </div>
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

      {filing.some((c) => c.filed || c.canFile) && (
        <section className="flex flex-col gap-2" aria-labelledby="collections">
          <h2 id="collections" className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Collections
          </h2>
          <ul className="flex flex-wrap gap-2">
            {filing
              .filter((c) => c.filed || c.canFile)
              .map((c) => (
                <li key={c.id} className="flex items-center">
                  {c.canFile ? (
                    <ActionForm action={fileRecipe.bind(null, c.id, recipe.id, !c.filed)} className="flex flex-wrap items-center gap-2">
                      <button
                        aria-pressed={c.filed}
                        className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      >
                        {c.filed ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} {c.name}
                      </button>
                    </ActionForm>
                  ) : (
                    <Link href={`/galley/collections/${c.id}`} className="rounded-full bg-muted px-3 py-1 text-sm hover:bg-muted/70">
                      {c.name}
                    </Link>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

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

/** "today", "yesterday", "5 days ago", or the date. */
function ago(at: string) {
  const days = Math.round((Date.parse(`${dayKey(new Date())}T00:00:00Z`) - Date.parse(`${dayKey(new Date(at))}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}
