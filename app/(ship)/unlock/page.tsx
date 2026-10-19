import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNLOCK_MINUTES } from "@/lib/kitchen";
import { currentMember, kitchenState } from "@/lib/players";
import { unlock } from "../helm/actions";

export const metadata: Metadata = { title: "Unlock · First Mate" };

type Search = { next?: string; leave?: string };

export default function UnlockPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Unlock searchParams={searchParams} />
    </Suspense>
  );
}

async function Unlock({ searchParams }: { searchParams: Promise<Search> }) {
  const { next = "/ledger", leave } = await searchParams;
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  // Nothing to unlock away from the kitchen screen.
  if (!(await kitchenState(await currentMember())).kitchen) redirect(target);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{leave ? "Leave kitchen mode" : "Unlock the Ledger"}</h1>
        <p className="text-sm text-muted-foreground">
          {leave
            ? "An owner's PIN turns kitchen mode off on this device."
            : `Enter your owner PIN. It stays unlocked for up to ${UNLOCK_MINUTES} minutes, and locks again when nobody's using it.`}
        </p>
      </header>
      <ActionForm action={unlock.bind(null, target)} className="flex flex-col gap-3">
        <Label htmlFor="pin">PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={8}
          autoFocus
          required
          className="h-12 text-center text-2xl tracking-[0.5em]"
        />
        {leave && <input type="hidden" name="leave" value="on" />}
        <Button size="lg">{leave ? "Leave kitchen mode" : "Unlock"}</Button>
      </ActionForm>
    </div>
  );
}
