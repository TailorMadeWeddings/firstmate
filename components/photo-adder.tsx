"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dayKey } from "@/lib/logbook";
import { shrink } from "@/lib/photos";
import { exifDate } from "@/lib/portraits";
import { createClient } from "@/lib/supabase/client";

/**
 * Add photos (several at once): each goes into the bucket under
 * <household>/, then `save` records it with the day it was taken (from the
 * camera's record in the file, else the file's date), returning a problem or null.
 * Storage's own policies check it's your household. Used by Voyage and Portraits.
 */
export function PhotoAdder({ bucket, householdId, save }: { bucket: string; householdId: string; save: (path: string, takenOn: string | null) => Promise<string | null> }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [progress, setProgress] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const upload = (files: File[]) =>
    start(async () => {
      setProblem(null);
      const supabase = createClient();
      let failed = 0;
      for (const [i, file] of files.entries()) {
        setProgress(files.length > 1 ? ` ${i + 1} of ${files.length}` : "");
        const path = `${householdId}/${crypto.randomUUID()}.jpg`;
        let takenOn: string | null = null;
        try {
          // Before shrinking: the shrunk copy loses the camera's record.
          takenOn = exifDate(await file.slice(0, 256 * 1024).arrayBuffer()) ?? (file.lastModified ? dayKey(new Date(file.lastModified)) : null);
          const { error } = await supabase.storage.from(bucket).upload(path, await shrink(file), { contentType: "image/jpeg" });
          if (error) throw error;
        } catch {
          failed++;
          continue;
        }
        if (await save(path, takenOn)) {
          await supabase.storage.from(bucket).remove([path]);
          failed++;
        }
      }
      if (failed) setProblem(failed === files.length ? "Couldn't upload that. Try a different photo." : `${failed} of ${files.length} photos didn't upload.`);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
        <ImagePlus className="size-4" aria-hidden /> {busy ? `Uploading${progress}…` : "Add photos"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) upload(files);
          }}
        />
      </label>
      {problem && (
        <p role="alert" className="text-sm text-red-600">
          {problem}
        </p>
      )}
    </div>
  );
}
