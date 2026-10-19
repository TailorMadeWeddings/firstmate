// The five sections of the ship, in nav order.
export const sections = [
  { slug: "logbook", name: "Logbook", blurb: "The family calendar: who's doing what, and when." },
  { slug: "galley", name: "Galley", blurb: "Recipes, meal plans and cooking mode." },
  { slug: "constitution", name: "Constitution", blurb: "Health and habits, private to each person." },
  { slug: "ledger", name: "Ledger", blurb: "Accounts, bills and savings goals.", ownersOnly: true },
  { slug: "portraits", name: "Portraits", blurb: "Family photo albums." },
] as const;

export type Section = (typeof sections)[number];

export const visibleTo = (role: string) =>
  sections.filter((s) => !("ownersOnly" in s) || role === "owner");
