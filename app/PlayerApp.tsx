"use client";

import { useEffect, useRef, useState } from "react";
import { PlayerEngine } from "./components/PlayerEngine";
import { Artwork, JukeboxArtwork, NavIcon, PlayerControlIcon } from "./components/Visuals";
import { Equalizer } from "./components/Equalizer";
import { TabletPlayer } from "./components/TabletPlayer";
import { MidiStudio } from "./components/MidiStudio";
import { NowPlayingBackdrop } from "./components/NowPlayingBackdrop";
import { LyricsPanel } from "./components/LyricsPanel";
import { AUDIO_FILE_ACCEPT } from "./lib/audio-formats";
import { formatTime } from "./lib/lyrics";
import { usePlayerStore } from "./store";
import type { Track } from "./types";

type Tab = "library" | "playlists" | "search" | "settings";
type LibraryView = "home" | "songs" | "albums" | "artists" | "recent" | "history" | "favorites";

function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-note">♪</div><h2>音楽を、この端末に。</h2><p>ファイルは外部へ送信されません。iPhoneやiPadの「ファイル」から音源を追加できます。</p><button className="primary-button" onClick={onAdd}>音楽を追加</button><span>MP3・M4A・FLAC・WAV・MIDI・AIFF・OGG・OPUS</span></div>;
}

function TrackRow({ track, onMenu, source }: { track: Track; onMenu: (track: Track) => void; source?: string[] }) {
  const { currentId, playing, playTrack } = usePlayerStore();
  const active = currentId === track.id;
  return <div className={`track-row ${active ? "active" : ""}`}><button className="track-main" onClick={() => playTrack(track.id, source)} aria-label={`${track.title}を再生`}><Artwork track={track} size="small" /><span className="track-copy"><strong>{track.title}</strong><small>{track.artist || "不明なアーティスト"}{track.album ? ` · ${track.album}` : ""}</small></span>{active && <span className={`playing-bars ${playing ? "moving" : ""}`}><i /><i /><i /></span>}</button><button className="more-button" onClick={() => onMenu(track)} aria-label={`${track.title}のメニュー`}>•••</button></div>;
}

function MiniPlayer({ onOpen, audioRef }: { onOpen: () => void; audioRef: React.RefObject<HTMLAudioElement | null> }) {
  const { tracks, currentId, queue, playing, setPlaying, playTrack, next } = usePlayerStore();
  const track = tracks.find((item) => item.id === currentId);
  const [progress, setProgress] = useState(0);
  useEffect(() => { const audio = audioRef.current; if (!audio) return; const update = () => setProgress(audio.duration ? audio.currentTime / audio.duration * 100 : 0); audio.addEventListener("timeupdate", update); return () => audio.removeEventListener("timeupdate", update); }, [audioRef, track]);
  if (!track) return null;
  return <div className="mini-player"><div className="mini-progress" style={{ width: `${progress}%` }} /><button className="mini-main" onClick={onOpen}><Artwork track={track} size="small" /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button><button className="round-control" onClick={() => playing ? setPlaying(false) : playTrack(track.id, queue)} aria-label={playing ? "一時停止" : "再生"}>{playing ? "Ⅱ" : "▶"}</button><button className="round-control" onClick={next} aria-label="次の曲">▶|</button></div>;
}

function NowPlaying({ onClose, audioRef, closing = false }: { onClose: () => void; audioRef: React.RefObject<HTMLAudioElement | null>; closing?: boolean }) {
  const store = usePlayerStore(); const track = store.tracks.find((item) => item.id === store.currentId);
  const [time, setTime] = useState(0); const [duration, setDuration] = useState(track?.duration ?? 0); const [lyricsOpen, setLyricsOpen] = useState(false); const [queueOpen, setQueueOpen] = useState(false); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(track?.lyrics ?? "");
  const seekingRef = useRef(false);
  const playerRef = useRef<HTMLElement>(null);
  const dismissStartYRef = useRef(0);
  const dismissDistanceRef = useRef(0);
  const dismissStartedAtRef = useRef(0);
  const dismissResetTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => { const timer = window.setTimeout(() => { setDraft(track?.lyrics ?? ""); setEditing(false); }, 0); return () => window.clearTimeout(timer); }, [track?.id, track?.lyrics]);
  useEffect(() => { const audio = audioRef.current; if (!audio) return; const update = () => { if (!seekingRef.current) setTime(audio.currentTime); setDuration(audio.duration || track?.duration || 0); }; update(); audio.addEventListener("timeupdate", update); audio.addEventListener("durationchange", update); return () => { audio.removeEventListener("timeupdate", update); audio.removeEventListener("durationchange", update); }; }, [audioRef, track]);
  useEffect(() => () => {
    if (dismissResetTimerRef.current !== undefined) window.clearTimeout(dismissResetTimerRef.current);
  }, []);
  const activeLine = track?.syncedLyrics?.reduce((index, line, i) => line.time <= time ? i : index, -1) ?? -1;
  const previewSeek = (value: number) => { seekingRef.current = true; setTime(value); };
  const commitSeek = (value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value;
    setTime(value);
    seekingRef.current = false;
  };
  const beginDismissDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const player = playerRef.current;
    if (!player || closing) return;
    if (dismissResetTimerRef.current !== undefined) window.clearTimeout(dismissResetTimerRef.current);
    dismissStartYRef.current = event.clientY;
    dismissDistanceRef.current = 0;
    dismissStartedAtRef.current = performance.now();
    player.classList.remove("drag-reset");
    player.classList.add("dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDismissDrag = (event: React.PointerEvent<HTMLElement>) => {
    const player = playerRef.current;
    if (!player?.classList.contains("dragging")) return;
    const distance = Math.max(0, event.clientY - dismissStartYRef.current);
    dismissDistanceRef.current = distance;
    const resistedDistance = distance <= 180 ? distance : 180 + (distance - 180) * .35;
    player.style.setProperty("--dismiss-offset", `${resistedDistance}px`);
    player.style.setProperty("--dismiss-scale", String(1 - Math.min(.018, resistedDistance / 12000)));
    player.style.setProperty("--dismiss-opacity", String(1 - Math.min(.25, resistedDistance / 720)));
  };
  const endDismissDrag = (event: React.PointerEvent<HTMLElement>, cancelled = false) => {
    const player = playerRef.current;
    if (!player?.classList.contains("dragging")) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const elapsed = Math.max(1, performance.now() - dismissStartedAtRef.current);
    const velocity = dismissDistanceRef.current / elapsed;
    const shouldDismiss = !cancelled && (dismissDistanceRef.current >= 92 || velocity >= .65);
    if (shouldDismiss) {
      player.classList.remove("dragging");
      onClose();
      return;
    }
    player.classList.remove("dragging");
    player.classList.add("drag-reset");
    player.style.setProperty("--dismiss-offset", "0px");
    player.style.setProperty("--dismiss-scale", "1");
    player.style.setProperty("--dismiss-opacity", "1");
    dismissResetTimerRef.current = window.setTimeout(() => {
      player.classList.remove("drag-reset");
      player.style.removeProperty("--dismiss-offset");
      player.style.removeProperty("--dismiss-scale");
      player.style.removeProperty("--dismiss-opacity");
    }, 380);
  };
  if (!track) return null;
  const currentQueueIndex = store.queue.indexOf(track.id);
  const upcomingTracks = store.queue
    .slice(currentQueueIndex >= 0 ? currentQueueIndex + 1 : 0, currentQueueIndex >= 0 ? currentQueueIndex + 6 : 5)
    .map((id) => store.tracks.find((item) => item.id === id))
    .filter((item): item is Track => Boolean(item));
  return <section ref={playerRef} className={`now-playing ${closing ? "closing" : ""}`} aria-label="再生中"><NowPlayingBackdrop track={track} /><header onPointerDown={beginDismissDrag} onPointerMove={moveDismissDrag} onPointerUp={endDismissDrag} onPointerCancel={(event) => endDismissDrag(event, true)}><button onClick={onClose} aria-label="閉じる">⌄</button><span className="now-header-album" title={track.album}>{track.album || "不明なアルバム"}</span><span className="now-header-spacer" aria-hidden="true" /></header><div className="now-body">
    {!lyricsOpen && !queueOpen && (track.midi ? <MidiStudio track={track} audioRef={audioRef} /> : <JukeboxArtwork track={track} playing={store.playing} />)}
    {lyricsOpen && <LyricsPanel key={track.id} track={track} audioRef={audioRef} time={time} activeLine={activeLine} editing={editing} draft={draft} onDraftChange={setDraft} onCancelEdit={() => setEditing(false)} onSave={() => { void store.updateTrack(track.id, { lyrics: draft }); setEditing(false); }} onEdit={() => setEditing(true)} />}
    {queueOpen && <section className="queue-panel">
      <div className="queue-heading">
        <div><small>PLAYBACK</small><span>再生キュー</span><p>{store.queue.length}曲 · 次の曲 {Math.max(0, store.queue.length - currentQueueIndex - 1)}曲</p></div>
        <button disabled={store.queue.length <= 1} onClick={store.clearUpcoming}>次の曲を消去</button>
      </div>
      <div className="queue-list">{store.queue.map((id, index) => {
        const item = store.tracks.find((candidate) => candidate.id === id);
        if (!item) return null;
        const active = id === store.currentId;
        return <div className={`queue-row ${active ? "active" : ""}`} key={id}>
          <span className="queue-number">{active ? <i><b /><b /><b /></i> : String(index + 1).padStart(2, "0")}</span>
          <button className="queue-track" onClick={() => store.playTrack(id, store.queue)}><Artwork track={item} size="small" /><span><strong>{item.title}</strong><small>{item.artist}</small></span></button>
          {active ? <span className="queue-current">再生中</span> : <div className="queue-actions"><button disabled={index <= currentQueueIndex + 1} onClick={() => store.moveQueueItem(index, index - 1)} aria-label="上へ">↑</button><button disabled={index === store.queue.length - 1} onClick={() => store.moveQueueItem(index, index + 1)} aria-label="下へ">↓</button><button onClick={() => store.removeFromQueue(id)} aria-label="削除">×</button></div>}
        </div>;
      })}</div>
    </section>}
    <div className="now-info"><div><h1>{track.title}</h1><p>{track.artist} · {track.album}</p></div><button onClick={() => store.updateTrack(track.id, { favorite: !track.favorite })}>{track.favorite ? "♥" : "♡"}</button></div>
    <div className="seek"><input aria-label="再生位置" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(time, duration || 1)} style={{ "--seek-progress": `${duration ? Math.min(100, time / duration * 100) : 0}%` } as React.CSSProperties} onPointerDown={() => { seekingRef.current = true; }} onInput={(event) => previewSeek(Number(event.currentTarget.value))} onChange={(event) => previewSeek(Number(event.currentTarget.value))} onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))} onPointerCancel={(event) => commitSeek(Number(event.currentTarget.value))} onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))} onBlur={(event) => { if (seekingRef.current) commitSeek(Number(event.currentTarget.value)); }} /><div><span>{formatTime(time)}</span><span>-{formatTime(Math.max(0, duration - time))}</span></div></div>
    <div className="play-controls"><button className={store.shuffle ? "on" : ""} onClick={store.toggleShuffle} aria-label="シャッフル"><PlayerControlIcon name="shuffle" /></button><button onClick={store.previous} aria-label="前の曲"><PlayerControlIcon name="previous" /></button><button className="play-main" onClick={() => store.playing ? store.setPlaying(false) : store.playTrack(track.id, store.queue)} aria-label={store.playing ? "一時停止" : "再生"}><PlayerControlIcon name={store.playing ? "pause" : "play"} /></button><button onClick={store.next} aria-label="次の曲"><PlayerControlIcon name="next" /></button><button className={store.repeat !== "off" ? "on repeat-control" : "repeat-control"} onClick={store.cycleRepeat} aria-label="リピート"><PlayerControlIcon name="repeat" />{store.repeat === "one" && <span>1</span>}</button></div>
    <div className="volume-row"><PlayerControlIcon name="volume-low" /><input aria-label="音量" type="range" min="0" max="1" step="0.01" value={store.volume} style={{ "--volume-progress": `${store.volume * 100}%` } as React.CSSProperties} onChange={(event) => store.setVolume(Number(event.target.value))} /><PlayerControlIcon name="volume-high" /></div><div className="now-tabs"><button className={lyricsOpen ? "active" : ""} onClick={() => { setLyricsOpen(!lyricsOpen); setQueueOpen(false); }}>歌詞</button><button className={queueOpen ? "active" : ""} onClick={() => { setQueueOpen(!queueOpen); setLyricsOpen(false); }}>キュー</button><span>次の曲 · {Math.max(0, store.queue.length - store.queue.indexOf(track.id) - 1)}</span></div>
    <aside className="now-landscape-rail">
      <header><div><span>UP NEXT</span><strong>次に再生</strong></div><button onClick={() => { setQueueOpen(true); setLyricsOpen(false); }}>すべて見る</button></header>
      <div className="landscape-queue">{upcomingTracks.length ? upcomingTracks.map((item, index) => <button key={item.id} onClick={() => store.playTrack(item.id, store.queue)}><span>{String(index + 1).padStart(2, "0")}</span><Artwork track={item} size="small" /><div><strong>{item.title}</strong><small>{item.artist}</small></div></button>) : <p>次に再生する曲はありません</p>}</div>
      <div className="landscape-details"><div><span>アルバム</span><strong>{track.album || "不明なアルバム"}</strong></div><div><span>サウンド</span><strong>{store.eqEnabled ? "5バンドEQ" : "オリジナル"}</strong></div><div><span>再生モード</span><strong>{store.shuffle ? "シャッフル" : store.repeat === "one" ? "1曲リピート" : store.repeat === "all" ? "全曲リピート" : "通常再生"}</strong></div></div>
    </aside>
  </div></section>;
}

export default function PlayerApp() {
  const store = usePlayerStore(); const [tab, setTab] = useState<Tab>("library"); const [view, setView] = useState<LibraryView>("home"); const [motion, setMotion] = useState<"forward" | "back" | "tab">("tab"); const [query, setQuery] = useState(""); const [nowOpen, setNowOpen] = useState(false); const [nowClosing, setNowClosing] = useState(false); const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null); const [menuTrack, setMenuTrack] = useState<Track>(); const [notice, setNotice] = useState(""); const [adding, setAdding] = useState(false); const fileRef = useRef<HTMLInputElement>(null); const audioRef = useRef<HTMLAudioElement>(null);
  const loadLibrary = store.load;
  useEffect(() => {
    if (fileRef.current) fileRef.current.accept = AUDIO_FILE_ACCEPT;
  }, []);
  useEffect(() => {
    void loadLibrary();
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    }
  }, [loadLibrary]);
  useEffect(() => { document.documentElement.dataset.theme = store.theme; }, [store.theme]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 2600); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const showNotice = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("dmplayer:notice", showNotice);
    return () => window.removeEventListener("dmplayer:notice", showNotice);
  }, []);
  useEffect(() => {
    if (!navigator.storage?.persisted) return;
    void navigator.storage.persisted().then(setStoragePersistent);
  }, []);
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setAdding(true);
    try {
      const count = await store.addFiles(Array.from(files));
      setNotice(count ? `${count}曲を追加しました` : "新しく追加できる曲がありませんでした");
    } catch (error) {
      console.error("音楽ファイルの保存に失敗しました", error);
      setNotice(
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "端末の保存容量が不足しています。"
          : error instanceof Error && /MIDI/i.test(error.message)
            ? error.message
          : "音楽ファイルを保存できませんでした。ページを再読み込みしてください。",
      );
    } finally {
      setAdding(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const navigateView = (next: LibraryView, direction: "forward" | "back" = "forward") => {
    if (next === view) return;
    setMotion(direction);
    setView(next);
  };
  const navigateTab = (next: Tab) => {
    if (next === tab && view === "home") return;
    setMotion("tab");
    setTab(next);
    setView("home");
  };
  const openNowPlaying = () => {
    setNowClosing(false);
    setNowOpen(true);
  };
  const closeNowPlaying = () => {
    if (nowClosing) return;
    setNowClosing(true);
    window.setTimeout(() => {
      setNowOpen(false);
      setNowClosing(false);
    }, 360);
  };
  const requestPersistentStorage = async () => {
    if (!navigator.storage?.persist) {
      setNotice("この環境では永続ストレージを要求できません。");
      return;
    }
    const granted = await navigator.storage.persist();
    setStoragePersistent(granted);
    setNotice(granted ? "ストレージが保護されました。" : "ストレージ保護は許可されませんでした。");
  };
  const openPicker = () => fileRef.current?.click(); const filtered = store.tracks.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query.toLowerCase())); const recent = [...store.tracks].sort((a, b) => b.createdAt - a.createdAt); const history = store.tracks.filter((track) => track.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)); const favorites = store.tracks.filter((track) => track.favorite); const mostPlayed = [...store.tracks].filter((track) => track.playCount > 0).sort((a, b) => b.playCount - a.playCount); const albums = [...new Set(store.tracks.map((track) => track.album || "不明なアルバム"))]; const artists = [...new Set(store.tracks.map((track) => track.artist || "不明なアーティスト"))]; const source = view === "favorites" ? favorites : view === "recent" ? recent : view === "history" ? history : store.tracks; const current = store.tracks.find((track) => track.id === store.currentId);

  const libraryContent = () => {
    if (!store.tracks.length) return <EmptyLibrary onAdd={openPicker} />;
    if (view !== "home") return <><header className="content-header"><button className="back" onClick={() => navigateView("home", "back")}>‹ ライブラリ</button><button className="circle-add" onClick={openPicker}>＋</button></header><h1>{({ songs: "曲", albums: "アルバム", artists: "アーティスト", recent: "最近追加した項目", history: "最近再生した曲", favorites: "お気に入り", home: "ライブラリ" } as const)[view]}</h1>{view === "albums" ? <div className="album-grid">{albums.map((album) => { const track = store.tracks.find((item) => item.album === album); return <button key={album} onClick={() => track && store.playTrack(track.id, store.tracks.filter((item) => item.album === album).map((item) => item.id))}><Artwork track={track} /><strong>{album}</strong><small>{track?.artist}</small></button>; })}</div> : view === "artists" ? <div className="artist-list">{artists.map((artist) => <button key={artist} onClick={() => { const tracks = store.tracks.filter((item) => item.artist === artist); if (tracks[0]) store.playTrack(tracks[0].id, tracks.map((item) => item.id)); }}><span>{artist.slice(0, 1)}</span><strong>{artist}</strong><small>{store.tracks.filter((track) => track.artist === artist).length}曲</small><b>›</b></button>)}</div> : <div className="track-list">{source.map((track) => <TrackRow key={track.id} track={track} source={source.map((item) => item.id)} onMenu={setMenuTrack} />)}{view === "history" && !source.length && <div className="simple-empty"><h2>再生履歴はありません</h2><p>曲を再生すると、ここからすぐに戻れます。</p></div>}</div>}</>;
    const featured = current || recent[0];
    const replay = mostPlayed.length ? mostPlayed : history;
    return <>
      <header className="content-header library-topbar"><span className="brand">DM</span><button className="circle-add" onClick={openPicker} aria-label="音楽を追加">＋</button></header>
      <div className="library-heading"><div><span>YOUR MUSIC</span><h1>ライブラリ</h1></div><p>{store.tracks.length}曲 · {(store.tracks.reduce((sum, track) => sum + track.fileSize, 0) / 1024 / 1024).toFixed(0)} MB</p></div>
      <button className="library-feature" onClick={() => store.playTrack(featured.id)}>
        <span className="feature-backdrop"><Artwork track={featured} size="medium" /></span>
        <span className="feature-art"><Artwork track={featured} size="medium" /><i className="feature-play"><PlayerControlIcon name="play" /></i></span>
        <span className="feature-copy"><small>{current ? "続きを再生" : "新しく追加"}</small><strong>{featured.title}</strong><span>{featured.artist || "不明なアーティスト"}<i>·</i>{featured.album || "不明なアルバム"}</span></span>
        <span className="feature-open">再生</span>
      </button>
      <div className="library-shortcuts">{([["songs", "曲", store.tracks.length], ["albums", "アルバム", albums.length], ["artists", "アーティスト", artists.length], ["recent", "新着", recent.length], ["history", "履歴", history.length], ["favorites", "お気に入り", favorites.length]] as const).map(([id, label, count]) => <button key={id} onClick={() => navigateView(id)}><span><NavIcon name={id} /></span><strong>{label}</strong><small>{count}</small></button>)}</div>
      <div className="section-title home-section-title"><div><small>JUST ADDED</small><h2>最近追加した項目</h2></div><button onClick={() => navigateView("recent")}>すべて表示</button></div>
      <div className="horizontal-albums home-shelf">{recent.slice(0, 8).map((track) => <button key={track.id} onClick={() => store.playTrack(track.id)}><Artwork track={track} /><strong>{track.title}</strong><small>{track.artist}</small></button>)}</div>
      {replay.length > 0 && <><div className="section-title home-section-title"><div><small>MADE FOR YOU</small><h2>よく聴く曲</h2></div><button onClick={() => navigateView("history")}>再生履歴</button></div><div className="horizontal-albums home-shelf compact-shelf">{replay.slice(0, 8).map((track) => <button key={track.id} onClick={() => store.playTrack(track.id)}><Artwork track={track} /><strong>{track.title}</strong><small>{track.artist}</small></button>)}</div></>}
    </>;
  };

  const playlistsContent = <>
    <header className="content-header"><span className="brand">DM</span><button className="circle-add" onClick={() => { const name = prompt("プレイリスト名"); if (name?.trim()) void store.createPlaylist(name.trim()); }}>＋</button></header>
    <h1>プレイリスト</h1>
    <div className="playlist-list">
      <div className="smart-playlist-row">
        <button className="playlist-main" disabled={!favorites.length} onClick={() => { if (favorites[0]) store.playTrack(favorites[0].id, favorites.map((track) => track.id)); }}>
          <span>♥</span><div><strong>お気に入りの曲</strong><small>自動更新 · {favorites.length}曲</small></div>
        </button>
        <em>SMART</em>
      </div>
      {store.playlists.map((playlist) => <div key={playlist.id}><button className="playlist-main" onClick={() => { const first = playlist.trackIds[0]; if (first) store.playTrack(first, playlist.trackIds); }}><span>♫</span><div><strong>{playlist.name}</strong><small>{playlist.trackIds.length}曲</small></div></button><button onClick={() => { if (confirm(`「${playlist.name}」を削除しますか？`)) void store.deletePlaylist(playlist.id); }}>•••</button></div>)}
    </div>
  </>;
  const searchContent = <><header className="content-header"><span className="brand">DM</span><button className="circle-add" onClick={openPicker}>＋</button></header><h1>検索</h1><div className="search-box"><span>⌕</span><input autoFocus placeholder="曲、アーティスト、アルバム" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery("")}>×</button>}</div>{query ? <div className="track-list">{filtered.map((track) => <TrackRow key={track.id} track={track} onMenu={setMenuTrack} />)}{!filtered.length && <div className="simple-empty"><h2>見つかりませんでした</h2><p>別のキーワードで検索してください。</p></div>}</div> : <div className="search-hint"><p>ライブラリ内を検索</p><span>{store.tracks.length}曲がこの端末に保存されています</span></div>}</>;
  const settingsContent = <><header className="content-header"><span className="brand">DM</span></header><h1>設定</h1><h3 className="group-label">サウンド</h3><Equalizer /><h3 className="group-label">テーマ</h3><div className="setting-card segmented">{(["system", "light", "dark"] as const).map((theme) => <button className={store.theme === theme ? "active" : ""} key={theme} onClick={() => store.setTheme(theme)}>{theme === "system" ? "システム" : theme === "light" ? "ライト" : "ダーク"}</button>)}</div><h3 className="group-label">ストレージ</h3><div className="setting-card rows"><div><span>保存した曲</span><strong>{store.tracks.length}曲</strong></div><div><span>使用容量</span><strong>{(store.tracks.reduce((sum, track) => sum + track.fileSize, 0) / 1024 / 1024).toFixed(1)} MB</strong></div><button onClick={() => void requestPersistentStorage()}><span>ストレージを保護</span><strong>{storagePersistent === true ? "保護済み" : storagePersistent === false ? "未保護" : "確認中"}</strong></button><button className="danger" onClick={() => { if (confirm("保存したすべての曲とプレイリストを削除しますか？この操作は取り消せません。")) void store.clear(); }}>ライブラリをすべて削除</button></div><h3 className="group-label">アプリ</h3><div className="setting-card rows"><div><span>DMPlayer2</span><strong>Version 0.3.0</strong></div><div className="setting-note">音源はこの端末内のみに保存され、外部へ送信されません。ホーム画面に追加するとオフラインでも利用できます。</div></div></>;

  return <main className="app-shell"><input ref={fileRef} hidden type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.flac" multiple onChange={(event) => void addFiles(event.target.files)} /><PlayerEngine audioRef={audioRef} /><aside className="sidebar"><div className="sidebar-brand"><span>DM</span><strong>DMPlayer2</strong></div>{([["library", "ライブラリ"], ["playlists", "プレイリスト"], ["search", "検索"], ["settings", "設定"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTab(id)}><NavIcon name={id} />{label}</button>)}<button className="sidebar-add" onClick={openPicker}>＋ 音楽を追加</button></aside><section className="content"><div key={`${tab}-${view}`} className={`content-inner view-transition view-${motion}`}>{tab === "library" ? libraryContent() : tab === "playlists" ? playlistsContent : tab === "search" ? searchContent : settingsContent}</div></section><TabletPlayer audioRef={audioRef} onOpen={openNowPlaying} /><MiniPlayer onOpen={openNowPlaying} audioRef={audioRef} /><nav className="tab-bar">{([["library", "ライブラリ"], ["playlists", "プレイリスト"], ["search", "検索"], ["settings", "設定"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTab(id)}><NavIcon name={id} /><small>{label}</small></button>)}</nav>{nowOpen && <NowPlaying closing={nowClosing} onClose={closeNowPlaying} audioRef={audioRef} />}
    {menuTrack && <div className="sheet-backdrop" onClick={() => setMenuTrack(undefined)}><section className="action-sheet" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-track"><Artwork track={menuTrack} size="small" /><div><strong>{menuTrack.title}</strong><small>{menuTrack.artist}</small></div></div><button onClick={() => { store.playTrack(menuTrack.id); setMenuTrack(undefined); }}>▶ <span>今すぐ再生</span></button><button onClick={() => { store.addNext(menuTrack.id); setNotice("次に再生します"); setMenuTrack(undefined); }}>▶| <span>次に再生</span></button><button onClick={() => { store.addToQueue(menuTrack.id); setNotice("キューに追加しました"); setMenuTrack(undefined); }}>＋ <span>キューに追加</span></button><button onClick={() => { void store.updateTrack(menuTrack.id, { favorite: !menuTrack.favorite }); setMenuTrack(undefined); }}>{menuTrack.favorite ? "♥" : "♡"} <span>{menuTrack.favorite ? "お気に入りから削除" : "お気に入りに追加"}</span></button><button onClick={() => { const title = prompt("曲名", menuTrack.title); if (title === null) return; const artist = prompt("アーティスト", menuTrack.artist ?? ""); if (artist === null) return; const album = prompt("アルバム", menuTrack.album ?? ""); if (album === null) return; void store.updateTrack(menuTrack.id, { title: title.trim() || menuTrack.title, artist: artist.trim() || "不明なアーティスト", album: album.trim() || "不明なアルバム" }); setMenuTrack(undefined); }}>✎ <span>曲情報を編集</span></button><button onClick={() => { const id = menuTrack.id; setMenuTrack(undefined); void store.refreshMetadata(id).then((success) => setNotice(success ? "埋め込み情報を更新しました" : "埋め込み情報を読み取れませんでした")); }}>↻ <span>メタデータとカバーを再解析</span></button>{store.playlists.map((playlist) => <button key={playlist.id} onClick={() => { void store.togglePlaylistTrack(playlist.id, menuTrack.id); setNotice(`「${playlist.name}」を更新しました`); setMenuTrack(undefined); }}>▤ <span>{playlist.name}に追加 / 削除</span></button>)}<button className="danger" onClick={() => { if (confirm(`「${menuTrack.title}」をライブラリから削除しますか？`)) void store.deleteTrack(menuTrack.id); setMenuTrack(undefined); }}>× <span>ライブラリから削除</span></button><button className="cancel" onClick={() => setMenuTrack(undefined)}>キャンセル</button></section></div>}
    {(notice || adding) && <div className="toast">{adding ? "音楽を追加しています…" : notice}</div>}{!store.ready && <div className="loading"><span>DM</span><p>ライブラリを準備しています</p></div>}{current && <button className="desktop-now" onClick={openNowPlaying}>再生画面を開く</button>}</main>;
}
