// Pieces shared by the Voyage pages: a page's fields to fill in, a page read
// back, the little slot chips in a book's contents, and photos.
import { Images, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonKey } from "@/lib/medical";
import { type TemplateKey, fieldsFor, sealed, template } from "@/lib/voyage";
import { deletePhoto } from "./actions";
import type { Entry, Photo } from "./data";

export const area =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

/** A calendar day as written: "5 Aug 2022". */
export const onDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Values = Partial<Pick<Entry, "title" | "occurred_on" | "body" | "fields">>;

/** Everything a page asks for, filled from a saved page (or suggestions) if given. */
export function PageFields({ tkey, period, values }: { tkey: TemplateKey; period: number | null; values: Values }) {
  const t = template(tkey);
  const fields = values.fields ?? {};
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {t.titleLabel && (
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="title">{t.titleLabel}</Label>
          <Input id="title" name="title" defaultValue={values.title ?? ""} placeholder={t.titlePlaceholder} required className="h-11 text-base" />
        </div>
      )}
      {t.dateLabel && (
        <div className="grid gap-1">
          <Label htmlFor="occurred_on">{t.dateLabel}</Label>
          <Input id="occurred_on" name="occurred_on" type="date" defaultValue={values.occurred_on ?? ""} className="h-11 text-base" />
        </div>
      )}
      {fieldsFor(tkey, period).map((f) => (
        <div key={f.name} className={`grid gap-1 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
          <Label htmlFor={`f_${f.name}`}>
            {f.label}
            {f.unit && <span className="font-normal text-muted-foreground"> ({f.unit})</span>}
          </Label>
          {f.type === "textarea" ? (
            <textarea id={`f_${f.name}`} name={`f_${f.name}`} rows={3} defaultValue={fields[f.name] ?? ""} placeholder={f.placeholder} className={area} />
          ) : (
            <Input
              id={`f_${f.name}`}
              name={`f_${f.name}`}
              type={f.type}
              step={f.type === "number" ? "any" : undefined}
              inputMode={f.type === "number" ? "decimal" : undefined}
              defaultValue={fields[f.name] ?? ""}
              placeholder={f.placeholder}
              className="h-11 text-base"
            />
          )}
        </div>
      ))}
      {t.bodyLabel && (
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="body">{t.bodyLabel}</Label>
          <textarea id="body" name="body" rows={10} defaultValue={values.body ?? ""} className={area} />
        </div>
      )}
    </div>
  );
}

/** A page read back: just what was written, nothing for the blanks. */
export function PageView({ entry, today }: { entry: Entry; today: string }) {
  const t = template(entry.template);
  const shown = fieldsFor(entry.template, entry.period).filter((f) => entry.fields[f.name] && f.name !== "open_on");
  const contents = (
    <>
      {(shown.length > 0 || (t.dateLabel && entry.occurred_on)) && (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {t.dateLabel && entry.occurred_on && <Item label={t.dateLabel} value={onDay(entry.occurred_on)} />}
          {shown.map((f) => (
            <Item
              key={f.name}
              label={f.label}
              value={f.type === "date" ? onDay(entry.fields[f.name]) : `${entry.fields[f.name]}${f.unit ? ` ${f.unit}` : ""}`}
              wide={f.type === "textarea"}
            />
          ))}
        </dl>
      )}
      {entry.body && (
        <div className="flex flex-col gap-1">
          {t.bodyLabel && <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t.bodyLabel}</p>}
          <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{entry.body}</p>
        </div>
      )}
    </>
  );
  if (sealed(entry.fields, today))
    return (
      <details className="rounded-xl border border-dashed p-4">
        <summary className="cursor-pointer font-medium">Sealed until {onDay(entry.fields.open_on)}. Open it anyway</summary>
        <div className="mt-4 flex flex-col gap-6">{contents}</div>
      </details>
    );
  return <div className="flex flex-col gap-6">{contents}</div>;
}

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

/** Where to go for a page: the one written, or a new one for that slot. */
export const slotHref = (entry: { id: string } | undefined, key: TemplateKey, person: PersonKey | null, period: number | null) =>
  entry
    ? `/voyage/page/${entry.id}`
    : `/voyage/page/new?template=${key}${person ? `&person=${encodeURIComponent(person)}` : ""}${period === null ? "" : `&period=${period}`}`;

/** A page in a book's contents: solid once written, dashed while it's waiting. */
export function Chip({ href, filled, children, title }: { href: string; filled: boolean; children: React.ReactNode; title?: string }) {
  return (
    <Link
      href={href}
      title={title}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        filled ? "border-foreground bg-foreground text-background hover:opacity-90" : "border-dashed text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/** Photos, each opening full size; a bin on the ones this person may remove. */
export function PhotoGrid({ photos, canDelete }: { photos: Photo[]; canDelete: (p: Photo) => boolean }) {
  if (photos.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {photos.map((p) => (
        <li key={p.id} className="relative overflow-hidden rounded-xl bg-muted">
          {p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {/* Private, signed links: next/image's optimiser can't fetch them anyway. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            </a>
          )}
          {canDelete(p) && (
            <ActionForm action={deletePhoto.bind(null, p.id)} confirm="Remove this photo?" className="absolute right-1.5 top-1.5">
              <Button size="icon" variant="secondary" className="size-8 rounded-full bg-background/90" aria-label="Remove photo">
                <Trash2 aria-hidden />
              </Button>
            </ActionForm>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Next to "Add photos": pick ones already in Portraits instead. */
export function FromPortraits({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold hover:bg-muted">
      <Images className="size-4" aria-hidden /> From Portraits
    </Link>
  );
}
