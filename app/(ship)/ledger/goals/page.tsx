import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { money, pace, today } from "@/lib/ledger";
import { currentOwner } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { addGoal, contribute, deleteContribution, deleteGoal, setGoalComplete } from "../actions";
import { type Account, type Goal, loadAccounts, loadGoals } from "../shared";

export const metadata: Metadata = { title: "Goals · Ledger · First Mate" };

type Contribution = { id: string; goal_id: string; date: string; amount: number; account_id: string };

export default function GoalsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Goals />
    </Suspense>
  );
}

async function Goals() {
  await currentOwner();
  const supabase = await createClient();
  const [goals, accounts, progress, contributions] = await Promise.all([
    loadGoals(),
    loadAccounts(),
    supabase.from("budget_goal_progress").select("id, saved"),
    supabase
      .from("budget_transactions")
      .select("id, goal_id, date, amount, account_id")
      .not("goal_id", "is", null)
      .order("date", { ascending: false }),
  ]);
  if (progress.error) throw progress.error;
  if (contributions.error) throw contributions.error;
  const savedFor = (id: string) => Number(progress.data.find((p) => p.id === id)?.saved ?? 0);
  const active = goals.filter((g) => !g.completed_at);
  const done = goals.filter((g) => g.completed_at);

  const card = (goal: Goal) => (
    <GoalCard
      key={goal.id}
      goal={goal}
      saved={savedFor(goal.id)}
      accounts={accounts}
      contributions={(contributions.data as Contribution[]).filter((c) => c.goal_id === goal.id)}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline gap-3">
        <Link href="/ledger" className="text-sm text-muted-foreground hover:underline">
          ← Ledger
        </Link>
        <h1 className="text-2xl font-bold">Savings goals</h1>
      </header>

      <details open={goals.length === 0} className="max-w-3xl rounded-xl border p-4">
        <summary className="cursor-pointer font-semibold">Add a goal</summary>
        <ActionForm action={addGoal} className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label htmlFor="goal-name">Name</Label>
            <Input id="goal-name" name="name" placeholder="Holiday" required />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="goal-target">Target</Label>
            <Input id="goal-target" name="target_amount" inputMode="decimal" placeholder="5000" required />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="goal-date">By (optional)</Label>
            <Input id="goal-date" name="target_date" type="date" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="goal-start">Already saved</Label>
            <Input id="goal-start" name="starting_amount" inputMode="decimal" placeholder="0.00" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="goal-account">Saved in (optional)</Label>
            <NativeSelect id="goal-account" name="account_id" defaultValue="">
              <option value="">Any account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button className="self-end justify-self-start">Add goal</Button>
        </ActionForm>
      </details>

      {active.length > 0 && <div className="grid gap-4 md:grid-cols-2">{active.map(card)}</div>}

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Done</h2>
          <div className="grid gap-4 md:grid-cols-2">{done.map(card)}</div>
        </section>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  saved,
  accounts,
  contributions,
}: {
  goal: Goal;
  saved: number;
  accounts: Account[];
  contributions: Contribution[];
}) {
  const { percent, ahead, perMonth } = pace(goal, saved);
  const reached = saved >= Number(goal.target_amount);
  return (
    <article className="flex flex-col gap-3 rounded-xl border p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">{goal.name}</h3>
        <span className="text-sm text-muted-foreground">
          {goal.target_date ? `by ${goal.target_date}` : "no deadline"}
        </span>
      </header>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${goal.name} progress`}
        className="h-3 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full ${ahead ? "bg-emerald-600" : "bg-amber-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm">
        <span className="font-semibold tabular-nums">{money(saved)}</span> of{" "}
        <span className="tabular-nums">{money(goal.target_amount)}</span> · {percent}%
      </p>
      {!goal.completed_at && (
        <p className={`text-sm ${ahead ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
          {reached
            ? "Target reached. Mark it done when you're ready."
            : perMonth === null
              ? "No deadline, so no pace to keep."
              : `${ahead ? "On track" : "Behind"}: ${money(perMonth)} a month gets you there.`}
        </p>
      )}

      {!goal.completed_at && accounts.length > 0 && (
        <ActionForm action={contribute.bind(null, goal.id)} className="flex flex-wrap items-end gap-2">
          <Input name="amount" aria-label="Amount to add" inputMode="decimal" placeholder="Add 0.00" className="w-28" />
          <NativeSelect name="from_account_id" aria-label="Moved from" defaultValue="" className="w-auto">
            <option value="">Already there</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                From {a.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            name="account_id"
            aria-label="Account it's in"
            defaultValue={goal.account_id ?? undefined}
            className="w-auto"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                In {a.name}
              </option>
            ))}
          </NativeSelect>
          <Input name="date" aria-label="Date" type="date" defaultValue={today()} className="w-40" />
          <Button size="sm" variant="secondary">
            Add
          </Button>
        </ActionForm>
      )}

      {contributions.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {contributions.length} contribution{contributions.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 divide-y text-sm">
            {contributions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-1">
                <span>
                  {c.date} · {accounts.find((a) => a.id === c.account_id)?.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{money(c.amount)}</span>
                  <ActionForm action={deleteContribution.bind(null, c.id)} confirm="Remove this contribution?">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600">
                      Remove
                    </Button>
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <ActionForm action={setGoalComplete.bind(null, goal.id, !goal.completed_at)}>
          <Button variant="outline" size="sm">
            {goal.completed_at ? "Reopen" : "Mark done"}
          </Button>
        </ActionForm>
        <ActionForm action={deleteGoal.bind(null, goal.id)} confirm={`Delete the ${goal.name} goal?`}>
          <Button variant="outline" size="sm" className="text-red-600">
            Delete
          </Button>
        </ActionForm>
      </div>
    </article>
  );
}
