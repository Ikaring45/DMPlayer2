"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "../lib/lyrics";
import { usePlayerStore } from "../store";
import { FavoriteButton } from "./FavoriteButton";
import { Artwork, UiIcon } from "./Visuals";

export function TabletPlayer({
  audioRef,
  onOpen,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onOpen: () => void;
}) {
  const store = usePlayerStore();
  const track = store.tracks.find((item) => item.id === store.currentId);
  const loading = store.playbackStatus === "loading";
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const seekingRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => {
      if (!seekingRef.current) setTime(audio.currentTime);
      setDuration(audio.duration || track?.duration || 0);
    };
    update();
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("durationchange", update);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("durationchange", update);
    };
  }, [audioRef, track]);

  const previewSeek = (value: number) => {
    seekingRef.current = true;
    setTime(value);
  };
  const commitSeek = (value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value;
    setTime(value);
    seekingRef.current = false;
  };

  if (!track) {
    return <aside className="ipad-player empty"><span><UiIcon name="artwork" /></span><strong>曲を選択</strong><small>ライブラリから曲を選ぶと、ここに再生情報が表示されます。</small></aside>;
  }

  return (
    <aside className="ipad-player">
      <header><span>NOW PLAYING</span><button className="ipad-expand" onClick={onOpen} aria-label="再生画面を拡大"><UiIcon name="expand" /></button></header>
      <button className="ipad-art" onClick={onOpen}><Artwork track={track} size="medium" /></button>
      <div className="ipad-track-info">
        <div><strong>{track.title}</strong><small>{loading ? "音源を読み込み中…" : `${track.artist} · ${track.album}`}</small></div>
        <FavoriteButton
          favorite={track.favorite}
          onToggle={() => void store.updateTrack(track.id, { favorite: !track.favorite })}
        />
      </div>
      <div className="ipad-seek">
        <input
          aria-label="再生位置"
          type="range"
          min="0"
          max={duration || 1}
          step="0.1"
          value={Math.min(time, duration || 1)}
          style={{ "--seek-progress": `${duration ? Math.min(100, time / duration * 100) : 0}%` } as React.CSSProperties}
          onPointerDown={() => { seekingRef.current = true; }}
          onInput={(event) => previewSeek(Number(event.currentTarget.value))}
          onChange={(event) => previewSeek(Number(event.currentTarget.value))}
          onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
          onPointerCancel={(event) => commitSeek(Number(event.currentTarget.value))}
          onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))}
          onBlur={(event) => { if (seekingRef.current) commitSeek(Number(event.currentTarget.value)); }}
        />
        <div><span>{formatTime(time)}</span><span>-{formatTime(Math.max(0, duration - time))}</span></div>
      </div>
      <div className="ipad-controls">
        <button onClick={store.previous} aria-label="前の曲">|◀</button>
        <button
          className={`ipad-play ${loading ? "is-loading" : ""}`}
          onClick={() => store.playing ? store.setPlaying(false) : store.playTrack(track.id, store.queue)}
          aria-label={loading ? "読み込み中" : store.playing ? "一時停止" : "再生"}
        >{loading ? <i className="playback-spinner" /> : store.playing ? "Ⅱ" : "▶"}</button>
        <button onClick={store.next} aria-label="次の曲">▶|</button>
      </div>
      <div className="ipad-player-status">
        <button className={store.shuffle ? "active" : ""} aria-pressed={store.shuffle} onClick={store.toggleShuffle}>シャッフル</button>
        <span>{store.eqEnabled ? "EQ ON" : "EQ OFF"}</span>
        <button className={store.repeat !== "off" ? "active" : ""} aria-pressed={store.repeat !== "off"} onClick={store.cycleRepeat}>リピート {store.repeat === "one" ? "1" : ""}</button>
      </div>
      {track.midi && <div className="ipad-midi-card">
        <header><span>MIDI ENGINE</span><b>44.1 kHz · STEREO</b></header>
        <div><strong>{track.midi.noteCount.toLocaleString()}</strong><small>NOTES</small><strong>{track.midi.channelCount}</strong><small>CHANNELS</small><strong>{track.midi.peakPolyphony}</strong><small>MAX POLY</small></div>
        <p>{track.midi.programs.slice(0, 3).map((program) => `CH${program.channel + 1} ${program.name}`).join(" · ")}</p>
      </div>}
      <div className="ipad-up-next">
        <span>次に再生</span>
        {store.queue.slice(Math.max(0, store.queue.indexOf(track.id) + 1), Math.max(0, store.queue.indexOf(track.id) + 4)).map((id) => {
          const item = store.tracks.find((candidate) => candidate.id === id);
          return item ? <button key={id} onClick={() => store.playTrack(id, store.queue)}><Artwork track={item} size="small" /><span><strong>{item.title}</strong><small>{item.artist}</small></span></button> : null;
        })}
      </div>
    </aside>
  );
}
