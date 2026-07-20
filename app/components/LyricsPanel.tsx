"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "../lib/lyrics";
import type { Track } from "../types";
import { UiIcon } from "./Visuals";

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
  const synced = Boolean(track.syncedLyrics?.length);

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

  useEffect(() => {
    const frame = requestAnimationFrame(() => setFollowing(true));
    return () => cancelAnimationFrame(frame);
  }, [track.id]);

  if (editing) {
    return <section className="lyrics-panel lyrics-editing">
      <div className="lyrics-toolbar">
        <div><small>LYRICS EDITOR</small><strong>歌詞を編集</strong></div>
        <span className="lyrics-format-badge">LRC対応</span>
      </div>
      <div className="lyrics-editor">
        <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder={"通常の歌詞、またはLRC形式を入力\n例：[00:12.50] 最初の歌詞"} aria-label="歌詞を編集" />
        <div className="lyrics-editor-footer"><small>{draft.length.toLocaleString("ja-JP")}文字</small><span><button onClick={onCancelEdit}>キャンセル</button><button className="primary-button compact" onClick={onSave}>保存</button></span></div>
      </div>
    </section>;
  }

  const seekToLine = (index: number) => {
    const line = track.syncedLyrics?.[index];
    if (!line || !audioRef.current) return;
    audioRef.current.currentTime = line.time;
    setFollowing(true);
  };

  return <section className="lyrics-panel">
    <div className="lyrics-toolbar">
      <div className="lyrics-toolbar-copy">
        <small><span className={`lyrics-type-badge ${synced ? "is-synced" : ""}`}>{synced ? "同期歌詞" : "歌詞"}</span>{synced ? activeLine >= 0 ? `${activeLine + 1} / ${track.syncedLyrics?.length ?? 0}` : "開始前" : track.artist || "不明なアーティスト"}</small>
        <strong>{track.title}</strong>
      </div>
      <div className="lyrics-toolbar-actions">
        {synced && <span className={`lyrics-follow-state ${following ? "is-following" : ""}`}><i />{following ? "追従中" : "手動"}</span>}
        <button className="lyrics-edit-button" onClick={onEdit} aria-label="歌詞を編集"><UiIcon name="edit" /><span>編集</span></button>
      </div>
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
            aria-current={index === activeLine ? "true" : undefined}
            aria-label={`${formatTime(line.time)} ${line.text}`}
          >{line.text}</button>;
        })}
        <div className="lyrics-trailing-space" />
      </> : track.lyrics ? <div className="plain-lyrics" role="document">{track.lyrics.split(/\r?\n/).map((line, index) => line.trim() ? <p key={`${index}-${line}`}>{line}</p> : <span className="plain-lyrics-gap" key={`gap-${index}`} aria-hidden="true" />)}</div> : <div className="no-lyrics"><span aria-hidden="true"><UiIcon name="lyrics" /></span><strong>歌詞はまだありません</strong><small>埋め込み歌詞を読み込むか、通常の歌詞・LRC同期歌詞を追加できます。</small><button className="primary-button compact" onClick={onEdit}><UiIcon name="add" />歌詞を追加</button></div>}
    </div>
    {!following && activeLine >= 0 && <button className="lyrics-follow" onClick={() => { setFollowing(true); scrollToActiveLine(); }}><UiIcon name="lyrics" />再生中の行へ戻る</button>}
  </section>;
}
