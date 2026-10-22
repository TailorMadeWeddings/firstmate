"use client";

import { FolderInput } from "lucide-react";
import { useState, useTransition } from "react";
import { shrink } from "@/lib/photos";
import { PORTRAITS_BUCKET, type UpdatePhoto, updateKey } from "@/lib/school-updates";
import { readExport } from "@/lib/storypark";
import { createClient } from "@/lib/supabase/client";
import { importedSchoolUpdates, knownSchoolPhotos, refreshVoyage, saveSchoolUpdate } from "./actions";

const LIMIT = 10 * 1024 * 1024;

const sha256 = async (file: Blob) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Pick an unzipped Storypark export ("Export portfolio") and every story and
 * note in it becomes a School update in this child's book, its photos kept
 * once in Portraits (see lib/school-updates.ts).
 * Ones already imported are skipped, so each new export can be picked again.
 */
export function StoryparkImport({ householdId, dependentId, name }: { householdId: string; dependentId: string; name: string }) {
  const [busy, start] = useTransition();
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<string | null>(null);

  const run = (files: File[]) =>
    start(async () => {
      setReport(null);
      const supabase = createClient();
      const at = (f: File) => f.webkitRelativePath || f.name;
      const byPath = new Map(files.map((f) => [at(f).toLowerCase(), f]));
      const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
      // stories_index.html and notes_index.html, each with every story (or note) in it, oldest last.
      const pages = files.filter((f) => /\.html?$/i.test(f.name));
      const stories = (await Promise.all(pages.map(async (page) => readExport(await page.text()).map((story) => ({ page, story }))))).flat();
      if (stories.length === 0) return setReport("No stories in that folder. Pick the unzipped export folder, the one with stories_index.html in it.");
      const seen = new Set(await importedSchoolUpdates(dependentId));
      let added = 0;
      let skipped = 0;
      let videos = 0;
      const problems: string[] = [];

      /** A photo a page links to: beside the page, or anywhere in the export by name. */
      const photoFor = (page: File, src: string) => {
        const joined = decodeURIComponent(new URL(src.split(/[?#]/)[0], `file:///${at(page)}`).pathname.slice(1)).toLowerCase();
        return byPath.get(joined) ?? byName.get(joined.split("/").pop()!);
      };
      const upload = async (blob: Blob) => {
        const path = `${householdId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(PORTRAITS_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        return path;
      };

      for (const [i, { page, story }] of stories.entries()) {
        setProgress(` ${i + 1} of ${stories.length}`);
        const key = updateKey(story.title, story.date);
        if (seen.has(key)) {
          skipped++;
          continue;
        }
        seen.add(key);
        videos += story.videos;
        try {
          const found = story.images.map((src) => {
            const file = photoFor(page, src);
            if (!file) throw new Error(`a photo isn't in the folder (${src})`);
            return file;
          });
          // Each photo once, by its fingerprint; the ones Portraits already has (the twins' shared stories) aren't uploaded again.
          const hashed = new Map(await Promise.all(found.map(async (file) => [await sha256(file), file] as const)));
          const known = new Set(await knownSchoolPhotos([...hashed.keys()]));
          const photos: UpdatePhoto[] = [];
          for (const [hash, file] of hashed) {
            // Originals when they fit; anything else as a sensible JPEG.
            const blob = file.type === "image/jpeg" && file.size <= LIMIT ? file : await shrink(file);
            // ponytail: if an upload fails partway, this story's earlier files stay in storage unseen; rare, and small.
            photos.push({ sha256: hash, path: known.has(hash) ? null : await upload(blob) });
          }
          const problem = await saveSchoolUpdate(dependentId, story, photos);
          if (problem) throw new Error(problem);
          added++;
        } catch (e) {
          problems.push(`${story.title}: ${(e as Error).message}`);
        }
      }
      await refreshVoyage();
      setReport(
        [
          `Added ${added} ${added === 1 ? "update" : "updates"} to ${name}'s book${skipped ? `; ${skipped} were already here` : ""}.`,
          videos ? `${videos} videos weren't imported (photos only); they're still in the export folder.` : "",
          problems.length ? `These were left out, so importing again will retry them:\n${problems.join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    });

  return (
    <div className="flex flex-col gap-2">
      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
        <FolderInput className="size-4" aria-hidden /> {busy ? `Importing${progress}…` : "Import from Storypark"}
        <input
          type="file"
          // A whole folder: the export unzipped. React doesn't know the attribute, so it's spelled out.
          {...{ webkitdirectory: "" }}
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) run(files);
          }}
        />
      </label>
      {report && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{report}</p>}
    </div>
  );
}
