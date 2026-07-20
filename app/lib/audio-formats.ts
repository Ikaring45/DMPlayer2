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
  mid: "audio/midi",
  midi: "audio/midi",
};

const WAV_EXTENSIONS = new Set(["wav", "wave"]);
const WAV_MIME_TYPES = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
]);
const FLAC_MIME_TYPES = new Set([
  "audio/flac",
  "audio/x-flac",
  "application/flac",
  "application/x-flac",
]);

export const AUDIO_EXTENSIONS = Object.freeze(Object.keys(MIME_BY_EXTENSION));
export const AUDIO_FILE_ACCEPT = [
  "audio/*",
  ...AUDIO_EXTENSIONS.map((extension) => `.${extension}`),
].join(",");

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isAudioFile(file: Pick<File, "name" | "type">): boolean {
  const mimeType = file.type.trim().toLowerCase().split(";")[0];
  return mimeType.startsWith("audio/")
    || WAV_MIME_TYPES.has(mimeType)
    || FLAC_MIME_TYPES.has(mimeType)
    || AUDIO_EXTENSIONS.includes(getFileExtension(file.name));
}

export function getAudioMimeType(fileName: string, suppliedType = ""): string {
  const extension = getFileExtension(fileName);
  const normalizedType = suppliedType.trim().toLowerCase();
  const baseType = normalizedType.split(";")[0].trim();
  // Canonical MIME values may come from binary signature detection. Trust
  // those over a misleading extension when the two disagree.
  if (baseType === "audio/wav" || baseType === "audio/flac") return baseType;
  // File providers use several MIME aliases for WAV. A canonical type on the
  // stored Blob gives Safari and other media engines the most reliable path.
  if (WAV_EXTENSIONS.has(extension) || WAV_MIME_TYPES.has(baseType)) return "audio/wav";
  if (extension === "flac" || FLAC_MIME_TYPES.has(baseType)) return "audio/flac";
  if (normalizedType.startsWith("audio/")) return normalizedType;
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function isWavData(data: ArrayBuffer | ArrayBufferView): boolean {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.byteLength < 12) return false;
  const chunkId = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const formType = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ["RIFF", "RIFX", "RF64", "BW64"].includes(chunkId) && formType === "WAVE";
}

export function isFlacData(data: ArrayBuffer | ArrayBufferView): boolean {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return bytes.byteLength >= 4
    && bytes[0] === 0x66
    && bytes[1] === 0x4c
    && bytes[2] === 0x61
    && bytes[3] === 0x43;
}

export function getAudioFormatLabel(fileName: string, mimeType = ""): string {
  const baseType = mimeType.trim().toLowerCase().split(";")[0];
  if (baseType === "audio/flac") return "FLAC";
  if (baseType === "audio/wav") return "WAV";
  const extension = getFileExtension(fileName);
  if (extension) return extension.toUpperCase();
  return mimeType.replace(/^audio\//i, "").split(";")[0].toUpperCase() || "AUDIO";
}
