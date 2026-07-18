"use client";

import { create } from "zustand";
import * as db from "./lib/db";
import { getAudioMimeType, isAudioFile } from "./lib/audio-formats";
import { parseLrc } from "./lib/lyrics";
import { readEmbeddedMetadata } from "./lib/metadata";
import { isMidiFile, renderMidiToWav, type MidiInfo } from "./lib/midi";
import type { Playlist, RepeatMode, ThemeMode, Track } from "./types";

type AppState = {
  tracks: Track[];
  playlists: Playlist[];
  queue: string[];
  originalQueue: string[];
  currentId?: string;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  theme: ThemeMode;
  eqEnabled: boolean;
  eqBands: number[];
  ready: boolean;
  load: () => Promise<void>;
  addFiles: (files: File[]) => Promise<number>;
  updateTrack: (id: string, patch: Partial<Track>) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  playTrack: (id: string, source?: string[]) => void;
  setPlaying: (playing: boolean) => void;
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
  const index = Math.max(0, state.queue.indexOf(state.currentId ?? ""));
  let nextIndex = index + direction;
  if (nextIndex >= state.queue.length) nextIndex = state.repeat === "all" ? 0 : index;
  if (nextIndex < 0) nextIndex = state.repeat === "all" ? state.queue.length - 1 : 0;
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

export const usePlayerStore = create<AppState>((set, get) => ({
  tracks: [], playlists: [], queue: [], originalQueue: [], playing: false, shuffle: false,
  repeat: "off", volume: 1, theme: "system", eqEnabled: false, eqBands: [0, 0, 0, 0, 0], ready: false,
  load: async () => {
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
    const restoredQueue = session?.queue.filter((id) => valid.has(id)) ?? [];
    const restoredOriginal = session?.originalQueue.filter((id) => valid.has(id)) ?? [];
    const currentId = session?.currentId && valid.has(session.currentId) ? session.currentId : undefined;
    set({
      tracks,
      playlists,
      queue: restoredQueue.length ? restoredQueue : ids,
      originalQueue: restoredOriginal.length ? restoredOriginal : ids,
      currentId,
      shuffle: session?.shuffle ?? false,
      repeat: session?.repeat ?? "off",
      volume,
      theme,
      eqEnabled,
      eqBands: eqBands.length === 5 ? eqBands : [0, 0, 0, 0, 0],
      ready: true,
    });
    for (const track of tracks.filter((item) => !item.metadataParsed || !item.lyricsParsed)) {
      try {
        const embedded = await readEmbeddedMetadata(track.blob);
        const updated: Track = {
          ...track,
          title: embedded.title || track.title,
          artist: embedded.artist || track.artist,
          album: embedded.album || track.album,
          duration: embedded.duration || track.duration,
          artwork: embedded.artwork || track.artwork,
          artworkData: embedded.artworkData || track.artworkData,
          artworkType: embedded.artworkType || track.artworkType,
          lyrics: embedded.lyrics || track.lyrics,
          syncedLyrics: embedded.syncedLyrics?.length ? embedded.syncedLyrics : track.syncedLyrics,
          lyricsParsed: true,
          metadataParsed: true,
          updatedAt: Date.now(),
        };
        await db.saveTrack(updated);
        set((state) => ({ tracks: state.tracks.map((item) => item.id === updated.id ? updated : item) }));
      } catch {
        const updated = { ...track, metadataParsed: true, lyricsParsed: true, updatedAt: Date.now() };
        await db.saveTrack(updated);
        set((state) => ({ tracks: state.tracks.map((item) => item.id === updated.id ? updated : item) }));
      }
    }
  },
  addFiles: async (files) => {
    const supported = files.filter(isAudioFile);
    const existing = get().tracks;
    const added: Track[] = [];
    for (const file of supported) {
      if (existing.some((track) => track.fileName === file.name && (track.sourceFileSize ?? track.fileSize) === file.size)) continue;
      const stem = file.name.replace(/\.[^.]+$/, "");
      const [artist, ...titleParts] = stem.split(" - ");
      const title = titleParts.length ? titleParts.join(" - ") : artist;
      let embedded: Partial<Awaited<ReturnType<typeof readEmbeddedMetadata>>> & { midi?: MidiInfo } = {};
      let audioData = await file.arrayBuffer();
      let fileType = getAudioMimeType(file.name, file.type);
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
        lyricsParsed: embedded.lyricsParsed ?? true,
        metadataParsed: true,
        fileName: file.name, fileType, fileSize: audioData.byteLength, sourceFileSize: file.size,
        blob: storedBlob, audioData, favorite: false, playCount: 0, createdAt: Date.now(), updatedAt: Date.now(),
      };
      await db.saveTrack(track);
      added.push(track);
    }
    const tracks = [...added, ...existing];
    const ids = tracks.map((track) => track.id);
    set({ tracks, queue: ids, originalQueue: ids });
    persistSession(get());
    return added.length;
  },
  updateTrack: async (id, patch) => {
    const track = get().tracks.find((item) => item.id === id);
    if (!track) return;
    const next = { ...track, ...patch, updatedAt: Date.now() };
    if (typeof patch.lyrics === "string") next.syncedLyrics = parseLrc(patch.lyrics);
    await db.saveTrack(next);
    set({ tracks: get().tracks.map((item) => item.id === id ? next : item) });
  },
  deleteTrack: async (id) => {
    await db.removeTrack(id);
    const tracks = get().tracks.filter((track) => track.id !== id);
    const queue = get().queue.filter((trackId) => trackId !== id);
    set({ tracks, queue, originalQueue: get().originalQueue.filter((trackId) => trackId !== id), currentId: get().currentId === id ? undefined : get().currentId, playing: get().currentId === id ? false : get().playing });
    persistSession(get());
  },
  clear: async () => { await db.clearLibrary(); set({ tracks: [], playlists: [], queue: [], originalQueue: [], currentId: undefined, playing: false }); persistSession(get()); },
  playTrack: (id, source) => {
    const ids = source ?? get().tracks.map((track) => track.id);
    const queue = get().shuffle ? shuffleIds(ids, id) : ids;
    set({ currentId: id, queue, originalQueue: ids, playing: true });
    persistSession(get());
    const track = get().tracks.find((item) => item.id === id);
    if (track && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("dmplayer:play-request", {
        detail: { id: track.id, blob: track.blob },
      }));
    }
  },
  setPlaying: (playing) => set({ playing }),
  next: () => { const id = nextFrom(get(), 1); if (id) { set({ currentId: id, playing: true }); persistSession(get()); } },
  previous: () => { const id = nextFrom(get(), -1); if (id) { set({ currentId: id, playing: true }); persistSession(get()); } },
  addNext: (id) => { const { queue, currentId } = get(); const clean = queue.filter((item) => item !== id); const index = Math.max(0, clean.indexOf(currentId ?? "")); clean.splice(index + 1, 0, id); set({ queue: clean }); persistSession(get()); },
  addToQueue: (id) => { if (!get().queue.includes(id)) { set({ queue: [...get().queue, id] }); persistSession(get()); } },
  moveQueueItem: (from, to) => {
    const queue = [...get().queue];
    if (from < 0 || to < 0 || from >= queue.length || to >= queue.length || from === to) return;
    const [item] = queue.splice(from, 1);
    queue.splice(to, 0, item);
    set({ queue });
    persistSession(get());
  },
  removeFromQueue: (id) => {
    if (id === get().currentId) return;
    set({ queue: get().queue.filter((item) => item !== id) });
    persistSession(get());
  },
  clearUpcoming: () => {
    const currentId = get().currentId;
    set({ queue: currentId ? [currentId] : [] });
    persistSession(get());
  },
  toggleShuffle: () => { const enabled = !get().shuffle; set({ shuffle: enabled, queue: enabled ? shuffleIds(get().originalQueue, get().currentId) : get().originalQueue }); persistSession(get()); },
  cycleRepeat: () => { set({ repeat: get().repeat === "off" ? "all" : get().repeat === "all" ? "one" : "off" }); persistSession(get()); },
  setVolume: (volume) => { set({ volume }); void db.saveSetting("volume", volume); },
  setTheme: (theme) => { set({ theme }); void db.saveSetting("theme", theme); },
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
      const embedded = await readEmbeddedMetadata(track.blob);
      const updated: Track = {
        ...track,
        title: embedded.title || track.title,
        artist: embedded.artist || track.artist,
        album: embedded.album || track.album,
        duration: embedded.duration || track.duration,
        artwork: embedded.artwork || track.artwork,
        artworkData: embedded.artworkData || track.artworkData,
        artworkType: embedded.artworkType || track.artworkType,
        lyrics: embedded.lyrics || track.lyrics,
        syncedLyrics: embedded.syncedLyrics?.length ? embedded.syncedLyrics : track.syncedLyrics,
        lyricsParsed: true,
        metadataParsed: true,
        updatedAt: Date.now(),
      };
      await db.saveTrack(updated);
      set({ tracks: get().tracks.map((item) => item.id === id ? updated : item) });
      return true;
    } catch {
      return false;
    }
  },
}));
