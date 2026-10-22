import assert from "node:assert/strict";
import { test } from "node:test";
import { exifDate, filterQuery, readFilter, yearsAgo } from "./portraits.ts";

/** A JPEG start with an Exif record: DateTime in the main section, DateTimeOriginal in the Exif one. */
function jpeg(little: boolean, taken: string | null, changed: string | null): ArrayBuffer {
  const tiff = new DataView(new ArrayBuffer(200));
  const u16 = (o: number, n: number) => tiff.setUint16(o, n, little);
  const u32 = (o: number, n: number) => tiff.setUint32(o, n, little);
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => tiff.setUint8(o + i, c.charCodeAt(0)));
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  u16(2, 42);
  u32(4, 8); // main section at 8: two entries
  u16(8, 2);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    u16(at, tag);
    u16(at + 2, type);
    u32(at + 4, count);
    u32(at + 8, value);
  };
  entry(10, 0x0132, 2, 20, changed ? 100 : 0);
  entry(22, 0x8769, 4, 1, 50);
  u16(50, 1); // Exif section at 50: one entry
  entry(52, taken ? 0x9003 : 0x9999, 2, 20, 130);
  if (changed) ascii(100, changed);
  if (taken) ascii(130, taken);
  const head = [0xff, 0xd8, 0xff, 0xe1, 0x00, 208, 0x45, 0x78, 0x69, 0x66, 0, 0];
  const out = new Uint8Array(head.length + 200);
  out.set(head);
  out.set(new Uint8Array(tiff.buffer), head.length);
  return out.buffer;
}

test("portraits: the day a photo was taken", () => {
  assert.equal(exifDate(jpeg(false, "2019:12:25 08:30:00", "2020:01:02 10:00:00")), "2019-12-25");
  assert.equal(exifDate(jpeg(true, "2019:12:25 08:30:00", null)), "2019-12-25");
  assert.equal(exifDate(jpeg(true, null, "2020:01:02 10:00:00")), "2020-01-02");
  assert.equal(exifDate(jpeg(true, "0000:00:00 00:00:00", null)), null);
  assert.equal(exifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0]).buffer), null);
  assert.equal(exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);
  assert.equal(exifDate(jpeg(true, "2019:12:25 08:30:00", null).slice(0, 40)), null);
});

test("portraits: filters", () => {
  const album = "0b6f1c1e-3a52-4bd4-9a54-8d3f0c1d2e3f";
  assert.deepEqual(readFilter({ album }), { album });
  assert.deepEqual(readFilter({ album: "nope" }), {});
  assert.deepEqual(readFilter({ person: `d:${album}` }), { person: `d:${album}` });
  assert.deepEqual(readFilter({ tag: "  Beach " }), { word: "beach" });
  assert.equal(filterQuery({ word: "christmas 2025" }), "?tag=christmas%202025");
  assert.equal(filterQuery({}), "");
  assert.equal(yearsAgo("2025-10-22", "2026-10-22"), "Last year");
  assert.equal(yearsAgo("2020-10-22", "2026-10-22"), "6 years ago");
});
