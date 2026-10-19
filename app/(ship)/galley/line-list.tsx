"use client";

import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Row = { key: number; text: string };

/**
 * An editable list, one line per item: Enter adds the next line, pasting
 * several lines makes several items, Backspace on an empty line removes it.
 * Drag the handle (or use the arrows) to reorder. The form still gets one
 * item per line in a hidden field, so saving is unchanged.
 */
export function LineList({
  name,
  legend,
  hint,
  initial,
  placeholder,
  multiline = false,
}: {
  name: string;
  legend: string;
  hint: string;
  initial: string[];
  placeholder: string;
  multiline?: boolean;
}) {
  const next = useRef(0);
  const row = (text: string): Row => ({ key: next.current++, text });
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial : [""]).map(row));
  const [dragging, setDragging] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const fields = useRef(new Map<number, HTMLInputElement | HTMLTextAreaElement>());

  useEffect(() => {
    if (focus === null) return;
    fields.current.get(focus)?.focus();
    setFocus(null);
  }, [focus]);

  const insertAfter = (i: number, texts: string[]) => {
    const added = texts.map(row);
    setRows((rs) => [...rs.slice(0, i + 1), ...added, ...rs.slice(i + 1)]);
    setFocus(added[added.length - 1].key);
  };
  const move = (from: number, to: number) =>
    setRows((rs) => {
      if (to < 0 || to >= rs.length || from === to) return rs;
      const copy = [...rs];
      copy.splice(to, 0, copy.splice(from, 1)[0]);
      return copy;
    });
  const remove = (i: number) => {
    setRows((rs) => (rs.length === 1 ? [row("")] : rs.filter((_, n) => n !== i)));
    setFocus(rows[i - 1]?.key ?? rows[i + 1]?.key ?? null);
  };
  const set = (i: number, text: string) => setRows((rs) => rs.map((r, n) => (n === i ? { ...r, text } : r)));

  const field =
    "w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";
  const icon = "rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium leading-none">{legend}</legend>
      <input type="hidden" name={name} value={rows.map((r) => r.text.replace(/\n/g, " ")).join("\n")} />
      <ol className="grid gap-1.5">
        {rows.map((r, i) => {
          const props = {
            ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
              if (el) fields.current.set(r.key, el);
              else fields.current.delete(r.key);
            },
            value: r.text,
            "aria-label": `${legend.split(",")[0]} ${i + 1}`,
            placeholder: i === 0 ? placeholder : undefined,
            className: field,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(i, e.target.value),
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                insertAfter(i, [""]);
              } else if (e.key === "Backspace" && r.text === "" && rows.length > 1) {
                e.preventDefault();
                remove(i);
              }
            },
            onPaste: (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              const lines = e.clipboardData.getData("text").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
              if (lines.length < 2) return;
              e.preventDefault();
              // The first line goes where the cursor is; the rest become new items after this one.
              const { selectionStart: from, selectionEnd: to } = e.currentTarget;
              set(i, r.text.slice(0, from ?? r.text.length) + lines[0] + r.text.slice(to ?? r.text.length));
              insertAfter(i, lines.slice(1));
            },
          };
          return (
            <li
              key={r.key}
              className={`flex items-start gap-1 rounded-lg ${dragging === i ? "opacity-50" : ""}`}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                if (dragging !== i) {
                  move(dragging, i);
                  setDragging(i);
                }
              }}
            >
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", r.text);
                  setDragging(i);
                }}
                onDragEnd={() => setDragging(null)}
                className="hidden cursor-grab self-center p-1 text-muted-foreground active:cursor-grabbing sm:block"
                title="Drag to reorder"
                aria-hidden
              >
                <GripVertical className="size-4" />
              </span>
              {multiline && <span className="w-5 shrink-0 pt-2 text-right font-serif text-sm font-black italic text-primary dark:text-blue-400">{i + 1}</span>}
              {multiline ? <textarea rows={2} {...props} /> : <input {...props} />}
              <span className="flex shrink-0 items-center pt-0.5">
                <button type="button" className={icon} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${i + 1} up`}>
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" className={icon} onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} aria-label={`Move ${i + 1} down`}>
                  <ArrowDown className="size-4" aria-hidden />
                </button>
                <button type="button" className={icon} onClick={() => remove(i)} aria-label={`Remove ${i + 1}`}>
                  <X className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{hint}</p>
        <button type="button" onClick={() => insertAfter(rows.length - 1, [""])} className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline dark:text-blue-400">
          <Plus className="size-4" aria-hidden /> Add
        </button>
      </div>
    </fieldset>
  );
}
