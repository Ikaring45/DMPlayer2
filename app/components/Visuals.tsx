"use client";

import { useEffect, useMemo } from "react";
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

export function NavIcon({ name }: { name: string }) {
  return <span className={`nav-icon nav-icon-${name}`} aria-hidden="true"><i /><i /><i /></span>;
}
