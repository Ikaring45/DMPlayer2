"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../types";

const artColors = [
  ["#f9739c", "#ffbe73"], ["#667eea", "#8b5cf6"], ["#14b8a6", "#67e8f9"],
  ["#fb7185", "#a855f7"], ["#60a5fa", "#34d399"], ["#f59e0b", "#ef4444"],
];

function hash(value: string) {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function Artwork({ track, size = "medium" }: { track?: Track; size?: "small" | "medium" | "large" }) {
  const colors = artColors[hash(track?.album ?? track?.title ?? "DM") % artColors.length];
  const artwork = track?.artwork;
  const artworkUrl = useMemo(() => artwork ? URL.createObjectURL(artwork) : undefined, [artwork]);
  useEffect(() => () => { if (artworkUrl) URL.revokeObjectURL(artworkUrl); }, [artworkUrl]);

  return (
    <div className={`art art-${size}`} style={{ background: `linear-gradient(145deg, ${colors[0]}, ${colors[1]})` }} aria-hidden="true">
      {artworkUrl ? (
        // Blob URLs are local IndexedDB artwork and cannot use Next's remote image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artworkUrl} alt="" />
      ) : <span>{track?.title?.slice(0, 1).toUpperCase() ?? "♪"}</span>}
    </div>
  );
}

type ArtworkPhase = "idle" | "exit-next" | "exit-previous" | "enter-next" | "enter-previous";

export function JukeboxArtwork({ track, playing }: { track: Track; playing: boolean }) {
  const [displayedTrack, setDisplayedTrack] = useState(track);
  const [phase, setPhase] = useState<ArtworkPhase>("idle");
  const displayedId = useRef(track.id);
  const direction = useRef<"next" | "previous">("next");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const rememberDirection = (event: Event) => {
      direction.current = (event as CustomEvent<{ direction: "next" | "previous" }>).detail?.direction ?? "next";
    };
    window.addEventListener("dmplayer:track-transition", rememberDirection);
    return () => window.removeEventListener("dmplayer:track-transition", rememberDirection);
  }, []);

  useEffect(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    if (track.id === displayedId.current) {
      setDisplayedTrack(track);
      return;
    }
    const travel = direction.current;
    setPhase(travel === "next" ? "exit-next" : "exit-previous");
    timers.current.push(window.setTimeout(() => {
      displayedId.current = track.id;
      setDisplayedTrack(track);
      setPhase(travel === "next" ? "enter-next" : "enter-previous");
      timers.current.push(window.setTimeout(() => setPhase("idle"), 34));
    }, 190));
    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, [track]);

  return <div className={`jukebox-artwork ${playing ? "is-playing" : "is-paused"} ${phase}`}><Artwork track={displayedTrack} size="large" /></div>;
}

export function NavIcon({ name }: { name: string }) {
  return <span className={`nav-icon nav-icon-${name}`} aria-hidden="true"><i /><i /><i /></span>;
}

export function PlayerControlIcon({ name }: { name: "shuffle" | "previous" | "play" | "pause" | "next" | "repeat" | "volume-low" | "volume-high" }) {
  if (name === "play") return <svg className="player-control-icon filled" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8a1 1 0 0 0 0-1.6l-10-6.8A1 1 0 0 0 8 5.2Z" /></svg>;
  if (name === "pause") return <svg className="player-control-icon filled" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" /></svg>;
  if (name === "previous" || name === "next") return <svg className={`player-control-icon ${name}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M18.5 6.4 9 12l9.5 5.6V6.4Z" /></svg>;
  if (name === "shuffle") return <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h2.2c5.6 0 6 10 11.6 10H20m-2.7-2.7L20 17l-2.7 2.7M4 17h2.2c2.2 0 3.6-1.5 4.8-3.3m2-3.5C14.2 8.4 15.6 7 17.8 7H20m-2.7-2.7L20 7l-2.7 2.7" /></svg>;
  if (name === "repeat") return <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 6H7a4 4 0 0 0-4 4v1m14.5-8L21 6l-3.5 3M6.5 18H17a4 4 0 0 0 4-4v-1M6.5 21 3 18l3.5-3" /></svg>;
  return <svg className="player-control-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l4 3.5v-11L7 10H4Z" /><path d="M14.2 10.1a3.2 3.2 0 0 1 0 3.8" /><path d="M16.8 7a7 7 0 0 1 0 10" className={name === "volume-low" ? "volume-outer" : ""} /></svg>;
}
