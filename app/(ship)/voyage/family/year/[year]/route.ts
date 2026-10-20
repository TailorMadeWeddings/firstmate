import { notFound, redirect } from "next/navigation";
import { currentVoyageCaptain } from "@/lib/players";
import { findSlot } from "../../../data";

/** "The year I was born": that year's page in the world, written or new. */
export async function GET(_: Request, { params }: { params: Promise<{ year: string }> }) {
  await currentVoyageCaptain();
  const year = Number((await params).year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) notFound();
  const id = await findSlot("snapshot", year, null);
  redirect(id ? `/voyage/page/${id}` : `/voyage/page/new?template=snapshot&period=${year}`);
}
