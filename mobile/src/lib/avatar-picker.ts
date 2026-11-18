import { requireOptionalNativeModule } from "expo";
import { AVATAR_SIZE_PX } from "@jsmf/core/api";

/**
 * Whether this build of the app can pick and prepare a photo. The picker and
 * the resizer are native modules added after the first development builds;
 * on a build without them, importing either throws, so Profile checks this
 * and hides "Change photo" instead of crashing. A new build brings them.
 */
export const canPickAvatar =
  requireOptionalNativeModule("ExponentImagePicker") !== null &&
  requireOptionalNativeModule("ExpoImageManipulator") !== null;

/**
 * Lets the student choose a photo and turns it into the profile picture we
 * upload: square (the system crop screen, then the centre if it is still not
 * square), at most AVATAR_SIZE_PX on a side, re-saved as JPEG.
 *
 * Re-saving keeps only the pixels, so a phone photo's hidden metadata (EXIF:
 * GPS location, device, time taken) never leaves the phone, and a
 * several-MB photo becomes a ~50–100 KB file. The library opens in the
 * system's photo picker, which needs no storage permission. Null when the
 * student cancels.
 */
export async function pickAvatarJpeg(): Promise<{ uri: string; jpeg: Blob } | null> {
  // Loaded here, never at the top: see canPickAvatar.
  const ImagePicker = await import("expo-image-picker");
  const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    shape: "oval",
    quality: 1,
    exif: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width !== asset.height) {
    context.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  if (side > AVATAR_SIZE_PX) context.resize({ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX });
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    // A Blob is what the upload sends (XMLHttpRequest, as on the web).
    const jpeg = await (await fetch(saved.uri)).blob();
    return { uri: saved.uri, jpeg };
  } finally {
    context.release();
    image.release();
  }
}
