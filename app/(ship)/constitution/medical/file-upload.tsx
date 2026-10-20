"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { createClient } from "@/lib/supabase/client";
import { addFile } from "./actions";

const BUCKET = "medical-files";

/**
 * Adds a document (a results PDF, a letter, a photo of a certificate). The
 * browser uploads it straight to the household's private folder, where
 * storage's own policies allow only Captains; then it's recorded here.
 */
export function FileUpload({
  householdId,
  person,
  links,
}: {
  householdId: string;
  person: string;
  links: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const upload = (file: File) =>
    start(async () => {
      setProblem(null);
      if (file.size > 20 * 1024 * 1024) return setProblem("That file is over 20 MB.");
      const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
      const path = `${householdId}/${crypto.randomUUID()}${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) return setProblem("Couldn't upload that. PDFs and photos up to 20 MB work.");
      const failed = await addFile(person, {
        path,
        name: file.name,
        size: file.size,
        appointmentId: link.startsWith("appointment:") ? link.slice(12) : null,
        resultId: link.startsWith("result:") ? link.slice(7) : null,
      });
      if (failed) {
        await supabase.storage.from(BUCKET).remove([path]);
        return setProblem(failed);
      }
      setLink("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {links.length > 0 && (
          <NativeSelect value={link} onChange={(e) => setLink(e.target.value)} aria-label="What it's about" className="w-auto max-w-full">
            <option value="">Not about a particular visit</option>
            {links.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </NativeSelect>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
          <Paperclip className="size-4" aria-hidden /> {busy ? "Uploading…" : "Add a document"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
        </label>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-red-600">
          {problem}
        </p>
      )}
    </div>
  );
}
