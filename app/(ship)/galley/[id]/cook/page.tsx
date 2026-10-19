import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { currentMember } from "@/lib/players";
import { loadRecipe } from "../../data";
import { CookingMode } from "./cooking-mode";

export const metadata: Metadata = { title: "Cooking · Galley · First Mate" };

export default function CookPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Cook params={params} />
    </Suspense>
  );
}

async function Cook({ params }: { params: Promise<{ id: string }> }) {
  await currentMember();
  const { id } = await params;
  const recipe = await loadRecipe(id);
  if (!recipe || recipe.steps.length === 0) notFound();
  return <CookingMode id={recipe.id} title={recipe.title} ingredients={recipe.ingredients} steps={recipe.steps} />;
}
