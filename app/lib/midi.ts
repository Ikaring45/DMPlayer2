export type MidiNote = {
  start: number;
  end: number;
  note: number;
  velocity: number;
  channel: number;
  program: number;
};

export type ParsedMidi = {
  title?: string;
  duration: number;
  notes: MidiNote[];
};

type RawEvent =
  | { tick: number; order: number; kind: "tempo"; tempo: number }
  | { tick: number; order: number; kind: "noteOn"; note: number; velocity: number; channel: number; program: number }
  | { tick: number; order: number; kind: "noteOff"; note: number; channel: number };

const textDecoder = new TextDecoder();

export function isMidiFile(fileName: string, mimeType = "") {
  return /\.(mid|midi)$/i.test(fileName) || /audio\/(?:midi|x-midi)/i.test(mimeType);
}

export function parseMidi(data: ArrayBuffer): ParsedMidi {
  const view = new DataView(data);
  if (data.byteLength < 14 || readAscii(view, 0, 4) !== "MThd") throw new Error("MIDIヘッダーが見つかりません");
  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error("SMPTE時間形式のMIDIにはまだ対応していません");
  if (!division || !trackCount) throw new Error("MIDIの時間情報またはトラックがありません");

  const events: RawEvent[] = [];
  let title: string | undefined;
  let position = 8 + headerLength;
  let order = 0;
  let maxTick = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (position + 8 > view.byteLength || readAscii(view, position, 4) !== "MTrk") break;
    const trackLength = view.getUint32(position + 4);
    let cursor = position + 8;
    const trackEnd = Math.min(view.byteLength, cursor + trackLength);
    let tick = 0;
    let runningStatus = 0;
    const programs = new Array<number>(16).fill(0);

    const readVariableLength = () => {
      let value = 0;
      for (let count = 0; count < 4 && cursor < trackEnd; count += 1) {
        const byte = view.getUint8(cursor++);
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) break;
      }
      return value;
    };

    while (cursor < trackEnd) {
      tick += readVariableLength();
      maxTick = Math.max(maxTick, tick);
      let status = view.getUint8(cursor);
      if (status < 0x80) {
        if (!runningStatus) throw new Error("不正なMIDIランニングステータスです");
        status = runningStatus;
      } else {
        cursor += 1;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        if (cursor >= trackEnd) break;
        const metaType = view.getUint8(cursor++);
        const length = readVariableLength();
        const end = Math.min(trackEnd, cursor + length);
        if (metaType === 0x51 && length === 3 && cursor + 3 <= trackEnd) {
          events.push({ tick, order: order++, kind: "tempo", tempo: readUint24(view, cursor) });
        } else if (!title && metaType === 0x03 && end > cursor) {
          title = textDecoder.decode(new Uint8Array(data, cursor, end - cursor)).trim() || undefined;
        }
        cursor = end;
        if (metaType === 0x2f) break;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        cursor = Math.min(trackEnd, cursor + readVariableLength());
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const first = cursor < trackEnd ? view.getUint8(cursor++) : 0;
      const needsSecond = command !== 0xc0 && command !== 0xd0;
      const second = needsSecond && cursor < trackEnd ? view.getUint8(cursor++) : 0;

      if (command === 0xc0) {
        programs[channel] = first;
      } else if (command === 0x90 && second > 0) {
        events.push({ tick, order: order++, kind: "noteOn", note: first, velocity: second, channel, program: programs[channel] });
      } else if (command === 0x80 || (command === 0x90 && second === 0)) {
        events.push({ tick, order: order++, kind: "noteOff", note: first, channel });
      }
    }
    position = trackEnd;
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const active = new Map<string, Array<{ start: number; note: number; velocity: number; channel: number; program: number }>>();
  const notes: MidiNote[] = [];
  let tempo = 500_000;
  let lastTick = 0;
  let seconds = 0;

  for (const event of events) {
    seconds += (event.tick - lastTick) * tempo / division / 1_000_000;
    lastTick = event.tick;
    if (event.kind === "tempo") {
      tempo = event.tempo;
      continue;
    }
    const key = `${event.channel}:${event.note}`;
    if (event.kind === "noteOn") {
      const stack = active.get(key) ?? [];
      stack.push({ start: seconds, note: event.note, velocity: event.velocity, channel: event.channel, program: event.program });
      active.set(key, stack);
    } else {
      const stack = active.get(key);
      const started = stack?.shift();
      if (started) notes.push({ ...started, end: Math.max(started.start + 0.04, seconds) });
      if (!stack?.length) active.delete(key);
    }
  }

  const tailSeconds = seconds + Math.max(0, maxTick - lastTick) * tempo / division / 1_000_000;
  for (const stack of active.values()) {
    for (const started of stack) notes.push({ ...started, end: Math.max(started.start + 0.1, tailSeconds) });
  }
  notes.sort((a, b) => a.start - b.start);
  const duration = Math.max(tailSeconds, ...notes.map((note) => note.end), 0);
  return { title, duration, notes };
}

export async function renderMidiToWav(data: ArrayBuffer): Promise<{ audioData: ArrayBuffer; duration: number; title?: string }> {
  const midi = parseMidi(data);
  if (!midi.notes.length) throw new Error("再生できるノートがMIDIにありません");
  if (midi.duration > 20 * 60) throw new Error("20分を超えるMIDIは変換できません");
  if (midi.notes.length > 8_000) throw new Error("ノート数が多すぎるMIDIは変換できません");

  const sampleRate = 32_000;
  const renderDuration = midi.duration + 0.35;
  const OfflineContext = window.OfflineAudioContext
    || (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("この端末はMIDI音源化に対応していません");
  const context = new OfflineContext(1, Math.ceil(renderDuration * sampleRate), sampleRate);
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 18;
  compressor.ratio.value = 7;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  compressor.connect(context.destination);

  for (const note of midi.notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const percussion = note.channel === 9;
    const noteEnd = percussion ? Math.min(note.end, note.start + 0.24) : note.end;
    const releaseEnd = Math.min(renderDuration, noteEnd + 0.16);
    const level = Math.max(0.015, note.velocity / 127 * (percussion ? 0.16 : 0.105));
    oscillator.type = percussion ? "sine" : waveformForProgram(note.program);
    oscillator.frequency.value = percussion
      ? 70 + (note.note % 18) * 19
      : 440 * 2 ** ((note.note - 69) / 12);
    gain.gain.setValueAtTime(0.0001, note.start);
    gain.gain.linearRampToValueAtTime(level, Math.min(note.start + 0.012, noteEnd));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level * 0.58), Math.min(note.start + 0.11, noteEnd));
    gain.gain.setValueAtTime(Math.max(0.0001, level * 0.58), noteEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);
    oscillator.connect(gain).connect(compressor);
    oscillator.start(note.start);
    oscillator.stop(releaseEnd);
  }

  const rendered = await context.startRendering();
  return { audioData: encodeMonoWav(rendered.getChannelData(0), rendered.sampleRate), duration: midi.duration, title: midi.title };
}

function waveformForProgram(program: number): OscillatorType {
  if (program < 8) return "triangle";
  if (program < 24) return "sine";
  if (program < 40) return "sawtooth";
  if (program < 56) return "square";
  if (program < 80) return "triangle";
  return program < 104 ? "sine" : "sawtooth";
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] * 0.9));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

function readAscii(view: DataView, offset: number, length: number) {
  return String.fromCharCode(...Array.from({ length }, (_, index) => view.getUint8(offset + index)));
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function readUint24(view: DataView, offset: number) {
  return view.getUint8(offset) * 0x10000 + view.getUint8(offset + 1) * 0x100 + view.getUint8(offset + 2);
}
