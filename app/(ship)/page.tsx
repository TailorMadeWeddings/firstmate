import Link from "next/link";
import { Suspense } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canSeeLedger, currentMember } from "@/lib/players";
import { visibleSections } from "@/lib/sections";

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense>
        <Sections />
      </Suspense>
      <Link href="/helm" className="self-start text-sm text-muted-foreground hover:underline">
        Kitchen screen settings
      </Link>
    </div>
  );
}

async function Sections() {
  const member = await currentMember();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleSections(await canSeeLedger(member)).map((s) => (
        <li key={s.slug}>
          <Card className="relative h-full transition hover:shadow-md">
            <CardHeader>
              <CardTitle>
                <Link href={`/${s.slug}`} className="after:absolute after:inset-0">
                  {s.name}
                </Link>
              </CardTitle>
              <CardDescription>{s.blurb}</CardDescription>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}
