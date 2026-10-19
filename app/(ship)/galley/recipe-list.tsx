// Recipes as tiles or a list: the Galley's browse page and each collection's page.
import { Clock, Users } from "lucide-react";
import Link from "next/link";
import { type RecipeCard, minutes } from "@/lib/galley";

export function RecipeList({ recipes, layout }: { recipes: RecipeCard[]; layout: "grid" | "list" }) {
  return layout === "grid" ? (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((r) => (
        <li key={r.id}>
          <RecipeTile recipe={r} />
        </li>
      ))}
    </ul>
  ) : (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {recipes.map((r) => (
        <li key={r.id}>
          <Link href={`/galley/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-lg font-black">{r.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.tags.join(" · ")}</span>
            </span>
            <Meta recipe={r} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const total = (r: RecipeCard) => (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);

function Meta({ recipe: r }: { recipe: RecipeCard }) {
  return (
    <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
      {total(r) > 0 && (
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden /> {minutes(total(r))}
        </span>
      )}
      {r.servings && (
        <span className="flex items-center gap-1">
          <Users className="size-3.5" aria-hidden /> {r.servings}
        </span>
      )}
    </span>
  );
}

/** The photo, or without one the title's first letter, large. */
function RecipeTile({ recipe: r }: { recipe: RecipeCard }) {
  return (
    <Link href={`/galley/${r.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {r.photo ? (
        // Private, signed links: next/image's optimiser can't fetch them anyway.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photo} alt="" loading="lazy" className="h-40 w-full bg-muted object-cover" />
      ) : (
        <span className="flex h-28 items-center justify-center bg-muted" aria-hidden>
          <span className="font-serif text-6xl font-black italic text-foreground/15 transition group-hover:text-primary/40">
            {r.title.slice(0, 1).toUpperCase()}
          </span>
        </span>
      )}
      <span className="flex flex-1 flex-col gap-2 p-4">
        <span className="font-serif text-xl font-black leading-tight tracking-tight">{r.title}</span>
        {r.description && <span className="line-clamp-2 text-sm text-muted-foreground">{r.description}</span>}
        <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="flex flex-wrap gap-1">
            {r.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                {t}
              </span>
            ))}
          </span>
          <Meta recipe={r} />
        </span>
      </span>
    </Link>
  );
}
