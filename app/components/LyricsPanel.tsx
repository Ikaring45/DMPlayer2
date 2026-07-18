"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "../types";

type LyricsPanelProps = {
  track: Track;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  time: number;
  activeLine: number;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEdit: () => void;
};

export function LyricsPanel({
  track,
  audioRef,
  time,
  activeLine,
  editing,
  draft,
  onDraftChange,
  onCancelEdit,
  onSave,
  onEdit,
}: LyricsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);

  const scrollToActiveLine = useCallback((behavior: ScrollBehavior = "smooth") => {
    const scroller = scrollRef.current;
    if (!scroller || activeLine < 0) return;
    const line = scroller.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (!line) return;
    scroller.scrollTo({
      top: Math.max(0, line.offsetTop - scroller.clientHeight * .38),
      behavior,
    });
  }, [activeLine]);

  useEffect(() => {
    if (following) scrollToActiveLine();
  }, [following, scrollToActiveLine]);

  if (editing) {
    return <section className="lyrics-panel lyrics-editing"><div className="lyrics-toolbar"><div><small>LYRICS</small><strong>歌詞を編集</strong></div></div><div className="lyrics-editor"><textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="歌詞、またはLRC形式の同期歌詞を入力" /><div><button onClick={onCancelEdit}>キャンセル</button><button className="primary-button compact" onClick={onSave}>保存</button></div></div></section>;
  }

  const seekToLine = (index: number) => {
    const line = track.syncedLyrics?.[index];
    if (!line || !audioRef.current) return;
    audioRef.current.currentTime = line.time;
    setFollowing(true);
  };

  return <section className="lyrics-panel">
    <div className="lyrics-toolbar">
      <div><small>LIVE LYRICS</small><strong>{track.title}</strong></div>
      <button onClick={onEdit} aria-label="歌詞を編集">•••</button>
    </div>
    <div
      className="lyrics-scroll"
      ref={scrollRef}
      onPointerDown={() => setFollowing(false)}
      onWheel={() => setFollowing(false)}
    >
      {track.syncedLyrics?.length ? <>
        <div className="lyrics-leading-space" />
        {track.syncedLyrics.map((line, index) => {
          const distance = Math.abs(index - activeLine);
          const nextTime = track.syncedLyrics?.[index + 1]?.time ?? line.time + 5;
          const progress = index === activeLine
            ? Math.max(0, Math.min(100, (time - line.time) / Math.max(.4, nextTime - line.time) * 100))
            : index < activeLine ? 100 : 0;
          return <button
            data-line={index}
            data-text={line.text}
            key={`${line.time}-${index}`}
            className={`lyrics-line ${index === activeLine ? "current" : ""} ${distance === 1 ? "near" : distance > 3 ? "far" : ""}`}
            style={{ "--lyric-progress": `${progress}%` } as React.CSSProperties}
            onClick={() => seekToLine(index)}
          >{line.text}</button>;
        })}
        <div className="lyrics-trailing-space" />
      </> : track.lyrics ? <p className="plain-lyrics">{track.lyrics}</p> : <div className="no-lyrics"><span aria-hidden="true">“</span><strong>歌詞はまだありません</strong><small>埋め込み歌詞を読み込むか、歌詞を追加できます。</small><button className="primary-button compact" onClick={onEdit}>歌詞を追加</button></div>}
    </div>
    {!following && activeLine >= 0 && <button className="lyrics-follow" onClick={() => { setFollowing(true); scrollToActiveLine(); }}><span>↑</span> 再生中の歌詞へ</button>}
  </section>;
}
