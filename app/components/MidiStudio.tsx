"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../types";

const CHANNEL_COLORS = [
  "#ff4f87", "#ff9f43", "#ffd43b", "#7bdc65",
  "#31d2c5", "#3ba8ff", "#6f7cff", "#a56bff",
  "#df65dd", "#ff6b6b", "#68d9ff", "#9ee37d",
  "#f7b267", "#70a1ff", "#c56cf0", "#ff7aa2",
];

function noteName(note: number) {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

export function MidiStudio({
  track,
  audioRef,
}: {
  track: Track;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}) {
  const midi = track.midi;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const channels = useMemo(() => midi?.programs.slice(0, 8) ?? [], [midi]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    audio.preservesPitch = true;
  }, [audioRef, speed]);

  useEffect(() => {
    if (!midi) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const w = bounds.width;
      const h = bounds.height;
      const audioTime = audioRef.current?.currentTime ?? 0;
      setCurrentTime((previous) => Math.abs(previous - audioTime) > 0.08 ? audioTime : previous);
      const keyboardWidth = 40;
      const minPitch = Math.max(0, midi.pitchRange[0] - 2);
      const maxPitch = Math.min(127, midi.pitchRange[1] + 2);
      const pitchSpan = Math.max(12, maxPitch - minPitch + 1);
      const noteHeight = h / pitchSpan;
      const secondsVisible = 9;
      const playheadX = keyboardWidth + (w - keyboardWidth) * 0.28;

      context.clearRect(0, 0, w, h);
      context.fillStyle = "rgba(8, 9, 18, .96)";
      context.fillRect(0, 0, w, h);
      for (let pitch = minPitch; pitch <= maxPitch; pitch += 1) {
        const y = h - (pitch - minPitch + 1) * noteHeight;
        const black = [1, 3, 6, 8, 10].includes(pitch % 12);
        context.fillStyle = black ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.055)";
        context.fillRect(keyboardWidth, y, w - keyboardWidth, noteHeight);
        if (pitch % 12 === 0) {
          context.strokeStyle = "rgba(255,255,255,.11)";
          context.beginPath();
          context.moveTo(keyboardWidth, y + noteHeight);
          context.lineTo(w, y + noteHeight);
          context.stroke();
        }
      }

      const pixelsPerSecond = (w - keyboardWidth) / secondsVisible;
      for (const [start, end, pitch, velocity, channel] of midi.notes) {
        const x = playheadX + (start - audioTime) * pixelsPerSecond;
        const noteWidth = Math.max(2, (end - start) * pixelsPerSecond);
        if (x + noteWidth < keyboardWidth || x > w) continue;
        const y = h - (pitch - minPitch + 1) * noteHeight + 1;
        context.globalAlpha = 0.42 + velocity / 127 * 0.58;
        context.fillStyle = CHANNEL_COLORS[channel % CHANNEL_COLORS.length];
        context.fillRect(x, y, noteWidth, Math.max(2, noteHeight - 2));
      }
      context.globalAlpha = 1;

      for (let pitch = minPitch; pitch <= maxPitch; pitch += 1) {
        const y = h - (pitch - minPitch + 1) * noteHeight;
        const black = [1, 3, 6, 8, 10].includes(pitch % 12);
        const active = midi.notes.some(([start, end, note]) => note === pitch && start <= audioTime && end >= audioTime);
        context.fillStyle = active ? "#ff4f87" : black ? "#292a34" : "#f3f3f5";
        context.fillRect(0, y, black ? 26 : keyboardWidth, Math.max(1, noteHeight - 1));
        if (pitch % 12 === 0 && noteHeight >= 6) {
          context.fillStyle = black ? "#c7c7cf" : "#52535e";
          context.font = "7px system-ui";
          context.fillText(noteName(pitch), 27, y + Math.min(noteHeight - 1, 8));
        }
      }

      context.strokeStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, h);
      context.stroke();
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [audioRef, midi]);

  if (!midi) return null;

  return (
    <section className="midi-studio" aria-label="MIDI Studio">
      <header>
        <div><span>MIDI STUDIO</span><strong>Live Piano Roll</strong></div>
        <b>{midi.noteCount.toLocaleString()} NOTES</b>
      </header>
      <canvas
        ref={canvasRef}
        onClick={(event) => {
          const audio = audioRef.current;
          if (!audio) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const delta = (event.clientX - bounds.left - bounds.width * 0.28) / Math.max(1, bounds.width - 40) * 9;
          audio.currentTime = Math.max(0, Math.min(midi.duration, audio.currentTime + delta));
        }}
      />
      <div className="midi-stats">
        <div><span>CH</span><strong>{midi.channelCount}</strong></div>
        <div><span>POLY</span><strong>{midi.peakPolyphony}</strong></div>
        <div><span>RANGE</span><strong>{noteName(midi.pitchRange[0])}–{noteName(midi.pitchRange[1])}</strong></div>
        <div><span>TIME</span><strong>{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}</strong></div>
      </div>
      <div className="midi-speed">
        <span>TEMPO</span>
        {[0.75, 1, 1.25, 1.5].map((value) => (
          <button className={speed === value ? "active" : ""} key={value} onClick={() => setSpeed(value)}>{value}×</button>
        ))}
      </div>
      <div className="midi-channels">
        {channels.map((program) => (
          <span key={`${program.channel}-${program.program}`}>
            <i style={{ background: CHANNEL_COLORS[program.channel % CHANNEL_COLORS.length] }} />
            CH {program.channel + 1} · {program.name}
          </span>
        ))}
      </div>
    </section>
  );
}
