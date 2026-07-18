export type MidiNote = {
  start: number;
  end: number;
  note: number;
  velocity: number;
  channel: number;
  program: number;
};

export type MidiInfo = {
  title?: string;
  duration: number;
  noteCount: number;
  channelCount: number;
  programs: Array<{ channel: number; program: number; name: string; notes: number }>;
  pitchRange: [number, number];
  peakPolyphony: number;
  notes: Array<[number, number, number, number, number, number]>;
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

export async function renderMidiToWav(data: ArrayBuffer): Promise<{ audioData: ArrayBuffer; duration: number; title?: string; midi: MidiInfo }> {
  const midi = parseMidi(data);
  if (!midi.notes.length) throw new Error("再生できるノートがMIDIにありません");
  if (midi.duration > 20 * 60) throw new Error("20分を超えるMIDIは変換できません");
  if (midi.notes.length > 8_000) throw new Error("ノート数が多すぎるMIDIは変換できません");

  const sampleRate = 44_100;
  const renderDuration = midi.duration + 0.8;
  const OfflineContext = window.OfflineAudioContext
    || (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("この端末はMIDI音源化に対応していません");
  const context = new OfflineContext(2, Math.ceil(renderDuration * sampleRate), sampleRate);
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
    const pan = context.createStereoPanner();
    pan.pan.value = percussion ? ((note.note * 17) % 11 - 5) / 10 : ((note.channel * 37) % 13 - 6) / 9;
    oscillator.connect(gain).connect(pan).connect(compressor);
    oscillator.start(note.start);
    oscillator.stop(releaseEnd);
  }

  const rendered = await context.startRendering();
  return {
    audioData: encodeStereoWav(rendered.getChannelData(0), rendered.getChannelData(1), rendered.sampleRate),
    duration: midi.duration,
    title: midi.title,
    midi: summarizeMidi(midi),
  };
}

function waveformForProgram(program: number): OscillatorType {
  if (program < 8) return "triangle";
  if (program < 24) return "sine";
  if (program < 40) return "sawtooth";
  if (program < 56) return "square";
  if (program < 80) return "triangle";
  return program < 104 ? "sine" : "sawtooth";
}

function summarizeMidi(midi: ParsedMidi): MidiInfo {
  const grouped = new Map<string, number>();
  for (const note of midi.notes) {
    const key = `${note.channel}:${note.program}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const programs = [...grouped].map(([key, notes]) => {
    const [channel, program] = key.split(":").map(Number);
    return { channel, program, name: channel === 9 ? "Drum Kit" : gmProgramName(program), notes };
  }).sort((a, b) => b.notes - a.notes);
  const pitchRange: [number, number] = midi.notes.length
    ? [Math.min(...midi.notes.map((note) => note.note)), Math.max(...midi.notes.map((note) => note.note))]
    : [0, 127];
  return {
    title: midi.title,
    duration: midi.duration,
    noteCount: midi.notes.length,
    channelCount: new Set(midi.notes.map((note) => note.channel)).size,
    programs,
    pitchRange,
    peakPolyphony: calculatePeakPolyphony(midi.notes),
    notes: midi.notes.map((note) => [
      Math.round(note.start * 1000) / 1000,
      Math.round(note.end * 1000) / 1000,
      note.note,
      note.velocity,
      note.channel,
      note.program,
    ]),
  };
}

function calculatePeakPolyphony(notes: MidiNote[]) {
  const edges = notes.flatMap((note) => [[note.start, 1], [note.end, -1]] as Array<[number, number]>)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0;
  let peak = 0;
  for (const [, delta] of edges) { active += delta; peak = Math.max(peak, active); }
  return peak;
}

export function gmProgramName(program: number) {
  const families = ["Piano", "Chromatic", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass", "Reed", "Pipe", "Synth Lead", "Synth Pad", "Synth FX", "Ethnic", "Percussive", "Sound FX"];
  return `${families[Math.floor(Math.max(0, Math.min(127, program)) / 8)]} ${program % 8 + 1}`;
}

function encodeStereoWav(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const frames = Math.min(left.length, right.length);
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + frames * 4, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, frames * 4, true);
  for (let index = 0; index < frames; index += 1) {
    const leftSample = Math.max(-1, Math.min(1, left[index] * 0.9));
    const rightSample = Math.max(-1, Math.min(1, right[index] * 0.9));
    view.setInt16(44 + index * 4, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7fff, true);
    view.setInt16(46 + index * 4, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7fff, true);
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
