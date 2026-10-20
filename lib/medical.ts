// Medical records: who a record is about, Medicare numbers, and the fields
// each kind of record has. Pure, so it's testable.

/** "p:<profile id>" for a grown-up, "d:<dependent id>" for a child, as on the Logbook. */
export type PersonKey = string;

export const personColumns = (key: PersonKey) => ({
  profile_id: key.startsWith("p:") ? key.slice(2) : null,
  dependent_id: key.startsWith("d:") ? key.slice(2) : null,
});

export const personKey = (row: { profile_id: string | null; dependent_id: string | null }): PersonKey =>
  row.profile_id ? `p:${row.profile_id}` : `d:${row.dependent_id}`;

export const isPersonKey = (s: string | undefined): s is PersonKey => !!s && /^[pd]:[0-9a-f-]{36}$/.test(s);

/**
 * A Medicare card number: 10 digits, the first 2–6, the 9th a check digit
 * over the first 8 (weights 1 3 7 9 1 3 7 9), the 10th the card's issue
 * number. Catches most typos; spaces are fine.
 */
export function medicareProblem(raw: string): string | null {
  const n = raw.replace(/\s+/g, "");
  if (!/^\d{10}$/.test(n)) return "A Medicare number is 10 digits.";
  if (!/^[2-6]/.test(n)) return "A Medicare number starts with 2, 3, 4, 5 or 6.";
  const weights = [1, 3, 7, 9, 1, 3, 7, 9];
  const sum = weights.reduce((s, w, i) => s + w * Number(n[i]), 0);
  return sum % 10 === Number(n[8]) ? null : "That Medicare number doesn't add up. Check the digits.";
}

/** "2123 45670 1", as printed on the card. */
export const formatMedicare = (n: string) => `${n.slice(0, 4)} ${n.slice(4, 9)} ${n.slice(9)}`;

/** Most of it hidden until asked for: "•••• ••••0 1". */
export const maskMedicare = (n: string) => `•••• ••••${n.slice(8, 9)} ${n.slice(9)}`;

/** A Medicare expiry, "MM/YYYY", from what's typed ("8/29", "08/2029", "2029-08"). */
export function medicareExpiry(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return month >= 1 && month <= 12 ? `${String(month).padStart(2, "0")}/${year}` : null;
  }
  m = s.match(/^(\d{4})-(\d{2})$/);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[2]}/${m[1]}` : null;
}

// ---------- the kinds of record ----------

export type Field = { name: string; label: string; type: "text" | "textarea" | "date" | "datetime" | "minutes"; required?: boolean; placeholder?: string };

export const KINDS = {
  appointment: {
    table: "medical_appointments",
    title: "Appointment",
    plural: "Appointments",
    fields: [
      { name: "starts_at", label: "When", type: "datetime", required: true },
      { name: "minutes", label: "How long (minutes)", type: "minutes" },
      { name: "provider", label: "Who with", type: "text", placeholder: "Dr Lee, Northside Family Practice" },
      { name: "reason", label: "What it's for", type: "textarea", placeholder: "Ear infection, follow-up on bloods…" },
      { name: "outcome", label: "What happened (results, what was said)", type: "textarea" },
      { name: "follow_up", label: "Follow-up", type: "text", placeholder: "Review in 2 weeks; referral to ENT" },
    ],
  },
  result: {
    table: "medical_results",
    title: "Test result",
    plural: "Test results",
    fields: [
      { name: "taken_on", label: "Date of the test", type: "date", required: true },
      { name: "test", label: "Test", type: "text", required: true, placeholder: "Full blood count, iron studies, X-ray…" },
      { name: "result", label: "Result", type: "textarea", placeholder: "Ferritin 45 µg/L" },
      { name: "reference_range", label: "Normal range (optional)", type: "text", placeholder: "30–300 µg/L" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  vaccination: {
    table: "medical_vaccinations",
    title: "Vaccination",
    plural: "Vaccinations",
    fields: [
      { name: "given_on", label: "Date given", type: "date", required: true },
      { name: "vaccine", label: "Vaccine", type: "text", required: true, placeholder: "Flu, MMR, DTPa…" },
      { name: "dose", label: "Dose (optional)", type: "text", placeholder: "12-month, dose 2, booster" },
      { name: "provider", label: "Where (optional)", type: "text" },
      { name: "batch", label: "Batch number (optional)", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
} as const satisfies Record<string, { table: string; title: string; plural: string; fields: readonly Field[] }>;

export type Kind = keyof typeof KINDS;
export const isKind = (s: string): s is Kind => s in KINDS;
