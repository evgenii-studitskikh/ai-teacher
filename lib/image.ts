// Photo handling for the toy scanner. Native camera photos are multi-megabyte;
// we downscale in the browser before upload so we stay well under Anthropic's
// image limits and keep latency and credit spend down.

// Pure: the target dimensions that fit within `max` on the longest side while
// preserving aspect ratio. Separated out so it can be unit-tested without a DOM.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Browser-only: decode `file`, draw it downscaled onto a canvas, and return
// base64 JPEG WITHOUT the "data:image/jpeg;base64," prefix (what the
// identify-toy route and the Anthropic image block expect).
export async function downscaleImage(
  file: File,
  max = 1024,
): Promise<{ data: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the photo on this device.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return { data: dataUrl.split(",")[1] ?? "", mediaType: "image/jpeg" };
}
