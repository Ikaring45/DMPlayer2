const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  wave: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg; codecs=opus",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  aifc: "audio/aiff",
  caf: "audio/x-caf",
  alac: "audio/alac",
};

export const AUDIO_EXTENSIONS = Object.freeze(Object.keys(MIME_BY_EXTENSION));
export const AUDIO_FILE_ACCEPT = [
  "audio/*",
  ...AUDIO_EXTENSIONS.map((extension) => `.${extension}`),
].join(",");

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isAudioFile(file: Pick<File, "name" | "type">): boolean {
  return file.type.toLowerCase().startsWith("audio/")
    || AUDIO_EXTENSIONS.includes(getFileExtension(file.name));
}

export function getAudioMimeType(fileName: string, suppliedType = ""): string {
  const normalizedType = suppliedType.trim().toLowerCase();
  if (normalizedType.startsWith("audio/")) return normalizedType;
  return MIME_BY_EXTENSION[getFileExtension(fileName)] ?? "application/octet-stream";
}

export function getAudioFormatLabel(fileName: string, mimeType = ""): string {
  const extension = getFileExtension(fileName);
  if (extension) return extension.toUpperCase();
  return mimeType.replace(/^audio\//i, "").split(";")[0].toUpperCase() || "AUDIO";
}
