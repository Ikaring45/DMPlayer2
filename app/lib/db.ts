import { openDB, type DBSchema } from "idb";
import { getAudioMimeType } from "./audio-formats";
import type { Playlist, Track } from "../types";

type PersistedTrack = Omit<Track, "blob" | "artwork">;

interface DMPlayerDB extends DBSchema {
  tracks: { key: string; value: PersistedTrack; indexes: { "by-created": number } };
  playlists: { key: string; value: Playlist };
  settings: { key: string; value: unknown };
}

const database = () => openDB<DMPlayerDB>("dmplayer2", 1, {
  upgrade(db) {
    const tracks = db.createObjectStore("tracks", { keyPath: "id" });
    tracks.createIndex("by-created", "createdAt");
    db.createObjectStore("playlists", { keyPath: "id" });
    db.createObjectStore("settings");
  },
});

export async function getTracks(): Promise<Track[]> {
  const records = await (await database()).getAll("tracks") as Array<PersistedTrack & {
    blob?: Blob;
    artwork?: Blob;
  }>;
  return Promise.all(records.map(async (record) => {
    const audioData = record.audioData ?? await record.blob?.arrayBuffer();
    if (!audioData) throw new Error(`音声データが見つかりません: ${record.fileName}`);
    const artworkData = record.artworkData ?? await record.artwork?.arrayBuffer();
    const fileType = getAudioMimeType(record.fileName, record.fileType);
    const { blob: legacyBlob, artwork: legacyArtwork, ...metadata } = record;
    void legacyBlob;
    void legacyArtwork;
    return {
      ...metadata,
      fileType,
      audioData,
      artworkData,
      blob: new Blob([audioData], { type: fileType }),
      artwork: artworkData
        ? new Blob([artworkData], { type: record.artworkType || "image/jpeg" })
        : undefined,
    };
  }));
}

export async function saveTrack(track: Track) {
  const audioData = track.audioData ?? await track.blob.arrayBuffer();
  const artworkData = track.artworkData ?? await track.artwork?.arrayBuffer();
  const { blob, artwork, ...metadata } = track;
  void blob;
  void artwork;
  await (await database()).put("tracks", {
    ...metadata,
    audioData,
    artworkData,
  });
}

export async function removeTrack(id: string) {
  const db = await database();
  const tx = db.transaction(["tracks", "playlists"], "readwrite");
  await tx.objectStore("tracks").delete(id);
  const playlists = await tx.objectStore("playlists").getAll();
  await Promise.all(playlists.map((playlist) => tx.objectStore("playlists").put({
    ...playlist,
    trackIds: playlist.trackIds.filter((trackId) => trackId !== id),
    updatedAt: Date.now(),
  })));
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
  const tx = db.transaction(["tracks", "playlists"], "readwrite");
  await tx.objectStore("tracks").clear();
  await tx.objectStore("playlists").clear();
  await tx.done;
}
