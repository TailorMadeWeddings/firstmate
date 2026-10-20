import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { personKey } from "@/lib/medical";
import { currentVoyageCaptain } from "@/lib/players";
import { pageName, template } from "@/lib/voyage";
import { deletePage, savePage } from "../../../actions";
import { loadEntry } from "../../../data";
import { PageFields } from "../../../parts";

export const metadata: Metadata = { title: "Edit page · Voyage · First Mate" };

type Props = { params: Promise<{ id: string }> };

export default function EditPage(props: Props) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Edit {...props} />
      </Suspense>
    </div>
  );
}

async function Edit({ params }: Props) {
  await currentVoyageCaptain();
  const { id } = await params;
  const entry = await loadEntry(id);
  if (!entry) notFound();
  const t = template(entry.template);
  const name = pageName(entry.template, entry.period, entry.title);
  return (
    <>
      <Link href={`/voyage/page/${entry.id}`} className="text-sm text-muted-foreground hover:underline">
        ← {name}
      </Link>
      <h1 className="text-3xl">Edit: {name}</h1>
      {t.blurb && <p className="text-sm text-muted-foreground">{t.blurb}</p>}
      <ActionForm
        action={savePage.bind(null, entry.id, entry.template, t.family ? null : personKey(entry), entry.period)}
        reset={false}
        className="flex flex-col gap-6 rounded-2xl border bg-card p-5"
      >
        <PageFields tkey={entry.template} period={entry.period} values={entry} />
        <Button size="lg" className="self-start">
          Save
        </Button>
      </ActionForm>
      <ActionForm action={deletePage.bind(null, entry.id)} confirm={`Delete “${name}”, and its photos? This can't be undone.`}>
        <Button variant="ghost" className="text-red-600">
          <Trash2 aria-hidden /> Delete this page
        </Button>
      </ActionForm>
    </>
  );
}
