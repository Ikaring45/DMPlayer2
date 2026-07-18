import type { LyricLine } from "../types";

const LRC_LINE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]\s*(.*)/g;

export function parseLrc(input: string): LyricLine[] {
  const result: LyricLine[] = [];
  for (const sourceLine of input.split(/\r?\n/)) {
    LRC_LINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LRC_LINE.exec(sourceLine))) {
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      result.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text: match[4].trim() });
    }
  }
  return result.filter((line) => line.text).sort((a, b) => a.time - b.time);
}

export function formatTime(value = 0) {
  if (!Number.isFinite(value)) return "0:00";
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
