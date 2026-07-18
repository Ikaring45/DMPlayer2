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
      setPhase("idle");
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

export type UiIconName = "play" | "next" | "queue" | "heart" | "edit" | "refresh" | "playlist" | "info" | "trash" | "shuffle" | "back" | "more" | "sound" | "palette" | "storage" | "shield" | "app" | "add" | "search" | "close";

export function UiIcon({ name }: { name: UiIconName }) {
  const common = { className: "ui-icon", viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (name === "play") return <svg {...common}><path d="M8 5.5v13l11-6.5L8 5.5Z" /></svg>;
  if (name === "next") return <svg {...common}><path d="M6 5.5v13l9.5-6.5L6 5.5ZM18 6v12" /></svg>;
  if (name === "queue") return <svg {...common}><path d="M5 7h10M5 12h10M5 17h7M18 14v6m-3-3h6" /></svg>;
  if (name === "heart") return <svg {...common}><path d="M12 20S4.5 15.7 4.5 9.7A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.6C19.5 15.7 12 20 12 20Z" /></svg>;
  if (name === "edit") return <svg {...common}><path d="m5 16-.8 4 4-.8L19 8.4 15.6 5 5 16ZM13.8 6.8l3.4 3.4" /></svg>;
  if (name === "refresh") return <svg {...common}><path d="M19 8a7.5 7.5 0 1 0 .2 7.6M19 4v4h-4" /></svg>;
  if (name === "playlist") return <svg {...common}><path d="M4 6h11M4 11h11M4 16h7M18 13v7m-3.5-3.5h7" /></svg>;
  if (name === "info") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 10.5V17M12 7.3h.01" /></svg>;
  if (name === "trash") return <svg {...common}><path d="M5 7h14M9 7V4.5h6V7m-8 0 1 13h8l1-13M10 10v7m4-7v7" /></svg>;
  if (name === "shuffle") return <svg {...common}><path d="M4 7h2c5.5 0 6 10 12 10h2m-3-3 3 3-3 3M4 17h2c2 0 3.4-1.4 4.5-3m3-4c1.1-1.7 2.5-3 4.5-3h2m-3-3 3 3-3 3" /></svg>;
  if (name === "back") return <svg {...common}><path d="m14.5 5-7 7 7 7" /></svg>;
  if (name === "sound") return <svg {...common}><path d="M4 10v4h3l4 3.5v-11L7 10H4Zm10.5.2a3 3 0 0 1 0 3.6M17 7.5a6.5 6.5 0 0 1 0 9" /></svg>;
  if (name === "palette") return <svg {...common}><path d="M12 4a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 0-3.6h-.7a1.5 1.5 0 0 1 0-3H16A4 4 0 0 0 20 9.5C20 6.4 16.4 4 12 4Z" /><circle cx="8" cy="9" r=".8" /><circle cx="11" cy="7" r=".8" /><circle cx="15" cy="8" r=".8" /></svg>;
  if (name === "storage") return <svg {...common}><ellipse cx="12" cy="6.5" rx="7.5" ry="3" /><path d="M4.5 6.5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5m-15 5v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3.8 19 7v5.2c0 4.2-2.8 7-7 8.2-4.2-1.2-7-4-7-8.2V7l7-3.2Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === "app") return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
  if (name === "add") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 4.5 4.5" /></svg>;
  if (name === "close") return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  return <svg {...common}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>;
}
