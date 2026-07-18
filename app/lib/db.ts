import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { getAudioMimeType } from "./audio-formats";
import type { Playlist, Track } from "../types";

type PersistedTrack = Omit<Track, "blob" | "audioData" | "artwork">;
type LegacyPersistedTrack = PersistedTrack & {
  audioData?: unknown;
  blob?: unknown;
  artwork?: unknown;
};

type PersistedAudio = {
  id: string;
  data: ArrayBuffer;
  fileType: string;
};

interface DMPlayerDB extends DBSchema {
  tracks: { key: string; value: PersistedTrack; indexes: { "by-created": number } };
  audio: { key: string; value: PersistedAudio };
  playlists: { key: string; value: Playlist };
  settings: { key: string; value: unknown };
}

let databasePromise: Promise<IDBPDatabase<DMPlayerDB>> | undefined;

function database() {
  if (databasePromise) return databasePromise;
  const pending = openDB<DMPlayerDB>("dmplayer2", 2, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      const tracks = db.objectStoreNames.contains("tracks")
        ? transaction.objectStore("tracks")
        : db.createObjectStore("tracks", { keyPath: "id" });
      if (!tracks.indexNames.contains("by-created")) {
        tracks.createIndex("by-created", "createdAt");
      }
      if (!db.objectStoreNames.contains("audio")) {
        db.createObjectStore("audio", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("playlists")) {
        db.createObjectStore("playlists", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    },
    blocking(_currentVersion, _blockedVersion, event) {
      (event.target as IDBDatabase | null)?.close();
      databasePromise = undefined;
    },
    terminated() {
      databasePromise = undefined;
    },
  });
  databasePromise = pending;
  void pending.catch(() => {
    if (databasePromise === pending) databasePromise = undefined;
  });
  return pending;
}

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function asArrayBuffer(value: unknown): ArrayBuffer | undefined {
  if (value instanceof ArrayBuffer) return value;
  if (!ArrayBuffer.isView(value)) return undefined;
  const copy = new Uint8Array(value.byteLength);
  copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  return copy.buffer;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

async function binaryData(buffer: unknown, blob: unknown): Promise<ArrayBuffer | undefined> {
  const data = asArrayBuffer(buffer);
  if (data) return data;
  const blobValue = isBlob(blob) ? blob : isBlob(buffer) ? buffer : undefined;
  return blobValue?.arrayBuffer();
}

async function artworkData(record: LegacyPersistedTrack): Promise<ArrayBuffer | undefined> {
  const data = asArrayBuffer(record.artworkData);
  if (data) return data;
  if (!isBlob(record.artwork)) return undefined;
  return record.artwork.arrayBuffer();
}

function strippedTrack(
  record: LegacyPersistedTrack,
  id: string,
  normalizedArtworkData = asArrayBuffer(record.artworkData),
): PersistedTrack {
  const {
    audioData: _audioData,
    blob: _blob,
    artwork: _artwork,
    ...metadata
  } = record;
  void _audioData;
  void _blob;
  void _artwork;
  const fallbackName = `${id}.audio`;
  const fileName = typeof metadata.fileName === "string" && metadata.fileName.trim()
    ? metadata.fileName
    : fallbackName;
  const suppliedType = typeof metadata.fileType === "string" ? metadata.fileType : "";
  const createdAt = Number.isFinite(metadata.createdAt) ? metadata.createdAt : Date.now();
  return {
    ...metadata,
    id,
    title: typeof metadata.title === "string" && metadata.title.trim()
      ? metadata.title
      : fileName.replace(/\.[^.]+$/, ""),
    fileName,
    fileType: getAudioMimeType(fileName, suppliedType),
    fileSize: Number.isFinite(metadata.fileSize) ? metadata.fileSize : 0,
    favorite: metadata.favorite === true,
    playCount: Number.isFinite(metadata.playCount) ? metadata.playCount : 0,
    createdAt,
    updatedAt: Number.isFinite(metadata.updatedAt) ? metadata.updatedAt : createdAt,
    artworkData: normalizedArtworkData,
  };
}

function hydratedTrack(record: PersistedTrack): Track {
  const data = asArrayBuffer(record.artworkData);
  return {
    ...record,
    artworkData: data,
    artwork: data
      ? new Blob([data], { type: record.artworkType || "image/jpeg" })
      : undefined,
  };
}

async function hasAudio(db: IDBPDatabase<DMPlayerDB>, id: string) {
  return (await db.getKey("audio", id)) !== undefined;
}

type MigrationResult = {
  metadata: PersistedTrack;
  legacyAudio?: ArrayBuffer;
  audioAvailable: boolean;
};

async function prepareLegacyRecord(
  db: IDBPDatabase<DMPlayerDB>,
  key: string,
  rawRecord: LegacyPersistedTrack,
): Promise<MigrationResult> {
  const id = typeof rawRecord.id === "string" && rawRecord.id ? rawRecord.id : key;
  const [legacyAudio, normalizedArtworkData, storedAudioAvailable] = await Promise.all([
    binaryData(rawRecord.audioData, rawRecord.blob),
    artworkData(rawRecord),
    hasAudio(db, id),
  ]);
  const metadata = strippedTrack(rawRecord, id, normalizedArtworkData);
  const needsMigration =
    hasOwn(rawRecord, "audioData")
    || hasOwn(rawRecord, "blob")
    || hasOwn(rawRecord, "artwork");

  if (needsMigration) {
    try {
      const tx = db.transaction(["tracks", "audio"], "readwrite");
      const latest = await tx.objectStore("tracks").get(id) as LegacyPersistedTrack | undefined;
      if (!latest) {
        await tx.done;
        return { metadata, audioAvailable: false };
      }
      const currentAudioKey = await tx.objectStore("audio").getKey(id);
      const latestMetadata = strippedTrack(
        latest,
        id,
        asArrayBuffer(latest.artworkData)
          ?? (isBlob(latest.artwork) ? normalizedArtworkData : undefined),
      );
      if (legacyAudio && currentAudioKey === undefined) {
        await tx.objectStore("audio").put({
          id,
          data: legacyAudio,
          fileType: latestMetadata.fileType,
        });
      }
      await tx.objectStore("tracks").put(latestMetadata);
      await tx.done;
      return {
        metadata: latestMetadata,
        legacyAudio,
        audioAvailable: currentAudioKey !== undefined || Boolean(legacyAudio),
      };
    } catch {
      // Keep the v1 record untouched when a migration cannot be committed (for
      // example when storage is temporarily full). It can be retried later.
    }
  }

  return {
    metadata,
    legacyAudio,
    audioAvailable: storedAudioAvailable || Boolean(legacyAudio),
  };
}

async function migrateTrackById(
  db: IDBPDatabase<DMPlayerDB>,
  id: string,
): Promise<MigrationResult | undefined> {
  const record = await db.get("tracks", id) as LegacyPersistedTrack | undefined;
  if (!record) return undefined;
  return prepareLegacyRecord(db, id, record);
}

export async function getTracks(): Promise<Track[]> {
  const db = await database();
  const keys = await db.getAllKeys("tracks");
  const tracks: Track[] = [];

  // Read and migrate one record at a time. Calling getAll() on a v1 database
  // would clone every embedded audio buffer into RAM at once.
  for (const key of keys) {
    try {
      const migrated = await migrateTrackById(db, key);
      if (!migrated?.audioAvailable) continue;
      tracks.push(hydratedTrack(migrated.metadata));
    } catch {
      // A single malformed record must not prevent the rest of the library
      // from loading. The record remains in IndexedDB for a future retry.
    }
  }
  return tracks;
}

export async function getTrackAudio(id: string): Promise<Blob | undefined> {
  const db = await database();
  const stored = await db.get("audio", id);
  if (stored) {
    const data = await binaryData(stored.data, stored.data);
    if (data) return new Blob([data], { type: stored.fileType || "application/octet-stream" });
  }

  const migrated = await migrateTrackById(db, id);
  if (!migrated?.legacyAudio) return undefined;
  return new Blob([migrated.legacyAudio], { type: migrated.metadata.fileType });
}

export async function saveTrack(track: Track): Promise<void> {
  const [audioData, normalizedArtworkData] = await Promise.all([
    binaryData(track.audioData, track.blob),
    artworkData(track as LegacyPersistedTrack),
  ]);
  const metadata = strippedTrack(track as LegacyPersistedTrack, track.id, normalizedArtworkData);
  const db = await database();
  if (!audioData) await migrateTrackById(db, track.id);
  const tx = db.transaction(["tracks", "audio"], "readwrite");
  const latest = await tx.objectStore("tracks").get(track.id) as LegacyPersistedTrack | undefined;
  const existingAudioKey = await tx.objectStore("audio").getKey(track.id);
  const latestHasEmbeddedAudio =
    asArrayBuffer(latest?.audioData) !== undefined
    || isBlob(latest?.audioData)
    || isBlob(latest?.blob);
  if (latestHasEmbeddedAudio && existingAudioKey === undefined && !audioData) {
    await tx.done;
    throw new Error("音声データの安全な移行を完了できませんでした。");
  }
  await tx.objectStore("tracks").put(metadata);
  if (audioData) {
    await tx.objectStore("audio").put({
      id: track.id,
      data: audioData,
      fileType: metadata.fileType,
    });
  }
  await tx.done;
}

export async function patchTrack(
  id: string,
  patch: Partial<Track>,
): Promise<Track | undefined> {
  const db = await database();
  const migrated = await migrateTrackById(db, id);
  if (!migrated) return undefined;

  const patchHasArtwork = hasOwn(patch, "artwork");
  const patchHasArtworkData = hasOwn(patch, "artworkData");
  const [newAudioData, newArtworkData] = await Promise.all([
    binaryData(patch.audioData, patch.blob),
    patchHasArtwork || patchHasArtworkData
      ? artworkData(patch as LegacyPersistedTrack)
      : Promise.resolve(undefined),
  ]);
  const {
    id: _patchId,
    audioData: _audioData,
    blob: _blob,
    artwork: _artwork,
    ...metadataPatch
  } = patch;
  void _patchId;
  void _audioData;
  void _blob;
  void _artwork;
  if (patchHasArtwork || patchHasArtworkData) {
    metadataPatch.artworkData = newArtworkData;
  }

  const tx = db.transaction(["tracks", "audio"], "readwrite");
  const latest = await tx.objectStore("tracks").get(id) as LegacyPersistedTrack | undefined;
  if (!latest) {
    await tx.done;
    return undefined;
  }

  const existingAudioKey = await tx.objectStore("audio").getKey(id);
  const latestHasEmbeddedAudio =
    asArrayBuffer(latest.audioData) !== undefined
    || isBlob(latest.audioData)
    || isBlob(latest.blob);
  if (latestHasEmbeddedAudio && existingAudioKey === undefined && !newAudioData) {
    await tx.done;
    throw new Error("音声データの安全な移行を完了できませんでした。");
  }

  const normalizedLatest = strippedTrack(
    latest,
    id,
    asArrayBuffer(latest.artworkData)
      ?? (isBlob(latest.artwork) ? migrated.metadata.artworkData : undefined),
  );
  const next: PersistedTrack = {
    ...normalizedLatest,
    ...metadataPatch,
    id,
  };
  next.fileType = getAudioMimeType(next.fileName, next.fileType);
  await tx.objectStore("tracks").put(next);
  if (newAudioData) {
    await tx.objectStore("audio").put({
      id,
      data: newAudioData,
      fileType: next.fileType,
    });
  }
  await tx.done;
  return hydratedTrack(next);
}

export async function removeTrack(id: string) {
  const db = await database();
  const tx = db.transaction(["tracks", "audio", "playlists"], "readwrite");
  await tx.objectStore("tracks").delete(id);
  await tx.objectStore("audio").delete(id);
  const playlists = await tx.objectStore("playlists").getAll();
  await Promise.all(playlists.map(async (playlist) => {
    if (!Array.isArray(playlist.trackIds) || !playlist.trackIds.includes(id)) return;
    await tx.objectStore("playlists").put({
      ...playlist,
      trackIds: playlist.trackIds.filter((trackId) => trackId !== id),
      updatedAt: Date.now(),
    });
  }));
  await tx.done;
}

export async function getPlaylists() {
  return (await database()).getAll("playlists");
}

export async function savePlaylist(playlist: Playlist) {
  await (await database()).put("playlists", playlist);
}

export async function removePlaylist(id: string) {
  await (await database()).delete("playlists", id);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const value = await (await database()).get("settings", key);
  return (value as T | undefined) ?? fallback;
}

export async function saveSetting<T>(key: string, value: T) {
  await (await database()).put("settings", value, key);
}

export async function clearLibrary() {
  const db = await database();
  const tx = db.transaction(["tracks", "audio", "playlists"], "readwrite");
  await tx.objectStore("tracks").clear();
  await tx.objectStore("audio").clear();
  await tx.objectStore("playlists").clear();
  await tx.done;
}
