"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Track } from "../types";

type AudioFrame = { bands: number[]; level: number };

export function NowPlayingBackdrop({ track }: { track: Track }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<AudioFrame>({ bands: [0, 0, 0, 0, 0], level: 0 });
  const colorsRef = useRef(["#ff3e79", "#ff8157", "#8a5cff", "#2cb7ff", "#37dfc4"]);
  const artwork = useMemo(() => track.artwork ?? (track.artworkData
    ? new Blob([track.artworkData], { type: track.artworkType || "image/jpeg" })
    : undefined), [track.artwork, track.artworkData, track.artworkType]);
  const artworkUrl = useMemo(() => artwork ? URL.createObjectURL(artwork) : undefined, [artwork]);

  useEffect(() => () => {
    if (artworkUrl) URL.revokeObjectURL(artworkUrl);
  }, [artworkUrl]);

  useEffect(() => {
    const root = rootRef.current;
    if (!artworkUrl || !root) return;
    const image = new Image();
    image.onload = () => {
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 24;
      sampleCanvas.height = 24;
      const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!sampleContext) return;
      sampleContext.drawImage(image, 0, 0, 24, 24);
      const pixels = sampleContext.getImageData(0, 0, 24, 24).data;
      const anchors = [[4, 4], [19, 5], [12, 12], [5, 19], [19, 19]];
      const colors = anchors.map(([centerX, centerY]) => {
        let red = 0; let green = 0; let blue = 0; let count = 0;
        for (let y = centerY - 3; y <= centerY + 3; y += 1) {
          for (let x = centerX - 3; x <= centerX + 3; x += 1) {
            const offset = (Math.max(0, Math.min(23, y)) * 24 + Math.max(0, Math.min(23, x))) * 4;
            red += pixels[offset]; green += pixels[offset + 1]; blue += pixels[offset + 2]; count += 1;
          }
        }
        const average = [red / count, green / count, blue / count];
        const mean = average.reduce((sum, value) => sum + value, 0) / 3;
        const vivid = average.map((value) => Math.max(18, Math.min(244, mean + (value - mean) * 1.65 + 12)));
        return `#${vivid.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
      });
      colorsRef.current = colors;
      colors.forEach((color, index) => root.style.setProperty(`--art-color-${index + 1}`, color));
    };
    image.src = artworkUrl;
    return () => { image.onload = null; };
  }, [artworkUrl]);

  useEffect(() => {
    const update = (event: Event) => {
      levelsRef.current = (event as CustomEvent<AudioFrame>).detail;
    };
    window.addEventListener("dmplayer:audio-frame", update);
    return () => window.removeEventListener("dmplayer:audio-frame", update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let smoothed = [0, 0, 0, 0, 0];
    let energy = 0;
    const draw = (timestamp: number) => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(1.5, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      const input = levelsRef.current;
      smoothed = smoothed.map((value, index) => value * 0.86 + (input.bands[index] ?? 0) * 0.14);
      energy = energy * 0.9 + input.level * 0.1;
      root.style.setProperty("--audio-energy", energy.toFixed(3));
      root.style.setProperty("--bass-energy", (smoothed[0] ?? 0).toFixed(3));
      root.style.setProperty("--treble-energy", (smoothed[4] ?? 0).toFixed(3));

      context.globalCompositeOperation = "screen";
      context.filter = `blur(${28 + energy * 22}px)`;
      colorsRef.current.forEach((color, index) => {
        const strength = smoothed[index] ?? 0;
        const phase = timestamp / (5200 - index * 430) + index * 1.37;
        const radius = Math.min(bounds.width, bounds.height) * (0.19 + index * 0.025 + strength * 0.11);
        const x = bounds.width * (0.5 + Math.sin(phase * (1 + index * .08)) * (0.22 + strength * .06));
        const y = bounds.height * (0.48 + Math.cos(phase * .83 + index) * (0.23 + strength * .05));
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `${color}${Math.round((0.22 + strength * .33) * 255).toString(16).padStart(2, "0")}`);
        gradient.addColorStop(1, `${color}00`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      });
      context.filter = "none";
      context.globalCompositeOperation = "source-over";
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const artStyle = artworkUrl ? { backgroundImage: `url("${artworkUrl}")` } : undefined;
  return (
    <div className={`now-backdrop ${artworkUrl ? "has-art" : "fallback-art"}`} ref={rootRef} aria-hidden="true">
      <div className="backdrop-art backdrop-art-base" style={artStyle} />
      <div className="backdrop-art backdrop-art-focus" style={artStyle} />
      <div className="backdrop-art backdrop-art-orbit one" style={artStyle} />
      <div className="backdrop-art backdrop-art-orbit two" style={artStyle} />
      <div className="backdrop-art backdrop-art-orbit three" style={artStyle} />
      <canvas ref={canvasRef} />
      <div className="backdrop-depth" />
      <div className="backdrop-grain" />
    </div>
  );
}
