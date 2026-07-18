import type { LyricLine } from "../types";

const LRC_TIME_TAG = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?]/g;

export function parseLrc(input: string): LyricLine[] {
  const result: Array<LyricLine & { order: number }> = [];
  let order = 0;

  for (const sourceLine of input.split(/\r?\n/)) {
    const timestamps = Array.from(sourceLine.matchAll(LRC_TIME_TAG));
    if (!timestamps.length) continue;

    const text = sourceLine.replace(LRC_TIME_TAG, "").trim();
    if (!text) continue;

    for (const match of timestamps) {
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      result.push({
        time: Number(match[1]) * 60 + Number(match[2]) + fraction,
        text,
        order: order++,
      });
    }
  }

  return result
    .sort((a, b) => a.time - b.time || a.order - b.order)
    .map(({ time, text }) => ({ time, text }));
}

export function formatTime(value = 0) {
  if (!Number.isFinite(value)) return "0:00";
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
