import Link from "next/link";
import { Anchor, CircleUserRound } from "lucide-react";
import { Suspense } from "react";
import { IdleLock } from "@/components/idle-lock";
import { LogoutButton } from "@/components/logout-button";
import { type NavItem, ShipNav } from "@/components/ship-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { IDLE_MINUTES } from "@/lib/kitchen";
import { canSeeConstitution, canSeeLedger, currentMember, kitchenState } from "@/lib/players";
import { visibleSections } from "@/lib/sections";
import { lock } from "./helm/actions";
import { Slideshow } from "./portraits/slideshow";

/**
 * The shell from the AI Studio mock-up: an icon sidebar on desktop and the
 * kitchen screen, a tab bar along the bottom on phones, and a quiet top bar.
 */
export default function ShipLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-28 shrink-0 flex-col items-center gap-10 border-r bg-background py-8 md:flex">
        <Link
          href="/"
          aria-label="First Mate home"
          className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20"
        >
          <Anchor className="size-6" strokeWidth={2.5} />
        </Link>
        <Suspense>
          <Nav layout="sidebar" />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-background px-4 py-3 md:px-10">
          <Link href="/" className="font-serif text-xl font-black tracking-tight md:hidden">
            First Mate
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Suspense>
              <KitchenStatus />
            </Suspense>
            <Suspense>
              <ProfileLink />
            </Suspense>
            <ThemeSwitcher />
            <LogoutButton />
          </div>
        </header>
        {/* Room at the bottom on phones so the tab bar never covers content. */}
        <main className="flex-1 bg-muted/50 px-4 pb-28 pt-6 md:px-10 md:pb-10 md:pt-8">
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <Suspense>
          <Nav layout="tabs" />
        </Suspense>
      </div>
    </div>
  );
}

async function Nav({ layout }: { layout: "sidebar" | "tabs" }) {
  const member = await currentMember();
  const items: NavItem[] = [
    ...visibleSections({ ledger: await canSeeLedger(member), constitution: await canSeeConstitution(member) }).map((s) => ({ slug: s.slug, name: s.name, href: `/${s.slug}` })),
    { slug: "games", name: "Games", href: "/games" },
  ];
  return <ShipNav items={items} layout={layout} />;
}

/** Your profile, on your own device (not the kitchen screen, which anyone can walk up to). */
async function ProfileLink() {
  if (!(await canSeeConstitution(await currentMember()))) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/profile" aria-label="Your profile">
        <CircleUserRound className="size-4" aria-hidden />
      </Link>
    </Button>
  );
}

/** On the kitchen screen: a badge, the photo slideshow when idle, and while the Ledger is unlocked a Lock button and the idle timer. */
async function KitchenStatus() {
  const { kitchen, unlock } = await kitchenState(await currentMember());
  if (!kitchen) return null;
  return (
    <>
      <Slideshow />
      <Link
        href="/helm"
        className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
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
