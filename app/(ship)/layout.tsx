import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { IdleLock } from "@/components/idle-lock";
import { LogoutButton } from "@/components/logout-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { IDLE_MINUTES } from "@/lib/kitchen";
import { canSeeLedger, currentMember, kitchenState } from "@/lib/players";
import { visibleSections } from "@/lib/sections";
import { lock } from "./helm/actions";

export default function ShipLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            ⚓ First Mate
          </Link>
          <Suspense>
            <Nav />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            <Suspense>
              <KitchenStatus />
            </Suspense>
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

async function Nav() {
  const member = await currentMember();
  // ponytail: games live on the games. subdomain of whatever host we're on.
  const host = (await headers()).get("host");
  return (
    <nav className="order-last flex w-full gap-5 overflow-x-auto text-sm sm:order-none sm:w-auto">
      {visibleSections(await canSeeLedger(member)).map((s) => (
        <Link key={s.slug} href={`/${s.slug}`} className="whitespace-nowrap hover:underline">
          {s.name}
        </Link>
      ))}
      <a href={`//games.${host}`} className="whitespace-nowrap hover:underline">
        Games
      </a>
    </nav>
  );
}

/** On the kitchen screen: a badge, and while the Ledger is unlocked a Lock button and the idle timer. */
async function KitchenStatus() {
  const { kitchen, unlock } = await kitchenState(await currentMember());
  if (!kitchen) return null;
  return (
    <>
      <Link href="/helm" className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
        Kitchen
      </Link>
      {unlock && (
        <form action={lock}>
          <IdleLock idleMs={IDLE_MINUTES * 60_000} until={unlock.exp} lock={lock} />
          <Button size="sm" variant="outline">
            Lock Ledger
          </Button>
        </form>
      )}
    </>
  );
}
