// The routine childhood schedule on Australia's National Immunisation
// Program, as a checklist against a child's birthday. Pure, so it's testable.
//
// Source: health.gov.au National Immunisation Program schedule (checked
// October 2026). Only the vaccines every child is offered; ones for
// particular groups, states or medical conditions (MenB, hepatitis A, extra
// pneumococcal doses, RSV) aren't listed. The schedule changes now and then:
// update VISITS when it does.
export const SCHEDULE_URL = "https://www.health.gov.au/childhood-immunisation/immunisation-schedule";

export type Visit = {
  key: string;
  /** When, as people say it. */
  age: string;
  /** Months after birth it's due (the school ones are approximate). */
  months: number;
  vaccines: string[];
  /** Given at school in that year level, so "due" means "at school around then". */
  school?: boolean;
};

export const VISITS: Visit[] = [
  { key: "birth", age: "Birth", months: 0, vaccines: ["Hepatitis B"] },
  { key: "2m", age: "2 months", months: 2, vaccines: ["DTPa-hepB-IPV-Hib (6-in-1)", "Pneumococcal", "Rotavirus"] },
  { key: "4m", age: "4 months", months: 4, vaccines: ["DTPa-hepB-IPV-Hib (6-in-1)", "Pneumococcal", "Rotavirus"] },
  { key: "6m", age: "6 months", months: 6, vaccines: ["DTPa-hepB-IPV-Hib (6-in-1)"] },
  { key: "12m", age: "12 months", months: 12, vaccines: ["Meningococcal ACWY", "MMR", "Pneumococcal"] },
  { key: "18m", age: "18 months", months: 18, vaccines: ["Hib", "MMRV", "DTPa"] },
  { key: "4y", age: "4 years", months: 48, vaccines: ["DTPa-IPV"] },
  { key: "year7", age: "Year 7 (at school)", months: 12 * 12 + 6, vaccines: ["HPV", "dTpa"], school: true },
  { key: "year10", age: "Year 10 (at school)", months: 15 * 12 + 6, vaccines: ["Meningococcal ACWY"], school: true },
];

/** A day "YYYY-MM-DD", some months on (the 31st becomes the month's last day). */
export function monthsAfter(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export type Status = "done" | "due" | "overdue" | "unrecorded" | "upcoming";
export type Checked = Visit & { due: string; status: Status };

/**
 * Each visit with when it's due and where it's at. A visit is done once a
 * vaccination is recorded against it. Infant visits are overdue two months
 * after they're due; past six months they're more likely given but not yet
 * entered here, so they read "not recorded" rather than alarm anyone.
 * School ones are never "overdue": they happen when the school runs them.
 */
export function checklist(born: string, recorded: Set<string>, today: string): Checked[] {
  return VISITS.map((v) => {
    const due = monthsAfter(born, v.months);
    const status: Status = recorded.has(v.key)
      ? "done"
      : due > today
        ? "upcoming"
        : v.school
          ? "due"
          : monthsAfter(due, 6) < today
            ? "unrecorded"
            : monthsAfter(due, 2) < today
              ? "overdue"
              : "due";
    return { ...v, due, status };
  });
}

/**
 * The yearly flu vaccine, free from 6 months until 5: whether this child is
 * in that window, and whether this year's is done (any vaccination this
 * calendar year with "flu" or "influenza" in its name).
 */
export function fluThisYear(born: string, vaccinations: { vaccine: string; given_on: string }[], today: string): "done" | "due" | null {
  if (today < monthsAfter(born, 6) || today >= monthsAfter(born, 60)) return null;
  const year = today.slice(0, 4);
  return vaccinations.some((v) => v.given_on.startsWith(year) && /flu|influenza/i.test(v.vaccine)) ? "done" : "due";
}
