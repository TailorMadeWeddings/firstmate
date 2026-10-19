import Link from "next/link";
import { Suspense } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentMember } from "@/lib/players";
import { visibleTo } from "@/lib/sections";

export default function Home() {
  return (
    <Suspense>
      <Sections />
    </Suspense>
  );
}

async function Sections() {
  const { role } = await currentMember();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleTo(role).map((s) => (
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
