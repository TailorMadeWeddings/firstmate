"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { shrink } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

/**
 * Add, change or remove a photo (a recipe's, a person's): uploaded to
 * bucket under folder/, then save records it. Storage's own policies check
 * it's yours to change.
 */
export function PhotoPicker({
  bucket,
  folder,
  save,
  hasPhoto,
}: {
  bucket: string;
  folder: string;
  save: (path: string | null) => Promise<string | null>;
  hasPhoto: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const upload = (file: File) =>
    start(async () => {
      setProblem(null);
      const supabase = createClient();
      const path = `${folder}/${crypto.randomUUID()}.jpg`;
      try {
        const { error } = await supabase.storage.from(bucket).upload(path, await shrink(file), { contentType: "image/jpeg" });
        if (error) throw error;
      } catch {
        setProblem("Couldn't upload that photo. Try a different one.");
        return;
      }
      const failed = await save(path);
      if (failed) {
        await supabase.storage.from(bucket).remove([path]);
        setProblem(failed);
        return;
      }
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      setProblem((await save(null)) ?? null);
      router.refresh();
    });

  const button = "flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-sm font-semibold shadow-sm backdrop-blur hover:bg-background";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={`${button} cursor-pointer focus-within:ring-2 focus-within:ring-ring`}>
        <Camera className="size-4" aria-hidden /> {busy ? "Saving…" : hasPhoto ? "Change photo" : "Add a photo"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
      </label>
      {hasPhoto && !busy && (
        <button type="button" onClick={remove} className={button} aria-label="Remove photo">
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
      {problem && (
        <p role="alert" className="rounded-md bg-background/90 px-2 py-1 text-sm text-red-600">
          {problem}
        </p>
      )}
    </div>
  );
}
