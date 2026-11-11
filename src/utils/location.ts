export interface Coords {
  latitude: number;
  longitude: number;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseCoords(latitude: unknown, longitude: unknown): Coords | null {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function parseEventDate(value: unknown, fallback: Date = new Date()): Date {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const maxFuture = Date.now() + 2 * 60 * 1000;
  if (date.getTime() > maxFuture) return fallback;
  return date;
}

export function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}
