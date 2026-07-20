import assert from "node:assert/strict";
import test from "node:test";
import {
  appendUniqueIds,
  clampNumber,
  createContentHash,
  insertNextId,
  moveQueueId,
  normalizeSearchText,
  sanitizeIdList,
  searchTracks,
} from "../app/lib/library.ts";

function track(id, patch = {}) {
  return {
    id,
    title: id,
    fileName: `${id}.mp3`,
    fileType: "audio/mpeg",
    fileSize: 100,
    favorite: false,
    playCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

test("search normalizes full-width text and requires every query token", () => {
  const tracks = [
    track("one", { title: "ＦＬＡＣ Demo", artist: "Sample Artist", album: "Night" }),
    track("two", { title: "FLAC Demo", artist: "Other", album: "Day" }),
  ];
  assert.equal(normalizeSearchText("  ＦＬＡＣ　DEMO  "), "flac demo");
  assert.deepEqual(searchTracks(tracks, "flac sample").map(({ id }) => id), ["one"]);
});

test("search ranks title matches and supports quality filters without suffix false positives", () => {
  const tracks = [
    track("artist-match", { title: "Elsewhere", artist: "Orbit" }),
    track("title-match", { title: "Orbit", artist: "Elsewhere" }),
    track("flac", { fileName: "music.flac", fileType: "audio/flac", lossless: true }),
    track("false-positive", { fileName: "notflac" }),
    track("hires", { sampleRate: 96_000, bitsPerSample: 24 }),
  ];
  assert.deepEqual(searchTracks(tracks, "orbit").slice(0, 2).map(({ id }) => id), ["title-match", "artist-match"]);
  assert.deepEqual(searchTracks(tracks, "", "lossless").map(({ id }) => id), ["flac"]);
  assert.deepEqual(searchTracks(tracks, "", "hires").map(({ id }) => id), ["hires"]);
});

test("queue helpers preserve uniqueness and manual ordering", () => {
  assert.deepEqual(appendUniqueIds(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(insertNextId(["a", "b", "c"], "c", "a"), ["a", "c", "b"]);
  assert.deepEqual(insertNextId(["a", "b"], "a", "a"), ["a", "b"]);
  assert.deepEqual(insertNextId(["a", "b"], "c"), ["c", "a", "b"]);
  assert.deepEqual(moveQueueId(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  const unchanged = ["a"];
  assert.equal(moveQueueId(unchanged, 0, 2), unchanged);
});

test("stored IDs and numeric settings are sanitized", () => {
  const valid = new Set(["a", "b"]);
  assert.deepEqual(sanitizeIdList(["a", "bad", "a", "b", 2], valid), ["a", "b"]);
  assert.deepEqual(sanitizeIdList("a", valid), []);
  assert.equal(clampNumber(2, 1, 0, 1), 1);
  assert.equal(clampNumber(-4, 1, 0, 1), 0);
  assert.equal(clampNumber(Number.NaN, 1, 0, 1), 1);
});

test("content hashes identify equal audio bytes independently of file names", async () => {
  const first = await createContentHash(new Uint8Array([1, 2, 3]).buffer);
  const same = await createContentHash(new Uint8Array([1, 2, 3]).buffer);
  const different = await createContentHash(new Uint8Array([1, 2, 4]).buffer);
  assert.ok(first);
  assert.equal(first, same);
  assert.notEqual(first, different);
});
