import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_FILE_ACCEPT,
  getAudioFormatLabel,
  getAudioMimeType,
  isAudioFile,
  isFlacData,
  isWavData,
} from "../app/lib/audio-formats.ts";

function wavHeader(chunkId = "RIFF", formType = "WAVE") {
  const bytes = new Uint8Array(12);
  bytes.set(new TextEncoder().encode(chunkId), 0);
  bytes.set(new TextEncoder().encode(formType), 8);
  return bytes;
}

test("WAV files are exposed to the native file picker", () => {
  assert.match(AUDIO_FILE_ACCEPT, /(?:^|,)\.wav(?:,|$)/);
  assert.match(AUDIO_FILE_ACCEPT, /(?:^|,)\.wave(?:,|$)/);
});

test("WAV extensions and MIME aliases normalize to audio/wav", () => {
  for (const [name, type] of [
    ["recording.wav", ""],
    ["recording.WAVE", "application/octet-stream"],
    ["recording", "audio/x-wav"],
    ["recording", "audio/wave"],
    ["recording", "audio/vnd.wave"],
  ]) {
    assert.equal(getAudioMimeType(name, type), "audio/wav");
    assert.equal(isAudioFile({ name, type }), true);
  }
});

test("RIFF, big-endian, RF64, and Broadcast Wave headers are recognized", () => {
  for (const chunkId of ["RIFF", "RIFX", "RF64", "BW64"]) {
    assert.equal(isWavData(wavHeader(chunkId)), true);
  }
  assert.equal(isWavData(wavHeader("RIFF", "AVI ")), false);
  assert.equal(isWavData(new Uint8Array(4)), false);
});

test("WAV detection accepts typed-array views without reading outside the view", () => {
  const padded = new Uint8Array(20);
  padded.set(wavHeader(), 4);
  assert.equal(isWavData(padded.subarray(4, 16)), true);
  assert.equal(isWavData(padded.subarray(0, 12)), false);
});

test("FLAC files are exposed to the picker and MIME aliases normalize", () => {
  assert.match(AUDIO_FILE_ACCEPT, /(?:^|,)\.flac(?:,|$)/);
  for (const [name, type] of [
    ["recording.flac", ""],
    ["recording.FLAC", "application/octet-stream"],
    ["recording", "audio/x-flac"],
    ["recording", "application/flac"],
    ["recording", "application/x-flac"],
  ]) {
    assert.equal(getAudioMimeType(name, type), "audio/flac");
    assert.equal(isAudioFile({ name, type }), true);
  }
});

test("native FLAC signatures are recognized from buffers and typed-array views", () => {
  const signature = new Uint8Array([0x66, 0x4c, 0x61, 0x43]);
  assert.equal(isFlacData(signature.buffer), true);
  assert.equal(isFlacData(signature), true);

  const padded = new Uint8Array(8);
  padded.set(signature, 2);
  assert.equal(isFlacData(padded.subarray(2, 6)), true);
  assert.equal(isFlacData(padded.subarray(0, 4)), false);
  assert.equal(isFlacData(new Uint8Array([0x4f, 0x67, 0x67, 0x53])), false);
  assert.equal(isFlacData(new Uint8Array(3)), false);
});

test("canonical MIME detected from bytes wins over a misleading extension", () => {
  assert.equal(getAudioMimeType("actually-flac.wav", "audio/flac"), "audio/flac");
  assert.equal(getAudioMimeType("actually-wave.flac", "audio/wav"), "audio/wav");
  assert.equal(getAudioFormatLabel("actually-flac.wav", "audio/flac"), "FLAC");
  assert.equal(getAudioFormatLabel("actually-wave.flac", "audio/wav"), "WAV");
});
