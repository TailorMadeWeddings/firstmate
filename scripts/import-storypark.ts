// One-off: load the back data from a child's Storypark export ("Export
// portfolio", unzipped) into their Voyage book as School updates, the same way
// the "Import from Storypark" button does (lib/school-updates.ts), for exports
// too big to want to sit through in a browser.
//   node --env-file=.env.local scripts/import-storypark.ts "<export folder>" "<child's name>"          # dry run
//   node --env-file=.env.local scripts/import-storypark.ts "<export folder>" "<child's name>" --write  # for real
// Updates already in the book are skipped and photos Portraits already has
// aren't uploaded again, so it's safe to run again, and for each twin.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PORTRAITS_BUCKET, type UpdatePhoto, importedUpdates, knownPhotos, saveUpdate, updateKey } from "../lib/school-updates.ts";
import { readExport } from "../lib/storypark.ts";

const [folder, childName, flag] = process.argv.slice(2);
if (!folder || !childName) throw new Error('Usage: import-storypark.ts <export folder> "<child\'s name>" [--write]');
const write = flag === "--write";

const files = readdirSync(folder, { recursive: true, encoding: "utf8" }).map((f) => join(folder, f)).filter((f) => statSync(f).isFile());
const byPath = new Map(files.map((f) => [f.toLowerCase(), f]));
const byName = new Map(files.map((f) => [basename(f).toLowerCase(), f]));
const stories = files.filter((f) => /\.html?$/i.test(f)).flatMap((page) => readExport(readFileSync(page, "utf8")));

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
// ponytail: first household and its first Captain; v1 has just the one.
const { data: captain, error: who } = await db.from("household_members").select("household_id, profile_id").eq("role", "owner").limit(1).single();
if (who) throw who;
const { data: kids, error: noKids } = await db.from("dependents").select("id, display_name").eq("household_id", captain.household_id);
if (noKids) throw noKids;
const child = kids.find((k) => k.display_name.trim().toLowerCase() === childName.trim().toLowerCase());
if (!child) throw new Error(`No child called "${childName}". The crew's children: ${kids.map((k) => k.display_name).join(", ")}`);
const to = { household: captain.household_id, dependent: child.id, by: captain.profile_id };
const seen = await importedUpdates(db, child.id);

/** A photo's file: beside stories_index.html (in Files/), or anywhere in the export by name. */
const photoFile = (src: string) => {
  const local = decodeURIComponent(src.split(/[?#]/)[0]);
  const path = byPath.get(join(folder, local).toLowerCase()) ?? byName.get(basename(local).toLowerCase());
  if (!path) throw new Error(`${src}: not in the export`);
  const bytes = readFileSync(path);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`${src}: not a JPEG`);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error(`${src}: over 10 MB`);
  return bytes;
};

let added = 0;
let skipped = 0;
let uploaded = 0;
let reused = 0;
let videos = 0;
const problems: string[] = [];
for (const [i, story] of stories.entries()) {
  const key = updateKey(story.title, story.date);
  if (seen.has(key)) {
    skipped++;
    continue;
  }
  seen.add(key);
  videos += story.videos;
  const paths: string[] = [];
  try {
    // Each photo once, by its fingerprint.
    const hashed = new Map(story.images.map((src) => {
      const bytes = photoFile(src);
      return [createHash("sha256").update(bytes).digest("hex"), bytes] as const;
    }));
    const known = await knownPhotos(db, to.household, [...hashed.keys()]);
    if (!write) {
      console.log(`${story.date}  ${story.title} — ${hashed.size} photos (${hashed.size - known.size} new)${story.videos ? `, ${story.videos} videos left out` : ""}`);
      added++;
      continue;
    }
    const photos: UpdatePhoto[] = [];
    for (const [sha256, bytes] of hashed) {
      if (known.has(sha256)) {
        photos.push({ sha256, path: null });
        reused++;
        continue;
      }
      const path = `${to.household}/${randomUUID()}.jpg`;
      const { error } = await db.storage.from(PORTRAITS_BUCKET).upload(path, bytes, { contentType: "image/jpeg" });
      if (error) throw error;
      paths.push(path);
      photos.push({ sha256, path });
    }
    const failed = await saveUpdate(db, to, story, photos);
    if (failed) throw new Error(failed.message);
    uploaded += paths.length;
    added++;
    process.stdout.write(`\r${i + 1} of ${stories.length}`);
  } catch (e) {
    if (paths.length) await db.storage.from(PORTRAITS_BUCKET).remove(paths);
    problems.push(`${story.date} ${story.title}: ${(e as Error).message}`);
  }
}

console.log(`\n${write ? "Added" : "Would add"} ${added} updates to ${child.display_name}'s book; skipped ${skipped} already there.`);
if (write) console.log(`Photos: ${uploaded} uploaded to Portraits, ${reused} already there (tagged with ${child.display_name} too).`);
if (videos) console.log(`${videos} videos aren't imported (photos only); they're still in the export folder.`);
if (problems.length) console.log(`Problems (left out; run again to retry):\n  ${problems.join("\n  ")}`);
