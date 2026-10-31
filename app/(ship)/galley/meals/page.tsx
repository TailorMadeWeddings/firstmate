import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, ShoppingBasket, X } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEALS, type MealSlot, type PlannedMeal } from "@/lib/galley";
import { addDays, dayKey, weekStart } from "@/lib/logbook";
import { currentCrew } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { addWeek } from "../shopping/actions";
import { clearMeal, planMeal } from "./actions";

export const metadata: Metadata = { title: "Meal plan · Galley · First Mate" };

type Search = { week?: string };

const pretty = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

export default function MealsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/galley" className="text-sm text-muted-foreground hover:underline">
        ← Galley
      </Link>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Planner searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Planner({ searchParams }: { searchParams: Promise<Search> }) {
  await currentCrew();
  const { week } = await searchParams;
  const today = dayKey(new Date());
  const monday = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const supabase = await createClient();
  const [plans, recipes] = await Promise.all([
    supabase.from("meal_plans").select("day, meal, title, recipe_id").gte("day", monday).lt("day", addDays(monday, 7)),
    supabase.from("recipes").select("title").order("title"),
  ]);
  if (plans.error) throw plans.error;
  const meals = plans.data as PlannedMeal[];
  const planned = (day: string, meal: MealSlot) => meals.find((m) => m.day === day && m.meal === meal);
  const link = (d: string) => `/galley/meals?week=${d}`;

  return (
    <>
      <LiveRefresh channel="meals" tables={["meal_plans"]} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Galley</p>
          <h1 className="text-4xl">Meal plan</h1>
          <p className="text-muted-foreground">
            {pretty(monday, { day: "numeric", month: "short" })} – {pretty(addDays(monday, 6), { day: "numeric", month: "short" })}
          </p>
        </div>
        <div className="flex items-center rounded-lg border bg-card">
          <Link href={link(addDays(monday, -7))} aria-label="Week before" className="p-2 hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href={link(today)} className="border-x px-3 py-1.5 text-sm font-semibold hover:bg-muted">
            This week
          </Link>
          <Link href={link(addDays(monday, 7))} aria-label="Week after" className="p-2 hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      {/* Type a recipe's name to plan it (the browser suggests them), or anything else, like Leftovers. */}
      <datalist id="recipe-titles">
        {(recipes.data ?? []).map((r) => (
          <option key={r.title} value={r.title} />
        ))}
      </datalist>

      <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
        {days.map((day) => (
          <li key={day} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start ${day === today ? "bg-primary/[0.04]" : ""}`}>
            <h2 className={`w-28 shrink-0 font-serif text-xl font-black italic ${day === today ? "text-primary dark:text-blue-400" : ""}`}>
              {pretty(day, { weekday: "short" })} {Number(day.slice(8))}
            </h2>
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              {(Object.keys(MEALS) as MealSlot[]).map((meal) => {
                const m = planned(day, meal);
                return (
                  <div key={meal} className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{MEALS[meal]}</span>
                    {m ? (
                      <div className="flex items-center gap-2">
                        {m.recipe_id ? (
                          <Link href={`/galley/${m.recipe_id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                            {m.title}
                          </Link>
                        ) : (
                          <span className="min-w-0 flex-1 truncate font-semibold">{m.title}</span>
                        )}
                        <ActionForm action={clearMeal.bind(null, day, meal)}>
                          <button aria-label={`Clear ${MEALS[meal].toLowerCase()} on ${pretty(day, { weekday: "long" })}`} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <X className="size-4" aria-hidden />
                          </button>
                        </ActionForm>
                      </div>
                    ) : (
                      <ActionForm action={planMeal.bind(null, day, meal)} className="flex gap-2">
                        <Input
                          name="what"
                          list="recipe-titles"
                          placeholder="Plan…"
                          aria-label={`${MEALS[meal]} on ${pretty(day, { weekday: "long" })}`}
                          required
                          maxLength={200}
                          className="h-9 flex-1"
                        />
                        <Button size="sm" variant="secondary" className="h-9">
                          Plan
                        </Button>
                      </ActionForm>
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {meals.some((m) => m.recipe_id) && (
        <ActionForm action={addWeek.bind(null, monday)} className="flex flex-wrap items-center gap-3">
          <Button variant="outline">
            <ShoppingBasket aria-hidden /> Add the week&apos;s ingredients to the shopping list
          </Button>
          <Link href="/galley/shopping" className="text-sm font-semibold text-primary hover:underline dark:text-blue-400">
            See the list
          </Link>
        </ActionForm>
      )}
    </>
  );
}
