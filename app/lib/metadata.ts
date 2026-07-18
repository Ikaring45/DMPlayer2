import { parseBlob, selectCover } from "music-metadata";
import type { LyricLine } from "../types";

export type EmbeddedMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  artwork?: Blob;
  artworkData?: ArrayBuffer;
  artworkType?: string;
  lyrics?: string;
  syncedLyrics?: LyricLine[];
  lyricsParsed: boolean;
};

export async function readEmbeddedMetadata(blob: Blob): Promise<EmbeddedMetadata> {
  const metadata = await parseBlob(blob, { duration: true, skipCovers: false });
  const picture = selectCover(metadata.common.picture);
  const artworkBytes = picture ? new Uint8Array(picture.data).slice() : undefined;
  const artworkData = artworkBytes?.buffer;
  const lyricTags = metadata.common.lyrics ?? [];
  const synchronized = lyricTags
    .filter((tag) => tag.timeStampFormat === 2)
    .flatMap((tag) => tag.syncText)
    .filter((line): line is typeof line & { timestamp: number } => Number.isFinite(line.timestamp) && Boolean(line.text?.trim()))
    .map((line) => ({ time: line.timestamp / 1000, text: line.text.trim() }))
    .sort((a, b) => a.time - b.time);
  const plainLyrics = lyricTags
    .map((tag) => tag.text?.trim())
    .find((text): text is string => Boolean(text))
    ?? (synchronized.length ? synchronized.map((line) => line.text).join("\n") : undefined);

  return {
    title: metadata.common.title,
    artist: metadata.common.artist || metadata.common.albumartist,
    album: metadata.common.album,
    duration: metadata.format.duration,
    artwork: picture && artworkData
      ? new Blob([artworkData], { type: picture.format })
      : undefined,
    artworkData,
    artworkType: picture?.format,
    lyrics: plainLyrics,
    syncedLyrics: synchronized.length ? synchronized : undefined,
    lyricsParsed: true,
  };
}
