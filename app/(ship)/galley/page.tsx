import type { Metadata } from "next";
import { Clock, LayoutGrid, List, Plus, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { Button } from "@/components/ui/button";
import { type RecipeCard, findRecipes, minutes } from "@/lib/galley";
import { currentCrew } from "@/lib/players";
import { loadRecipeCards } from "./data";

export const metadata: Metadata = { title: "Galley · First Mate" };

type Search = { q?: string; tag?: string; sort?: string; layout?: string };

export default function GalleyPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Galley</p>
          <h1 className="text-4xl">The family cookbook</h1>
        </div>
        <Button asChild>
          <Link href="/galley/new">
            <Plus aria-hidden /> New recipe
          </Link>
        </Button>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Recipes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Recipes({ searchParams }: { searchParams: Promise<Search> }) {
  await currentCrew();
  const search = await searchParams;
  const all = await loadRecipeCards();
  const sort = search.sort === "az" ? "az" : "new";
  const layout = search.layout === "list" ? "list" : "grid";
  const tag = search.tag && all.some((r) => r.tags.includes(search.tag!)) ? search.tag : null;
  const recipes = findRecipes(all, search.q ?? "", tag, sort);
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort();
  const href = (change: Partial<Search>) => {
    const next = { ...search, ...change };
    const params = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/galley?${params}`;
  };

  if (all.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <p className="font-serif text-2xl italic text-muted-foreground">The galley shelves are bare.</p>
        <Link href="/galley/new" className="mt-3 inline-block font-semibold text-primary hover:underline dark:text-blue-400">
          Add the first recipe
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox placeholder="Search recipes or ingredients" label="Search recipes" />
          <nav aria-label="Sort" className="flex rounded-lg border bg-card p-0.5 text-sm">
            {(
              [
                ["new", "Newest"],
                ["az", "A–Z"],
              ] as const
            ).map(([value, name]) => (
              <Link
                key={value}
                href={href({ sort: value === "new" ? undefined : value })}
                aria-current={sort === value ? "page" : undefined}
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                {name}
              </Link>
            ))}
          </nav>
          <nav aria-label="Layout" className="flex rounded-lg border bg-card p-0.5">
            {(
              [
                ["grid", LayoutGrid, "Grid"],
                ["list", List, "List"],
              ] as const
            ).map(([value, Icon, name]) => (
              <Link
                key={value}
                href={href({ layout: value === "grid" ? undefined : value })}
                aria-label={name}
                aria-current={layout === value ? "page" : undefined}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                <Icon className="size-4" aria-hidden />
              </Link>
            ))}
          </nav>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Link
                key={t}
                href={href({ tag: tag === t ? undefined : t })}
                aria-current={tag === t ? "true" : undefined}
                className="rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
              >
                {t}
              </Link>
            ))}
          </div>
        )}
      </div>

      {recipes.length === 0 ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          Nothing matches.{" "}
          <Link href="/galley" className="font-semibold text-primary hover:underline dark:text-blue-400">
            Clear the search
          </Link>
        </p>
      ) : layout === "grid" ? (
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
      )}
    </>
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

/** No photos yet (they come with Portraits), so the title's first letter, large, stands in. */
function RecipeTile({ recipe: r }: { recipe: RecipeCard }) {
  return (
    <Link href={`/galley/${r.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className="flex h-28 items-center justify-center bg-muted" aria-hidden>
        <span className="font-serif text-6xl font-black italic text-foreground/15 transition group-hover:text-primary/40">
          {r.title.slice(0, 1).toUpperCase()}
        </span>
      </span>
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
