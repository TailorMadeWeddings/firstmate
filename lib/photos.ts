// Phone photos for uploading, in the browser: upright, and shrunk to a
// sensible size. Used by the Galley and Voyage photo pickers.

const LONGEST_SIDE = 1600;

/** Where people's own photos live, under <profile id>/. */
export const PROFILE_PHOTO_BUCKET = "profile-photos";

/** A phone photo, upright and shrunk to a sensible size, as a JPEG. */
export async function shrink(file: File): Promise<Blob> {
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, LONGEST_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/jpeg", 0.85));
}
