import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TZ, textOn } from "@/lib/logbook";
import { PROFILE_PHOTO_BUCKET } from "@/lib/photos";
import { currentProfileMember } from "@/lib/players";
import { createClient } from "@/lib/supabase/server";
import { loadCrew } from "../logbook/data";
import { addFeed, removeFeed, saveProfile, setProfilePhoto } from "./actions";
import { CalendarLink } from "./calendar-link";

export const metadata: Metadata = { title: "Profile · First Mate" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Profile />
    </Suspense>
  );
}

type ProfileRow = { display_name: string; phone: string | null; date_of_birth: string | null; photo_path: string | null };
type FeedRow = { id: string; name: string; url: string; synced_at: string | null; problem: string | null };
type LinkRow = { created_at: string; last_used_at: string | null };

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

async function Profile() {
  const member = await currentProfileMember();
  const supabase = await createClient();
  const [{ data: claims }, profile, feeds, link, crew] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("profiles").select("display_name, phone, date_of_birth, photo_path").eq("id", member.id).single<ProfileRow>(),
    supabase.from("calendar_feeds").select("id, name, url, synced_at, problem").order("created_at").returns<FeedRow[]>(),
    supabase.from("calendar_links").select("created_at, last_used_at").maybeSingle<LinkRow>(),
    loadCrew(member.householdId),
  ]);
  if (profile.error) throw profile.error;
  const me = profile.data;
  // The colour the Logbook gives you, even if you've never picked one.
  const colour = crew.find((c) => c.kind === "profile" && c.id === member.id)?.color ?? "#2a78d6";
  const photo = me.photo_path ? (await supabase.storage.from(PROFILE_PHOTO_BUCKET).createSignedUrl(me.photo_path, 3600)).data?.signedUrl : null;
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Profile</p>
        <h1 className="text-4xl">{me.display_name}</h1>
      </header>

      <section aria-labelledby="details" className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex flex-col items-center gap-3">
          {photo ? (
            // Private, signed links: next/image's optimiser can't fetch them anyway.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-28 rounded-full object-cover" />
          ) : (
            <span
              className="flex size-28 items-center justify-center rounded-full font-serif text-5xl font-black italic"
              style={{ background: colour, color: textOn(colour) }}
              aria-hidden
            >
              {me.display_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <PhotoPicker bucket={PROFILE_PHOTO_BUCKET} folder={member.id} save={setProfilePhoto} hasPhoto={Boolean(me.photo_path)} />
        </div>
        <ActionForm action={saveProfile} reset={false} className="grid flex-1 gap-3 sm:grid-cols-2">
          <h2 id="details" className="sr-only">
            Your details
          </h2>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={me.display_name} required maxLength={60} autoComplete="name" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="phone">Mobile</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={me.phone ?? ""} autoComplete="tel" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="born">Birthday</Label>
            <Input id="born" name="date_of_birth" type="date" defaultValue={me.date_of_birth ?? ""} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={String(claims?.claims.email ?? "")} readOnly disabled />
            <p className="text-xs text-muted-foreground">The one you sign in with.</p>
          </div>
          <div className="grid content-start gap-1">
            <Label htmlFor="colour">Colour</Label>
            <Input id="colour" name="color" type="color" defaultValue={colour} className="h-9 w-16 p-1" />
          </div>
          <Button className="justify-self-start sm:col-span-2">Save</Button>
        </ActionForm>
      </section>

      <section aria-labelledby="calendars-in" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="calendars-in" className="font-serif text-2xl font-black">
            Your other calendars
          </h2>
          <p className="text-sm text-muted-foreground">
            Work, school or anything else: paste a calendar&apos;s private ICS link and its events show on the Logbook in your colour, for the crew to
            see. It&apos;s read-only, and nothing goes back. Only you see the link.
          </p>
        </div>
        {(feeds.data ?? []).length > 0 && (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {(feeds.data ?? []).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{f.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {new URL(f.url).hostname}
                    {f.synced_at && ` · read ${when(f.synced_at)}`}
                  </span>
                  {f.problem && (
                    <span role="status" className="block text-xs text-red-600 dark:text-red-400">
                      {f.problem}
                    </span>
                  )}
                </span>
                <ActionForm action={removeFeed.bind(null, f.id)} confirm={`Stop showing ${f.name} on the Logbook?`}>
                  <Button size="sm" variant="ghost">
                    Remove
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addFeed} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
          <div className="grid w-40 gap-1">
            <Label htmlFor="feed-name">Name</Label>
            <Input id="feed-name" name="name" placeholder="Work" maxLength={60} />
          </div>
          <div className="grid min-w-56 flex-1 gap-1">
            <Label htmlFor="feed-url">ICS link</Label>
            <Input id="feed-url" name="url" type="url" inputMode="url" placeholder="https://… or webcal://…" required />
          </div>
          <Button>Add</Button>
          <details className="basis-full text-sm">
            <summary className="cursor-pointer font-medium">Where to find the link</summary>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
              <li>
                <b>Google Calendar:</b> on a computer, Settings → click the calendar under <b>Settings for my calendars</b> → <b>Integrate calendar</b> →
                copy <b>Secret address in iCal format</b>.
              </li>
              <li>
                <b>Outlook / Microsoft 365:</b> Settings → Calendar → <b>Shared calendars</b> → <b>Publish a calendar</b>, pick the calendar and{" "}
                <b>Can view all details</b>, Publish, then copy the <b>ICS</b> link.
              </li>
              <li>
                <b>iCloud:</b> in the Calendar app, tap <b>i</b> next to the calendar, turn on <b>Public Calendar</b> and share the link.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">New events show up within about 15 minutes of looking at the Logbook.</p>
          </details>
        </ActionForm>
      </section>

      <section aria-labelledby="calendar-out" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="calendar-out" className="font-serif text-2xl font-black">
            The Logbook on your phone
          </h2>
          <p className="text-sm text-muted-foreground">See the family&apos;s events in Google Calendar, Apple Calendar or Outlook, kept up to date.</p>
        </div>
        <CalendarLink linked={link.data ?? null} base={base} />
      </section>
    </div>
  );
}
