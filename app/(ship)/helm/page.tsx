import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE_MINUTES, UNLOCK_MINUTES } from "@/lib/kitchen";
import { currentMember, kitchenState } from "@/lib/players";
import { createAdminClient } from "@/lib/supabase/admin";
import { enterKitchen, lock, setPin } from "./actions";

export const metadata: Metadata = { title: "Kitchen screen · First Mate" };

export default function HelmPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Helm />
    </Suspense>
  );
}

async function Helm() {
  const member = await currentMember();
  const { kitchen, unlock } = await kitchenState(member);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Kitchen screen</h1>
        <p className="text-sm text-muted-foreground">
          The Helm is the shared screen in the kitchen. It shows the household view: no Ledger unless
          an owner unlocks it with their PIN, for up to {UNLOCK_MINUTES} minutes or until nobody has
          touched it for {IDLE_MINUTES}.
        </p>
      </header>

      {kitchen ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">This device is the kitchen screen</h2>
          <div className="flex flex-wrap gap-2">
            {unlock ? (
              <form action={lock}>
                <Button variant="outline">Lock the Ledger now</Button>
              </form>
            ) : (
              <Button asChild variant="outline">
                <Link href="/unlock?next=/ledger">Unlock the Ledger</Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/unlock?leave=1">Leave kitchen mode…</Link>
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-xl border p-4">
            <h2 className="font-semibold">Make this device the kitchen screen</h2>
            <p className="text-sm text-muted-foreground">
              Do this on the kitchen screen itself. Turning it off again takes an owner&apos;s PIN.
            </p>
            <ActionForm action={enterKitchen}>
              <Button>Use this device as the kitchen screen</Button>
            </ActionForm>
          </section>
          {member.role === "owner" && <PinForm memberId={member.id} />}
        </>
      )}
    </div>
  );
}

async function PinForm({ memberId }: { memberId: string }) {
  const { data } = await createAdminClient()
    .from("kitchen_pins")
    .select("updated_at")
    .eq("profile_id", memberId)
    .maybeSingle();
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-semibold">Your kitchen PIN</h2>
      <p className="text-sm text-muted-foreground">
        {data
          ? `Set ${new Date(data.updated_at).toLocaleDateString("en-AU")}. Change it any time.`
          : "Not set yet. Each owner has their own."}
      </p>
      <ActionForm action={setPin} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1">
          <Label htmlFor="new-pin">{data ? "New PIN" : "PIN"} (4–8 digits)</Label>
          <Input id="new-pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" maxLength={8} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="confirm-pin">Again</Label>
          <Input id="confirm-pin" name="confirm" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]*" maxLength={8} required />
        </div>
        <Button>{data ? "Change PIN" : "Set PIN"}</Button>
      </ActionForm>
    </section>
  );
}
