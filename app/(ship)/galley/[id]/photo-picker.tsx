"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PHOTO_BUCKET } from "@/lib/galley";
import { createClient } from "@/lib/supabase/client";
import { setRecipePhoto } from "../actions";

const LONGEST_SIDE = 1600;

/** A phone photo, upright and shrunk to a sensible size, as a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, LONGEST_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/jpeg", 0.85));
}

/** Add, change or remove a recipe's photo. Storage's own policies check it's yours to change. */
export function PhotoPicker({ recipeId, hasPhoto }: { recipeId: string; hasPhoto: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const upload = (file: File) =>
    start(async () => {
      setProblem(null);
      const supabase = createClient();
      const path = `${recipeId}/${crypto.randomUUID()}.jpg`;
      try {
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, await shrink(file), { contentType: "image/jpeg" });
        if (error) throw error;
      } catch {
        setProblem("Couldn't upload that photo. Try a different one.");
        return;
      }
      const failed = await setRecipePhoto(recipeId, path);
      if (failed) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        setProblem(failed);
        return;
      }
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      setProblem((await setRecipePhoto(recipeId, null)) ?? null);
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
