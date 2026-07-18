import type { MidiInfo } from "./lib/midi";

export type LyricLine = { time: number; text: string };

export type Track = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  artworkUrl?: string;
  artwork?: Blob;
  artworkData?: ArrayBuffer;
  artworkType?: string;
  metadataParsed?: boolean;
  fileName: string;
  fileType: string;
  fileSize: number;
  sourceFileSize?: number;
  blob: Blob;
  audioData: ArrayBuffer;
  lyrics?: string;
  syncedLyrics?: LyricLine[];
  lyricsParsed?: boolean;
  midi?: MidiInfo;
  favorite: boolean;
  playCount: number;
  lastPlayedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type RepeatMode = "off" | "one" | "all";

export type ThemeMode = "system" | "light" | "dark";
