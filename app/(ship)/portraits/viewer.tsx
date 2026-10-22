"use client";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * One photo on black, as big as it fits: arrow keys or a swipe for the next
 * and previous, Escape to go back, and a button for the whole screen.
 */
export function Viewer({ url, caption, prev, next, back }: { url: string | null; caption: string | null; prev: string | null; next: string | null; back: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev);
      else if (e.key === "ArrowRight" && next) router.push(next);
      else if (e.key === "Escape" && !document.fullscreenElement) router.push(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next, back]);

  const nav = "absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70";
  return (
    <div
      ref={box}
      className="relative flex h-[75vh] items-center justify-center overflow-hidden rounded-2xl bg-black [&:fullscreen]:h-screen [&:fullscreen]:rounded-none"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX);
        if (dx > 60 && prev) router.push(prev);
        if (dx < -60 && next) router.push(next);
      }}
    >
      {url ? (
        // Private, signed links: next/image's optimiser can't fetch them anyway.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={caption ?? ""} className="max-h-full max-w-full object-contain" />
      ) : (
        <p className="text-white/70">Couldn&apos;t load this photo.</p>
      )}
      {prev && (
        <Link href={prev} className={`${nav} left-3`} aria-label="Previous photo">
          <ChevronLeft aria-hidden />
        </Link>
      )}
      {next && (
        <Link href={next} className={`${nav} right-3`} aria-label="Next photo">
          <ChevronRight aria-hidden />
        </Link>
      )}
      <div className="absolute right-3 top-3 flex gap-2">
        <button
          type="button"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen())}
          className="flex size-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          aria-label="Full screen"
        >
          <Expand className="size-5" aria-hidden />
        </button>
        <Link href={back} className="flex size-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Close">
          <X className="size-5" aria-hidden />
        </Link>
      </div>
      {caption && <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-4 pt-10 text-center text-white">{caption}</p>}
    </div>
  );
}
