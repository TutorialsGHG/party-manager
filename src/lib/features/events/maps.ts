export function getAppleMapsUrl(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

export function getOsmUrl(query: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

export function getGoogleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}