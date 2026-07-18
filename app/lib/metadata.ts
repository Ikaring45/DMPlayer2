import { parseBlob, selectCover } from "music-metadata";

export type EmbeddedMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  artwork?: Blob;
  artworkData?: ArrayBuffer;
  artworkType?: string;
};

export async function readEmbeddedMetadata(blob: Blob): Promise<EmbeddedMetadata> {
  const metadata = await parseBlob(blob, { duration: true, skipCovers: false });
  const picture = selectCover(metadata.common.picture);
  const artworkBytes = picture ? new Uint8Array(picture.data).slice() : undefined;
  const artworkData = artworkBytes?.buffer;

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
  };
}
