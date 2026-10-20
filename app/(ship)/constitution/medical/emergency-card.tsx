import { AlertTriangle, Phone } from "lucide-react";
import type { Card } from "./data";
import { Medicare } from "./medicare";

/** The essentials for an emergency: on the medical page, and (for the children) on the Crew page. */
export function EmergencyCard({ card }: { card: Card | null }) {
  if (!card) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  const row = (label: string, value: React.ReactNode, alert = false) =>
    value ? (
      <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
        <dt className={`text-xs font-semibold uppercase tracking-[0.15em] ${alert ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{label}</dt>
        <dd className={`whitespace-pre-wrap ${alert ? "font-semibold text-red-700 dark:text-red-300" : ""}`}>{value}</dd>
      </div>
    ) : null;
  return (
    <dl className="flex flex-col gap-3">
      {row(
        "Allergies",
        card.allergies && (
          <span className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {card.allergies}
          </span>
        ),
        true,
      )}
      {row("Conditions", card.conditions)}
      {row("Medications", card.medications)}
      {row("Blood type", card.blood_type)}
      {row("Medicare", card.medicare_number && <Medicare number={card.medicare_number} irn={card.medicare_irn} expiry={card.medicare_expiry} />)}
      {row("Health fund", [card.health_fund, card.health_fund_number].filter(Boolean).join(" · "))}
      {row(
        "GP",
        (card.gp_name || card.gp_clinic || card.gp_phone) && (
          <span className="flex flex-wrap items-center gap-x-3">
            {[card.gp_name, card.gp_clinic].filter(Boolean).join(", ")}
            {card.gp_phone && (
              <a href={`tel:${card.gp_phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 text-primary hover:underline dark:text-blue-400">
                <Phone className="size-3.5" aria-hidden /> {card.gp_phone}
              </a>
            )}
          </span>
        ),
      )}
      {row("Notes", card.notes)}
    </dl>
  );
}
