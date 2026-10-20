import type { Metadata } from "next";
import { FolderPlus, LayoutGrid, List, Plus, Share2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { SearchBox } from "@/components/search-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Sort, findRecipes } from "@/lib/galley";
import { currentMember } from "@/lib/players";
import { createCollection } from "./actions";
import { accessTo, loadCollections, loadRecipeCards } from "./data";
import { RecipeList } from "./recipe-list";

export const metadata: Metadata = { title: "Galley · First Mate" };

type Search = { q?: string; tag?: string; sort?: string; layout?: string };

const SORTS: [Sort, string][] = [
  ["new", "Newest"],
  ["cooked", "Recently cooked"],
  ["az", "A–Z"],
];

export default function GalleyPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Recipes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Recipes({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await currentMember();
  const search = await searchParams;
  const [all, collections] = await Promise.all([loadRecipeCards(), loadCollections()]);
  const sort = SORTS.find(([s]) => s === search.sort)?.[0] ?? "new";
  const layout = search.layout === "list" ? "list" : "grid";
  const tag = search.tag && all.some((r) => r.tags.includes(search.tag!)) ? search.tag : null;
  const recipes = findRecipes(all, { q: search.q, tag, sort });
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort();
  const owner = member.role === "owner";
  const sharedWithMe = collections.filter((c) => c.shares.some((s) => s.profile_id === member.id));
  // Crew add recipes anywhere; others only into a collection shared with them to add to.
  const addTo = sharedWithMe.find((c) => accessTo(c, member) === "contribute");
  const canAdd = member.role !== "guest" || addTo !== undefined;
  const newRecipe = member.role === "guest" && addTo ? `/galley/new?collection=${addTo.id}` : "/galley/new";
  const href = (change: Partial<Search>) => {
    const next = { ...search, ...change };
    const params = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/galley?${params}`;
  };

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Galley</p>
          <h1 className="text-4xl">The family cookbook</h1>
        </div>
        {canAdd && (
          <Button asChild>
            <Link href={newRecipe}>
              <Plus aria-hidden /> New recipe
            </Link>
          </Button>
        )}
      </header>

      {(collections.length > 0 || owner) && (
        <section className="flex flex-col gap-2" aria-labelledby="collections">
          <h2 id="collections" className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {member.role === "guest" ? "Shared with you" : "Collections"}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {collections.map((c) => {
              const mine = sharedWithMe.includes(c);
              return (
                <li key={c.id}>
                  <Link
                    href={`/galley/collections/${c.id}`}
                    className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="font-serif text-lg font-black">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.recipes}</span>
                    {(mine || (owner && c.shares.length > 0)) && (
                      <Share2 className="size-3.5 text-muted-foreground" aria-label={mine ? "Shared with you" : "Shared"} />
                    )}
                  </Link>
                </li>
              );
            })}
            {owner && (
              <li>
                <details className="rounded-xl border border-dashed">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
                    <FolderPlus className="size-4" aria-hidden /> New collection
                  </summary>
                  <ActionForm action={createCollection} className="flex gap-2 p-2 pt-0">
                    <Input name="name" placeholder="Sunday roasts" aria-label="Collection name" required className="w-48" />
                    <Button size="sm">Make it</Button>
                  </ActionForm>
                </details>
              </li>
            )}
          </ul>
        </section>
      )}

      {all.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          {member.role === "guest" ? (
            <p className="font-serif text-2xl italic text-muted-foreground">Nothing&apos;s been shared with you yet.</p>
          ) : (
            <>
              <p className="font-serif text-2xl italic text-muted-foreground">The galley shelves are bare.</p>
              <Link href="/galley/new" className="mt-3 inline-block font-semibold text-primary hover:underline dark:text-blue-400">
                Add the first recipe
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Its own row on a phone; beside the sort and layout buttons on anything wider. */}
              <div className="flex w-full sm:w-auto sm:min-w-64 sm:flex-1">
                <SearchBox placeholder="Search recipes or ingredients" label="Search recipes" />
              </div>
              <nav aria-label="Sort" className="flex rounded-lg border bg-card p-0.5 text-sm">
                {SORTS.map(([value, name]) => (
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
              <nav aria-label="Layout" className="ml-auto flex rounded-lg border bg-card p-0.5 sm:ml-0">
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
              // One row that scrolls sideways on a phone, rather than half a screen of tags.
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {tags.map((t) => (
                  <Link
                    key={t}
                    href={href({ tag: tag === t ? undefined : t })}
                    aria-current={tag === t ? "true" : undefined}
                    className="shrink-0 whitespace-nowrap rounded-full border bg-card px-3 py-1 text-sm hover:bg-muted aria-[current=true]:border-primary aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground"
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
          ) : (
            <RecipeList recipes={recipes} layout={layout} />
          )}
        </>
      )}
    </>
  );
}
