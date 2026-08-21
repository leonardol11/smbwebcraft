export const STOCK_IMAGE_COUNT = 3;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function stockFallbackUrls(seed: string): string[] {
  return Array.from({ length: STOCK_IMAGE_COUNT }, (_, i) => {
    const token = `${seed}-${i + 1}`;
    return `https://picsum.photos/seed/${encodeURIComponent(token)}/800/600`;
  });
}

/**
 * Prefer Places photo HTTP(S) URLs. Resource names (places/.../photos/...)
 * are not public URLs, so they fall through to deterministic stock images.
 */
export function galleryImages(photoUrls: string[] | undefined, seed: string): string[] {
  const fromPlaces = (photoUrls ?? []).filter(isHttpUrl).slice(0, 6);
  if (fromPlaces.length > 0) return fromPlaces;
  return stockFallbackUrls(seed);
}
