"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { slideshowPhotos } from "./actions";

const IDLE_MS = 5 * 60_000;
const SLIDE_MS = 10_000;

type Slide = Awaited<ReturnType<typeof slideshowPhotos>>[number];

const onDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The kitchen screen as a photo frame: after a few minutes with no taps, the
 * family's photos fill the screen, one at a time, until someone touches it.
 * Not while cooking, when nobody touches the screen for minutes on end.
 */
export function Slideshow() {
  const cooking = usePathname().endsWith("/cook");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [at, setAt] = useState(0);
  const [taps, setTaps] = useState(0);

  // Waiting: start after IDLE_MS of quiet. Showing: a key stops it, and so
  // does a tap, on the slideshow itself so it doesn't land on what's beneath.
  useEffect(() => {
    if (cooking) return;
    let timer: ReturnType<typeof setTimeout>;
    const restart = () => {
      clearTimeout(timer);
      setSlides([]);
      timer = setTimeout(async () => {
        const fresh = await slideshowPhotos().catch(() => []);
        setAt(0);
        setSlides(fresh);
      }, IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, restart, { passive: true }));
    restart();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, restart));
    };
  }, [cooking, taps]);

  // The next photo every SLIDE_MS, warmed up a slide ahead; fresh links after the last.
  useEffect(() => {
    if (slides.length === 0) return;
    const next = slides[(at + 1) % slides.length];
    new Image().src = next.url!;
    const timer = setTimeout(async () => {
      if (at + 1 < slides.length) return setAt(at + 1);
      const fresh = await slideshowPhotos().catch(() => slides);
      setAt(0);
      setSlides(fresh);
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [slides, at]);

  const slide = slides[at];
  if (!slide) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      role="button"
      aria-label="Photo slideshow. Tap to stop."
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={() => setTaps((n) => n + 1)}
    >
      {/* Private, signed links: next/image's optimiser can't fetch them anyway. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={slide.url} src={slide.url!} alt={slide.caption ?? ""} className="max-h-full max-w-full animate-in fade-in object-contain duration-1000" />
      <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-8 pt-16 text-center text-lg text-white">
        {slide.caption && <span className="block font-serif text-2xl">{slide.caption}</span>}
        <span className="text-white/70">{onDay(slide.taken_on)}</span>
      </p>
    </div>
  );
}
