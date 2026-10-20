import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMedicare, isPersonKey } from "@/lib/medical";
import { currentHealthOwner } from "@/lib/players";
import { saveCard } from "../actions";
import { loadCard, loadCards, loadSubjects } from "../data";

export const metadata: Metadata = { title: "Emergency card · Medical · First Mate" };

type Props = { searchParams: Promise<{ person?: string }> };

const area =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export default function CardPage(props: Props) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <EditCard {...props} />
      </Suspense>
    </div>
  );
}

async function EditCard({ searchParams }: Props) {
  const member = await currentHealthOwner();
  const { person } = await searchParams;
  const subject = (await loadSubjects(member.householdId)).find((s) => s.key === person);
  if (!isPersonKey(person) || !subject) notFound();
  const [card, cards] = await Promise.all([loadCard(person), loadCards()]);
  // A family shares one Medicare card; offer the number already on someone else's.
  const familyNumber = [...cards.values()].find((c) => c.medicare_number)?.medicare_number;
  const field = (name: string, label: string, value: string | null | undefined, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value ?? ""} className="h-11 text-base" {...props} />
    </div>
  );
  const text = (name: string, label: string, value: string | null | undefined, placeholder?: string) => (
    <div className="grid gap-1">
      <Label htmlFor={name}>{label}</Label>
      <textarea id={name} name={name} rows={2} defaultValue={value ?? ""} placeholder={placeholder} className={area} />
    </div>
  );
  return (
    <>
      <Link href={`/constitution/medical?person=${encodeURIComponent(person)}`} className="text-sm text-muted-foreground hover:underline">
        ← {subject.name}
      </Link>
      <h1 className="text-3xl">{subject.name}&rsquo;s emergency card</h1>
      <ActionForm action={saveCard.bind(null, person)} reset={false} className="flex flex-col gap-5 rounded-2xl border bg-card p-5">
        {text("allergies", "Allergies", card?.allergies, "Penicillin (rash); peanuts (anaphylaxis, carries an EpiPen)")}
        {text("conditions", "Conditions", card?.conditions, "Asthma, mild")}
        {text("medications", "Regular medications", card?.medications, "Ventolin as needed")}
        <fieldset className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <legend className="mb-2 text-sm font-semibold">Medicare</legend>
          {field("medicare_number", "Card number", card?.medicare_number ? formatMedicare(card.medicare_number) : familyNumber ? formatMedicare(familyNumber) : "", {
            inputMode: "numeric",
            autoComplete: "off",
            placeholder: "2123 45670 1",
          })}
          {field("medicare_irn", "Number beside their name", card?.medicare_irn, { inputMode: "numeric", maxLength: 1, placeholder: "1" })}
          {field("medicare_expiry", "Expires", card?.medicare_expiry, { placeholder: "08/2029", autoComplete: "off" })}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("blood_type", "Blood type", card?.blood_type, { placeholder: "O+" })}
          {field("health_fund", "Health fund", card?.health_fund, { placeholder: "Bupa" })}
          {field("health_fund_number", "Membership number", card?.health_fund_number, { autoComplete: "off" })}
        </div>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold">GP</legend>
          {field("gp_name", "Doctor", card?.gp_name, { placeholder: "Dr Lee" })}
          {field("gp_clinic", "Clinic", card?.gp_clinic)}
          {field("gp_phone", "Phone", card?.gp_phone, { type: "tel", inputMode: "tel" })}
        </fieldset>
        {text("notes", "Anything else", card?.notes)}
        <Button size="lg" className="self-start">
          Save
        </Button>
      </ActionForm>
    </>
  );
}
