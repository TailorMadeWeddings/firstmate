import { BookHeart, CalendarDays, ClipboardCheck, Coins, CookingPot, Dices, HeartPulse, Images, type LucideIcon } from "lucide-react";

// The sections of the ship, in nav order.
export const sections = [
  { slug: "logbook", name: "Logbook", blurb: "The family calendar: who's doing what, and when." },
  { slug: "duties", name: "Duties", blurb: "The family to-do list: who's doing what, by when." },
  { slug: "galley", name: "Galley", blurb: "Recipes, meal plans and cooking mode." },
  { slug: "constitution", name: "Constitution", blurb: "Fitness, private to each person, and the family's medical records.", personal: true },
  { slug: "voyage", name: "Voyage", blurb: "Each person's life journal, from before they were born and every year since.", personal: true },
  { slug: "ledger", name: "Ledger", blurb: "Accounts, bills and savings goals.", ownersOnly: true },
  { slug: "portraits", name: "Portraits", blurb: "Family photo albums." },
] as const;

export type Section = (typeof sections)[number];

/** The sections to show: the Ledger when canSeeLedger says so, Constitution and Voyage when canSeeConstitution does. */
export const visibleSections = (show: { ledger: boolean; constitution: boolean }) =>
  sections.filter((s) => ("ownersOnly" in s ? show.ledger : "personal" in s ? show.constitution : true));

/** One icon per section (and Games), shared by the nav and the home page. */
export const sectionIcons: Record<string, LucideIcon> = {
  logbook: CalendarDays,
  duties: ClipboardCheck,
  galley: CookingPot,
  constitution: HeartPulse,
  voyage: BookHeart,
  ledger: Coins,
  portraits: Images,
  games: Dices,
};
