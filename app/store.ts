"use client";

import { create } from "zustand";
import * as db from "./lib/db";
import { getAudioMimeType, isAudioFile, isFlacData, isWavData } from "./lib/audio-formats";
import {
  appendUniqueIds,
  clampNumber,
  createContentHash,
  insertNextId,
  moveQueueId,
  sanitizeIdList,
} from "./lib/library";
import { parseLrc } from "./lib/lyrics";
import { readEmbeddedMetadata } from "./lib/metadata";
import { isMidiFile, renderMidiToWav, type MidiInfo } from "./lib/midi";
import type { Playlist, RepeatMode, ThemeMode, Track } from "./types";

export type ImportProgress = {
  total: number;
  processed: number;
  currentFile: string;
};

export type ImportSummary = {
  requested: number;
  added: number;
  duplicates: number;
  unsupported: number;
  failed: number;
  quotaExceeded: boolean;
};

export type PlaybackStatus = "idle" | "loading" | "ready" | "playing" | "error";

type AppState = {
  tracks: Track[];
  playlists: Playlist[];
  queue: string[];
  originalQueue: string[];
  currentId?: string;
  playing: boolean;
  playbackStatus: PlaybackStatus;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  theme: ThemeMode;
  eqEnabled: boolean;
  eqBands: number[];
  ready: boolean;
  importProgress?: ImportProgress;
  load: () => Promise<void>;
  addFiles: (files: File[]) => Promise<ImportSummary>;
  updateTrack: (id: string, patch: Partial<Track>) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  playTrack: (id: string, source?: string[]) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackStatus: (status: PlaybackStatus) => void;
  next: () => void;
  previous: () => void;
  addNext: (id: string) => void;
  addToQueue: (id: string) => void;
  moveQueueItem: (from: number, to: number) => void;
  removeFromQueue: (id: string) => void;
  clearUpcoming: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (volume: number) => void;
  setTheme: (theme: ThemeMode) => void;
  setEqEnabled: (enabled: boolean) => void;
  setEqBand: (index: number, gain: number) => void;
  setEqPreset: (gains: number[]) => void;
  createPlaylist: (name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  togglePlaylistTrack: (playlistId: string, trackId: string) => Promise<void>;
  refreshMetadata: (id: string) => Promise<boolean>;
};

type PlaybackSession = {
  queue: string[];
  originalQueue: string[];
  currentId?: string;
  shuffle: boolean;
  repeat: RepeatMode;
};

const shuffleIds = (ids: string[], keep?: string) => {
  const rest = ids.filter((id) => id !== keep);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keep ? [keep, ...rest] : rest;
};

const createId = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const nextFrom = (state: Pick<AppState, "queue" | "currentId" | "repeat">, direction: 1 | -1) => {
  if (!state.queue.length) return undefined;
  const index = state.queue.indexOf(state.currentId ?? "");
  if (index < 0) return direction === 1 ? state.queue[0] : undefined;
  const nextIndex = index + direction;
  if (nextIndex >= state.queue.length) return state.repeat === "all" ? state.queue[0] : undefined;
  if (nextIndex < 0) return state.repeat === "all" ? state.queue[state.queue.length - 1] : undefined;
  return state.queue[nextIndex];
};

function persistSession(state: AppState) {
  const session: PlaybackSession = {
    queue: state.queue,
    originalQueue: state.originalQueue,
    currentId: state.currentId,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
  void db.saveSetting("playbackSession", session);
}

function announceTrackTransition(direction: "next" | "previous") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dmplayer:track-transition", { detail: { direction } }));
  }
}

function waitForLibraryIdle() {
  if (typeof window === "undefined") return Promise.resolve();
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  return new Promise<void>((resolve) => {
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(resolve, { timeout: 1200 });
      return;
    }
    window.setTimeout(resolve, 24);
  });
}

function embeddedMetadataPatch(
  track: Track,
  embedded: Awaited<ReturnType<typeof readEmbeddedMetadata>>,
): Partial<Track> {
  return {
    title: embedded.title || track.title,
    artist: embedded.artist || track.artist,
    album: embedded.album || track.album,
    duration: embedded.duration || track.duration,
    artwork: embedded.artwork || track.artwork,
    artworkData: embedded.artworkData || track.artworkData,
    artworkType: embedded.artworkType || track.artworkType,
    lyrics: embedded.lyrics || track.lyrics,
    syncedLyrics: embedded.syncedLyrics?.length ? embedded.syncedLyrics : track.syncedLyrics,
    codec: embedded.codec || track.codec,
    container: embedded.container || track.container,
    bitrate: embedded.bitrate || track.bitrate,
    sampleRate: embedded.sampleRate || track.sampleRate,
    channels: embedded.channels || track.channels,
    bitsPerSample: embedded.bitsPerSample || track.bitsPerSample,
    lossless: embedded.lossless ?? track.lossless,
    lyricsParsed: true,
    metadataParsed: true,
    technicalParsed: true,
    updatedAt: Date.now(),
  };
}

export const usePlayerStore = create<AppState>((set, get) => ({
  tracks: [], playlists: [], queue: [], originalQueue: [], playing: false, playbackStatus: "idle", shuffle: false,
  repeat: "off", volume: 1, theme: "system", eqEnabled: false, eqBands: [0, 0, 0, 0, 0], ready: false,
  load: async () => {
    try {
    const [tracks, playlists, volume, theme, eqEnabled, eqBands, session] = await Promise.all([
      db.getTracks(),
      db.getPlaylists(),
      db.getSetting("volume", 1),
      db.getSetting<ThemeMode>("theme", "system"),
      db.getSetting("eqEnabled", false),
      db.getSetting<number[]>("eqBands", [0, 0, 0, 0, 0]),
      db.getSetting<PlaybackSession | null>("playbackSession", null),
    ]);
    tracks.sort((a, b) => b.createdAt - a.createdAt);
    const ids = tracks.map((track) => track.id);
    const valid = new Set(ids);
    const hasSession = Boolean(session && typeof session === "object");
    const currentId = typeof session?.currentId === "string" && valid.has(session.currentId)
      ? session.currentId
      : undefined;
    const restoredQueue = sanitizeIdList(session?.queue, valid);
    const restoredOriginal = sanitizeIdList(session?.originalQueue, valid);
    if (currentId && !restoredQueue.includes(currentId)) restoredQueue.unshift(currentId);
    if (currentId && !restoredOriginal.includes(currentId)) restoredOriginal.unshift(currentId);
    const safeTheme: ThemeMode = theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";
    const safeEqBands = Array.isArray(eqBands) && eqBands.length === 5
      ? eqBands.map((gain) => clampNumber(gain, 0, -12, 12))
      : [0, 0, 0, 0, 0];
    const safeRepeat: RepeatMode = session?.repeat === "all" || session?.repeat === "one"
      ? session.repeat
      : "off";
    set({
      tracks,
      playlists,
      queue: hasSession ? restoredQueue : ids,
      originalQueue: hasSession ? restoredOriginal : ids,
      currentId,
      shuffle: session?.shuffle === true,
      repeat: safeRepeat,
      volume: clampNumber(volume, 1, 0, 1),
      theme: safeTheme,
      eqEnabled: eqEnabled === true,
      eqBands: safeEqBands,
      ready: true,
    });
    try {
      localStorage.setItem("dmplayer2:theme", safeTheme);
    } catch {}
    for (const track of tracks.filter((item) => !item.metadataParsed || !item.lyricsParsed || !item.technicalParsed)) {
      try {
        await waitForLibraryIdle();
        const audio = await db.getTrackAudio(track.id);
        if (!audio) continue;
        const embedded = await readEmbeddedMetadata(audio);
        const persisted = await db.patchTrack(track.id, embeddedMetadataPatch(track, embedded));
        if (persisted) {
          set((state) => ({
            tracks: state.tracks.map((item) => item.id === persisted.id ? persisted : item),
          }));
        }
      } catch (error) {
        console.warn(`Metadata refresh deferred for ${track.fileName}`, error);
      }
    }
    } catch (error) {
      console.error("Library could not be loaded", error);
      set({ ready: true });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("dmplayer:notice", {
          detail: "ライブラリを読み込めませんでした。ページを再読み込みしてください。",
        }));
      }
    }
  },
  addFiles: async (files) => {
    if (get().importProgress) {
      return {
        requested: files.length,
        added: 0,
        duplicates: 0,
        unsupported: 0,
        failed: files.length,
        quotaExceeded: false,
      };
    }
    const existing = get().tracks;
    const added: Track[] = [];
    const knownFiles = new Map(existing.map((track) => [
      `${track.fileName}\u0000${track.sourceFileSize ?? track.fileSize}`,
      track.contentHash,
    ]));
    const knownHashes = new Set(existing.flatMap((track) => track.contentHash ? [track.contentHash] : []));
    const summary: ImportSummary = {
      requested: files.length,
      added: 0,
      duplicates: 0,
      unsupported: 0,
      failed: 0,
      quotaExceeded: false,
    };
    set({ importProgress: { total: files.length, processed: 0, currentFile: files[0]?.name ?? "" } });
    for (const [index, file] of files.entries()) {
      set({ importProgress: { total: files.length, processed: index, currentFile: file.name } });
      const fileKey = `${file.name}\u0000${file.size}`;
      try {
        let wavData = false;
        let flacData = false;
        if (!isAudioFile(file)) {
          const header = await file.slice(0, 12).arrayBuffer();
          wavData = isWavData(header);
          flacData = isFlacData(header);
          if (!wavData && !flacData) {
            summary.unsupported += 1;
            continue;
          }
        }
        const sourceData = await file.arrayBuffer();
        wavData ||= isWavData(sourceData);
        flacData ||= isFlacData(sourceData);
        const contentHash = await createContentHash(sourceData);
        const knownFileHash = knownFiles.get(fileKey);
        const duplicateByHash = Boolean(contentHash && knownHashes.has(contentHash));
        const duplicateByLegacyKey = knownFiles.has(fileKey)
          && (!contentHash || !knownFileHash || contentHash === knownFileHash);
        if (duplicateByHash || duplicateByLegacyKey) {
          summary.duplicates += 1;
          continue;
        }
        const stem = file.name.replace(/\.[^.]+$/, "");
        const [artist, ...titleParts] = stem.split(" - ");
        const title = titleParts.length ? titleParts.join(" - ") : artist;
        let embedded: Partial<Awaited<ReturnType<typeof readEmbeddedMetadata>>> & { midi?: MidiInfo } = {};
        let audioData = sourceData;
        let fileType = wavData
          ? "audio/wav"
          : flacData
            ? "audio/flac"
            : getAudioMimeType(file.name, file.type);
        if (isMidiFile(file.name, file.type)) {
          const rendered = await renderMidiToWav(audioData);
          audioData = rendered.audioData;
          fileType = "audio/wav";
          embedded = { title: rendered.title, duration: rendered.duration, midi: rendered.midi };
        } else {
          try {
            embedded = await readEmbeddedMetadata(file);
          } catch {
            // A playable file can still be added when it has malformed or unsupported tags.
          }
        }
        const storedBlob = new Blob([audioData], { type: fileType });
        const now = Date.now();
        const track: Track = {
          id: createId(),
          title: embedded.title || title,
          artist: embedded.artist || (titleParts.length ? artist : "不明なアーティスト"),
          album: embedded.album || "不明なアルバム",
          duration: embedded.duration,
          artwork: embedded.artwork,
          artworkData: embedded.artworkData,
          artworkType: embedded.artworkType,
          lyrics: embedded.lyrics,
          syncedLyrics: embedded.syncedLyrics,
          codec: embedded.codec,
          container: embedded.container,
          bitrate: embedded.bitrate,
          sampleRate: embedded.sampleRate,
          channels: embedded.channels,
          bitsPerSample: embedded.bitsPerSample,
          lossless: embedded.lossless,
          lyricsParsed: embedded.lyricsParsed ?? true,
          metadataParsed: true,
          technicalParsed: true,
          fileName: file.name,
          fileType,
          fileSize: audioData.byteLength,
          sourceFileSize: file.size,
          contentHash,
          blob: storedBlob,
          audioData,
          favorite: false,
          playCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        await db.saveTrack(track);
        const { blob, audioData: storedAudioData, ...metadataTrack } = track;
        void blob;
        void storedAudioData;
        added.push(metadataTrack);
        summary.added += 1;
        knownFiles.set(fileKey, contentHash);
        if (contentHash) knownHashes.add(contentHash);
      } catch (error) {
        summary.failed += 1;
        console.error(`Audio import failed: ${file.name}`, error);
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
          summary.quotaExceeded = true;
          break;
        }
      } finally {
        set({ importProgress: { total: files.length, processed: index + 1, currentFile: file.name } });
      }
    }
    set((state) => {
      const tracks = [...added, ...state.tracks];
      const addedIds = added.map((track) => track.id);
      const allIds = tracks.map((track) => track.id);
      return {
        tracks,
        queue: state.queue.length ? appendUniqueIds(state.queue, addedIds) : allIds,
        originalQueue: state.originalQueue.length
          ? appendUniqueIds(state.originalQueue, addedIds)
          : allIds,
        importProgress: undefined,
      };
    });
    persistSession(get());
    return summary;
  },
  updateTrack: async (id, patch) => {
    const updatedAt = Date.now();
    const normalizedPatch: Partial<Track> = { ...patch, updatedAt };
    if (typeof patch.lyrics === "string") normalizedPatch.syncedLyrics = parseLrc(patch.lyrics);
    const previous = get().tracks.find((item) => item.id === id);
    set((state) => ({
      tracks: state.tracks.map((item) => (
        item.id === id ? { ...item, ...normalizedPatch } : item
      )),
    }));
    try {
      const persisted = await db.patchTrack(id, normalizedPatch);
      if (persisted) {
        set((state) => ({
          tracks: state.tracks.map((item) => item.id === id
            ? { ...persisted, ...item, updatedAt: Math.max(item.updatedAt, persisted.updatedAt) }
            : item),
        }));
      }
    } catch (error) {
      console.error(`Track update could not be saved: ${id}`, error);
      if (previous) {
        set((state) => ({
          tracks: state.tracks.map((item) => (
            item.id === id && item.updatedAt === updatedAt ? previous : item
          )),
        }));
      }
      window.dispatchEvent(new CustomEvent("dmplayer:notice", {
        detail: "曲情報の変更を保存できませんでした。",
      }));
    }
  },
  deleteTrack: async (id) => {
    await db.removeTrack(id);
    const tracks = get().tracks.filter((track) => track.id !== id);
    const queue = get().queue.filter((trackId) => trackId !== id);
    const playlists = get().playlists.map((playlist) => ({
      ...playlist,
      trackIds: playlist.trackIds.filter((trackId) => trackId !== id),
    }));
    set({ tracks, playlists, queue, originalQueue: get().originalQueue.filter((trackId) => trackId !== id), currentId: get().currentId === id ? undefined : get().currentId, playing: get().currentId === id ? false : get().playing, playbackStatus: get().currentId === id ? "idle" : get().playbackStatus });
    persistSession(get());
  },
  clear: async () => { await db.clearLibrary(); set({ tracks: [], playlists: [], queue: [], originalQueue: [], currentId: undefined, playing: false, playbackStatus: "idle" }); persistSession(get()); },
  playTrack: (id, source) => {
    const ids = source ?? get().tracks.map((track) => track.id);
    const queue = get().shuffle ? shuffleIds(ids, id) : ids;
    if (get().currentId === id) {
      set({
        playing: true,
        playbackStatus: "loading",
        ...(source ? { queue, originalQueue: ids } : {}),
      });
      persistSession(get());
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("dmplayer:play-request", { detail: { id } }));
      }
      return;
    }
    const previousId = get().currentId;
    if (previousId && previousId !== id) {
      const previousIndex = ids.indexOf(previousId);
      const nextIndex = ids.indexOf(id);
      announceTrackTransition(previousIndex >= 0 && nextIndex >= 0 && nextIndex < previousIndex ? "previous" : "next");
    }
    set({ currentId: id, queue, originalQueue: ids, playing: true, playbackStatus: "loading" });
    persistSession(get());
    const track = get().tracks.find((item) => item.id === id);
    if (track && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("dmplayer:play-request", {
        detail: { id: track.id },
      }));
    }
  },
  setPlaying: (playing) => set({
    playing,
    playbackStatus: playing ? "loading" : get().currentId ? "ready" : "idle",
  }),
  setPlaybackStatus: (playbackStatus) => set({ playbackStatus }),
  next: () => {
    const id = nextFrom(get(), 1);
    if (!id) {
      set({ playing: false });
      persistSession(get());
      return;
    }
    if (id !== get().currentId) announceTrackTransition("next");
    set({ currentId: id, playing: true, playbackStatus: "loading" });
    persistSession(get());
  },
  previous: () => { const id = nextFrom(get(), -1); if (id) { if (id !== get().currentId) announceTrackTransition("previous"); set({ currentId: id, playing: true, playbackStatus: "loading" }); persistSession(get()); } },
  addNext: (id) => {
    const { queue, originalQueue, currentId } = get();
    set({
      queue: insertNextId(queue, id, currentId),
      originalQueue: insertNextId(originalQueue, id, currentId),
    });
    persistSession(get());
  },
  addToQueue: (id) => {
    const queue = appendUniqueIds(get().queue, [id]);
    const originalQueue = appendUniqueIds(get().originalQueue, [id]);
    if (queue.length === get().queue.length && originalQueue.length === get().originalQueue.length) return;
    set({ queue, originalQueue });
    persistSession(get());
  },
  moveQueueItem: (from, to) => {
    const queue = moveQueueId(get().queue, from, to);
    if (queue === get().queue) return;
    set({ queue, originalQueue: queue });
    persistSession(get());
  },
  removeFromQueue: (id) => {
    if (id === get().currentId) return;
    set({
      queue: get().queue.filter((item) => item !== id),
      originalQueue: get().originalQueue.filter((item) => item !== id),
    });
    persistSession(get());
  },
  clearUpcoming: () => {
    const currentId = get().currentId;
    const queue = currentId ? [currentId] : [];
    set({ queue, originalQueue: queue });
    persistSession(get());
  },
  toggleShuffle: () => { const enabled = !get().shuffle; set({ shuffle: enabled, queue: enabled ? shuffleIds(get().originalQueue, get().currentId) : get().originalQueue }); persistSession(get()); },
  cycleRepeat: () => { set({ repeat: get().repeat === "off" ? "all" : get().repeat === "all" ? "one" : "off" }); persistSession(get()); },
  setVolume: (volume) => {
    const safeVolume = clampNumber(volume, 1, 0, 1);
    set({ volume: safeVolume });
    void db.saveSetting("volume", safeVolume);
  },
  setTheme: (theme) => {
    set({ theme });
    try {
      localStorage.setItem("dmplayer2:theme", theme);
    } catch {}
    void db.saveSetting("theme", theme);
  },
  setEqEnabled: (eqEnabled) => { set({ eqEnabled }); void db.saveSetting("eqEnabled", eqEnabled); },
  setEqBand: (index, gain) => {
    if (index < 0 || index >= 5) return;
    const eqBands = [...get().eqBands];
    eqBands[index] = Math.max(-12, Math.min(12, gain));
    set({ eqBands });
    void db.saveSetting("eqBands", eqBands);
  },
  setEqPreset: (gains) => {
    if (gains.length !== 5) return;
    const eqBands = gains.map((gain) => Math.max(-12, Math.min(12, gain)));
    set({ eqBands, eqEnabled: true });
    void Promise.all([db.saveSetting("eqBands", eqBands), db.saveSetting("eqEnabled", true)]);
  },
  createPlaylist: async (name) => { const now = Date.now(); const playlist = { id: createId(), name, trackIds: [], createdAt: now, updatedAt: now }; await db.savePlaylist(playlist); set({ playlists: [...get().playlists, playlist] }); },
  deletePlaylist: async (id) => { await db.removePlaylist(id); set({ playlists: get().playlists.filter((item) => item.id !== id) }); },
  togglePlaylistTrack: async (playlistId, trackId) => {
    const playlist = get().playlists.find((item) => item.id === playlistId); if (!playlist) return;
    const has = playlist.trackIds.includes(trackId);
    const next = { ...playlist, trackIds: has ? playlist.trackIds.filter((id) => id !== trackId) : [...playlist.trackIds, trackId], updatedAt: Date.now() };
    await db.savePlaylist(next); set({ playlists: get().playlists.map((item) => item.id === playlistId ? next : item) });
  },
  refreshMetadata: async (id) => {
    const track = get().tracks.find((item) => item.id === id);
    if (!track) return false;
    try {
      const audio = await db.getTrackAudio(id);
      if (!audio) return false;
      const embedded = await readEmbeddedMetadata(audio);
      const persisted = await db.patchTrack(id, embeddedMetadataPatch(track, embedded));
      if (!persisted) return false;
      set((state) => ({
        tracks: state.tracks.map((item) => item.id === id ? persisted : item),
      }));
      return true;
    } catch (error) {
      console.warn(`Metadata refresh failed for ${track.fileName}`, error);
      return false;
    }
  },
}));
