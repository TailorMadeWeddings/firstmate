import type { Metadata } from "next";
import { CalendarClock, Check, ExternalLink, FileText, Pencil, Plus, Syringe, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { SCHEDULE_URL, type Status, checklist, fluThisYear } from "@/lib/immunisation";
import { TZ, dayKey } from "@/lib/logbook";
import { type Kind, KINDS, type PersonKey, isPersonKey } from "@/lib/medical";
import { currentMedicalMember } from "@/lib/players";
import { ConstitutionTabs } from "../tabs";
import { deleteFile } from "./actions";
import { type Row, loadBirthday, loadCard, loadRecords, loadSubjects } from "./data";
import { EmergencyCard } from "./emergency-card";
import { FileUpload } from "./file-upload";

export const metadata: Metadata = { title: "Medical · Constitution · First Mate" };

type Search = { person?: string };

export default function MedicalPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Medical searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const when = (iso: string, withTime = true) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(iso));
// Dates without a time are calendar days: show them as written, whatever the time zone.
const onDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const size = (bytes: number | null) => (bytes === null ? "" : bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

async function Medical({ searchParams }: { searchParams: Promise<Search> }) {
  const member = await currentMedicalMember();
  const search = await searchParams;
  const subjects = await loadSubjects(member);
  const person: PersonKey =
    (isPersonKey(search.person) && subjects.some((s) => s.key === search.person) ? search.person : null) ?? `p:${member.id}`;
  const subject = subjects.find((s) => s.key === person);
  const [card, records, born] = await Promise.all([loadCard(person), loadRecords(person), loadBirthday(person)]);
  const today = dayKey(new Date());
  const captain = member.role === "owner";
  const now = new Date().toISOString();
  const upcoming = records.appointment.filter((a) => String(a.starts_at) >= now).reverse();
  const past = records.appointment.filter((a) => String(a.starts_at) < now);
  const add = (kind: Kind) => `/constitution/medical/${kind}/new?person=${encodeURIComponent(person)}`;
  const edit = (kind: Kind, id: string) => `/constitution/medical/${kind}/${id}`;
  const fileLinks = [
    ...records.appointment.map((a) => ({ value: `appointment:${a.id}`, label: `Appointment, ${when(String(a.starts_at), false)}` })),
    ...records.result.map((r) => ({ value: `result:${r.id}`, label: `${r.test}, ${onDay(String(r.taken_on))}` })),
  ];

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Constitution</p>
          <h1 className="text-4xl">Medical records</h1>
          <p className="text-sm text-muted-foreground">
            {captain
              ? "Both Captains see the Captains' and the children's. Officers see only the children's emergency cards."
              : "Only you can see your records. The children's emergency cards are on the Crew page."}
          </p>
        </div>
        <ConstitutionTabs current="medical" fitness={captain} />
      </header>

      {subjects.length > 1 && (
      <nav aria-label="Who" className="flex flex-wrap gap-2">
        {subjects.map((s) => (
          <Link
            key={s.key}
            href={`/constitution/medical?person=${encodeURIComponent(s.key)}`}
            aria-current={s.key === person ? "page" : undefined}
            className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium hover:bg-muted aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background"
          >
            <span className="size-3 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.name}
          </Link>
        ))}
      </nav>
      )}

      <section aria-labelledby="card" className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="card" className="font-serif text-2xl font-black">
            {subject ? `${subject.name}’s` : "The"} emergency card
          </h2>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/constitution/medical/card?person=${encodeURIComponent(person)}`}>
              <Pencil aria-hidden /> {card ? "Edit" : "Fill in"}
            </Link>
          </Button>
        </div>
        <EmergencyCard card={card} />
      </section>

      <section aria-labelledby="upcoming" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="upcoming" className="flex items-center gap-2 font-serif text-2xl font-black">
            <CalendarClock className="size-5" aria-hidden /> Coming up
          </h2>
          <Button asChild size="sm">
            <Link href={add("appointment")}>
              <Plus aria-hidden /> Appointment
            </Link>
          </Button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appointments booked. New ones show on the Logbook as &ldquo;Appointment&rdquo;.</p>
        ) : (
          <RecordList rows={upcoming} kind="appointment" edit={edit} />
        )}
      </section>

      {born && (
        <Immunisations
          born={born}
          today={today}
          recorded={new Set(records.vaccination.map((v) => String(v.schedule_key ?? "")).filter(Boolean))}
          vaccinations={records.vaccination.map((v) => ({ vaccine: String(v.vaccine), given_on: String(v.given_on) }))}
          record={(key) => `${add("vaccination")}&schedule=${key}`}
          name={subject?.name ?? "them"}
        />
      )}

      <History title="Appointments" kind="appointment" rows={past} add={add} edit={edit} empty="No past appointments recorded." />
      <History title="Test results" kind="result" rows={records.result} add={add} edit={edit} empty="No results recorded." />
      <History title="Vaccinations" kind="vaccination" rows={records.vaccination} add={add} edit={edit} empty="No vaccinations recorded." />

      <section aria-labelledby="documents" className="flex flex-col gap-3">
        <h2 id="documents" className="flex items-center gap-2 font-serif text-2xl font-black">
          <FileText className="size-5" aria-hidden /> Documents
        </h2>
        <FileUpload householdId={member.householdId} person={person} links={fileLinks} />
        {records.files.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {records.files.map((f) => {
              const about = fileLinks.find((l) => l.value === `appointment:${f.appointment_id}` || l.value === `result:${f.result_id}`);
              return (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-primary hover:underline dark:text-blue-400">
                        {f.name}
                      </a>
                    ) : (
                      <span className="block truncate font-medium">{f.name}</span>
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {[when(f.created_at, false), size(f.size_bytes), about?.label].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ActionForm action={deleteFile.bind(null, f.id)} confirm={`Delete ${f.name}?`}>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${f.name}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function History({ title, kind, rows, add, edit, empty }: { title: string; kind: Kind; rows: Row[]; add: (k: Kind) => string; edit: (k: Kind, id: string) => string; empty: string }) {
  return (
    <section aria-labelledby={`history-${kind}`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`history-${kind}`} className="font-serif text-2xl font-black">
          {title}
        </h2>
        <Button asChild size="sm" variant="secondary">
          <Link href={add(kind)}>
            <Plus aria-hidden /> {KINDS[kind].title}
          </Link>
        </Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <RecordList rows={rows} kind={kind} edit={edit} />}
    </section>
  );
}

/** One line each: when, what, and the gist; tap to see or change it all. */
function RecordList({ rows, kind, edit }: { rows: Row[]; kind: Kind; edit: (k: Kind, id: string) => string }) {
  const line = (r: Row) =>
    kind === "appointment"
      ? { date: when(String(r.starts_at)), title: r.reason || "Appointment", sub: [r.provider, r.outcome].filter(Boolean).join(" · ") }
      : kind === "result"
        ? { date: onDay(String(r.taken_on)), title: r.test, sub: [r.result, r.reference_range && `range ${r.reference_range}`].filter(Boolean).join(" · ") }
        : { date: onDay(String(r.given_on)), title: r.vaccine, sub: [r.dose, r.provider].filter(Boolean).join(" · ") };
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {rows.map((r) => {
        const l = line(r);
        return (
          <li key={r.id}>
            <Link href={edit(kind, r.id)} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted sm:flex-row sm:items-baseline sm:gap-4">
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground sm:w-48">{l.date}</span>
              <span className="min-w-0">
                <span className="block font-medium">{l.title}</span>
                {l.sub && <span className="line-clamp-2 text-sm text-muted-foreground">{l.sub}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS: Record<Status, { label: string; tone: string }> = {
  done: { label: "Done", tone: "text-emerald-700 dark:text-emerald-400" },
  overdue: { label: "Overdue", tone: "font-semibold text-red-600 dark:text-red-400" },
  unrecorded: { label: "Not recorded", tone: "text-muted-foreground" },
  due: { label: "Due now", tone: "font-semibold text-amber-700 dark:text-amber-400" },
  upcoming: { label: "Coming up", tone: "text-muted-foreground" },
};

/** The routine childhood schedule against this child's birthday. */
function Immunisations({
  born,
  today,
  recorded,
  vaccinations,
  record,
  name,
}: {
  born: string;
  today: string;
  recorded: Set<string>;
  vaccinations: { vaccine: string; given_on: string }[];
  record: (key: string) => string;
  name: string;
}) {
  const visits = checklist(born, recorded, today);
  const flu = fluThisYear(born, vaccinations, today);
  return (
    <section aria-labelledby="immunisations" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="immunisations" className="flex items-center gap-2 font-serif text-2xl font-black">
          <Syringe className="size-5" aria-hidden /> Immunisation schedule
        </h2>
        <p className="text-sm text-muted-foreground">
          The routine National Immunisation Program visits, from {name}&apos;s birthday. Some vaccines are only for certain groups or states:{" "}
          <a href={SCHEDULE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline dark:text-blue-400">
            the full schedule <ExternalLink className="size-3" aria-hidden />
          </a>
          . Check with your GP or the Australian Immunisation Register for the official record.
        </p>
      </div>
      <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
        {visits.map((v) => (
          <li key={v.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex w-36 shrink-0 flex-col">
              <span className="font-semibold">{v.age}</span>
              <span className="text-xs text-muted-foreground">{v.school ? "around" : "from"} {new Date(`${v.due}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</span>
            </span>
            <span className="min-w-0 flex-1 text-sm">{v.vaccines.join(" · ")}</span>
            <span className="flex items-center gap-3">
              <span className={`flex items-center gap-1 text-sm ${STATUS[v.status].tone}`}>
                {v.status === "done" && <Check className="size-4" aria-hidden />}
                {STATUS[v.status].label}
              </span>
              {v.status !== "done" && v.status !== "upcoming" && (
                <Link href={record(v.key)} className="rounded-md border px-2.5 py-1 text-sm font-semibold hover:bg-muted">
                  Record it
                </Link>
              )}
            </span>
          </li>
        ))}
        {flu && (
          <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <span className="w-36 shrink-0 font-semibold">Every year</span>
            <span className="min-w-0 flex-1 text-sm">Flu, free from 6 months until 5 years</span>
            <span className={`flex items-center gap-1 text-sm ${STATUS[flu].tone}`}>
              {flu === "done" && <Check className="size-4" aria-hidden />}
              {flu === "done" ? `Done for ${today.slice(0, 4)}` : `Due for ${today.slice(0, 4)}`}
            </span>
          </li>
        )}
      </ol>
    </section>
  );
}
