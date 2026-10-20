"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shrink } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/voyage";
import { addPhoto } from "./actions";

/** Add photos (several at once) to a page or a story. Storage's own policies check it's your household. */
export function PhotoAdder({ householdId, on }: { householdId: string; on: { entry_id: string } | { note_id: string } }) {
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
        try {
          const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, await shrink(file), { contentType: "image/jpeg" });
          if (error) throw error;
        } catch {
          failed++;
          continue;
        }
        if (await addPhoto(on, path)) {
          await supabase.storage.from(PHOTO_BUCKET).remove([path]);
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
