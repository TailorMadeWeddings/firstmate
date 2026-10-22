// Portraits, the family's photos: which photos a page shows, and the date a
// photo was taken, read from the camera's own record in the file. Pure, so
// the browser and the tests can use it.
import { type PersonKey, isPersonKey } from "./medical.ts";

/** Which photos a page shows: an album's, someone's, a tag's, or all of them. */
export type Filter = { album: string } | { person: PersonKey } | { word: string } | Record<string, never>;

/** The filter in a page's address (?album=, ?person=, ?tag=), checked. */
export function readFilter(q: { album?: string; person?: string; tag?: string }): Filter {
  if (q.album && /^[0-9a-f-]{36}$/.test(q.album)) return { album: q.album };
  if (isPersonKey(q.person)) return { person: q.person };
  if (q.tag?.trim()) return { word: q.tag.trim().toLowerCase() };
  return {};
}

/** The same filter, back as an address query ("" for all photos). */
export const filterQuery = (f: Filter) =>
  "album" in f ? `?album=${f.album}` : "person" in f ? `?person=${encodeURIComponent(f.person)}` : "word" in f ? `?tag=${encodeURIComponent(f.word)}` : "";

const DATE_TAKEN = 0x9003; // DateTimeOriginal, in the Exif section
const DATE_CHANGED = 0x0132; // DateTime, in the main section: the fallback
const EXIF_SECTION = 0x8769;

/**
 * The day a JPEG was taken (YYYY-MM-DD) from its Exif record, or null if it
 * has none, or it can't be read. Reads only the record near the start of the file.
 */
export function exifDate(buf: ArrayBuffer): string | null {
  try {
    return findDate(new DataView(buf));
  } catch {
    return null; // a damaged record: the photo is still fine
  }
}

function findDate(v: DataView): string | null {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 4 <= v.byteLength) {
    const marker = v.getUint16(at);
    const size = v.getUint16(at + 2);
    if (marker === 0xffe1 && v.getUint32(at + 4) === 0x45786966) return fromTiff(v, at + 10, Math.min(v.byteLength, at + 2 + size));
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null; // not a marker, or the picture itself has started
    at += 2 + size;
  }
  return null;
}

function fromTiff(v: DataView, tiff: number, end: number): string | null {
  if (tiff + 8 > end) return null;
  const little = v.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => v.getUint16(tiff + o, little);
  const u32 = (o: number) => v.getUint32(tiff + o, little);
  /** Each entry in the section at offset `ifd`: its tag, and where its value or the pointer to it is. */
  const entries = (ifd: number) => {
    if (tiff + ifd + 2 > end) return [];
    return Array.from({ length: u16(ifd) }, (_, i) => ifd + 2 + i * 12)
      .filter((e) => tiff + e + 12 <= end)
      .map((e) => ({ tag: u16(e), value: e + 8 }));
  };
  const text = (entry: { value: number }) => {
    const o = tiff + u32(entry.value);
    if (o + 19 > end) return null;
    const s = String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + o, 19));
    const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(s);
    return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : null;
  };
  const main = entries(u32(4));
  const exif = main.find((e) => e.tag === EXIF_SECTION);
  const taken = exif && entries(u32(exif.value)).find((e) => e.tag === DATE_TAKEN);
  const changed = main.find((e) => e.tag === DATE_CHANGED);
  return (taken && text(taken)) || (changed && text(changed)) || null;
}

/** "Last year", "3 years ago": how long ago a day was, on the same date. */
export const yearsAgo = (day: string, today: string) => {
  const n = Number(today.slice(0, 4)) - Number(day.slice(0, 4));
  return n === 1 ? "Last year" : `${n} years ago`;
};
