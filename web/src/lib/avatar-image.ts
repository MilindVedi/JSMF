import { AVATAR_SIZE_PX } from "@jsmf/core/api";

/** The largest picture we try to open; past this, decoding it can exhaust a phone browser's memory. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** A picture that can't become a profile picture; its message is shown as is. */
export class AvatarImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarImageError";
  }
}

/**
 * Turns a chosen picture into the profile picture we upload: its centre
 * square, at most AVATAR_SIZE_PX on a side, re-saved as JPEG.
 *
 * Redrawing it on a canvas keeps only the pixels, so the hidden metadata a
 * phone photo carries (EXIF: GPS location, device, time taken) never leaves
 * the browser; and a several-MB photo becomes a ~50–100 KB file. The server
 * checks type and size again on arrival; this is about privacy and speed,
 * not trust.
 */
export async function prepareAvatarJpeg(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new AvatarImageError("That picture is too large. Choose one under 25 MB.");
  }

  let image: ImageBitmap;
  try {
    // "from-image": a photo taken with the phone sideways is turned upright first.
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new AvatarImageError("That file isn't a picture we can open. Choose a JPEG, PNG or WebP.");
  }

  try {
    const side = Math.min(image.width, image.height);
    const size = Math.min(AVATAR_SIZE_PX, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new AvatarImageError("Your browser couldn't prepare that picture.");
    // JPEG has no transparency: a transparent PNG gets white behind it, not black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);

    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!jpeg) throw new AvatarImageError("Your browser couldn't prepare that picture.");
    return jpeg;
  } finally {
    image.close();
  }
}
