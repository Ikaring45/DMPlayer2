import type { Track } from "../types";

export type TrackSearchFilter = "all" | "favorites" | "lossless" | "hires" | "unplayed";

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesFilter(track: Track, filter: TrackSearchFilter): boolean {
  if (filter === "favorites") return track.favorite;
  if (filter === "lossless") return track.lossless === true
    || /\.(?:flac|alac|wav|wave|aiff?|aifc)$/i.test(track.fileName)
    || /audio\/(?:flac|alac|wav|wave|aiff)/i.test(track.fileType);
  if (filter === "hires") {
    return (track.sampleRate ?? 0) > 48_000 || (track.bitsPerSample ?? 0) > 16;
  }
  if (filter === "unplayed") return track.playCount === 0;
  return true;
}

function searchScore(track: Track, query: string): number {
  const title = normalizeSearchText(track.title);
  const artist = normalizeSearchText(track.artist ?? "");
  const album = normalizeSearchText(track.album ?? "");
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  if (artist.startsWith(query)) return 3;
  if (artist.includes(query)) return 4;
  if (album.startsWith(query)) return 5;
  return 6;
}

export function searchTracks(
  tracks: Track[],
  query: string,
  filter: TrackSearchFilter = "all",
): Track[] {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  return tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => {
      if (!matchesFilter(track, filter)) return false;
      if (!tokens.length) return true;
      const haystack = normalizeSearchText([
        track.title,
        track.artist,
        track.album,
        track.fileName,
        track.codec,
        track.container,
      ].filter(Boolean).join(" "));
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((left, right) => {
      if (!normalizedQuery) return left.index - right.index;
      return searchScore(left.track, normalizedQuery) - searchScore(right.track, normalizedQuery)
        || left.index - right.index;
    })
    .map(({ track }) => track);
}

export function appendUniqueIds(existing: string[], additions: string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const id of additions) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function insertNextId(ids: string[], id: string, currentId?: string): string[] {
  if (id === currentId) return ids;
  const clean = ids.filter((item) => item !== id);
  const currentIndex = clean.indexOf(currentId ?? "");
  clean.splice(currentIndex >= 0 ? currentIndex + 1 : 0, 0, id);
  return clean;
}

export function moveQueueId(ids: string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length || from === to) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function sanitizeIdList(value: unknown, validIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && validIds.has(id));
  return appendUniqueIds([], ids);
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export async function createContentHash(data: ArrayBuffer): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}
