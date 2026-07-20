"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerEngine } from "./components/PlayerEngine";
import { Artwork, BrandMark, JukeboxArtwork, NavIcon, PlayerControlIcon, UiIcon, type UiIconName } from "./components/Visuals";
import { Equalizer } from "./components/Equalizer";
import { TabletPlayer } from "./components/TabletPlayer";
import { MidiStudio } from "./components/MidiStudio";
import { AnimatedAlbumBackground } from "./components/AnimatedAlbumBackground";
import { FavoriteButton } from "./components/FavoriteButton";
import { LyricsPanel } from "./components/LyricsPanel";
import { SidebarLibrary } from "./components/SidebarLibrary";
import { AUDIO_FILE_ACCEPT } from "./lib/audio-formats";
import { searchTracks, type TrackSearchFilter } from "./lib/library";
import { formatTime } from "./lib/lyrics";
import { usePlayerStore } from "./store";
import type { Track } from "./types";

type Tab = "library" | "playlists" | "search" | "settings";
type LibraryView = "home" | "songs" | "albums" | "album-detail" | "artists" | "artist-detail" | "recent" | "history" | "favorites";
type TrackSort = "default" | "title" | "artist" | "album";
type SleepTimer = { mode: "off" } | { mode: "track" } | { mode: "timer"; endsAt: number };
type AmbientQuality = "auto" | "high" | "low";
type AppUpdateState = "idle" | "checking" | "current" | "ready" | "unsupported";

function trackBitrate(track: Track) {
  if (track.bitrate) return track.bitrate;
  if (!track.duration) return undefined;
  const playableSize = track.midi ? track.fileSize : (track.sourceFileSize ?? track.fileSize);
  return (playableSize * 8) / track.duration;
}

function formatBytes(value: number) {
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`;
}

function sortTracks(tracks: Track[], sort: TrackSort) {
  if (sort === "default") return tracks;
  return [...tracks].sort((a, b) => {
    const left = sort === "title" ? a.title : sort === "artist" ? a.artist || "" : a.album || "";
    const right = sort === "title" ? b.title : sort === "artist" ? b.artist || "" : b.album || "";
    return left.localeCompare(right, "ja", { numeric: true, sensitivity: "base" });
  });
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function EmptyLibrary({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-library-glyph"><UiIcon name="artwork" /></div><h2>音楽を、この端末に。</h2><p>音源は端末内に保存されます。</p><button className="primary-button" onClick={onAdd}>音楽を追加</button><span>MP3・M4A・FLAC・WAV・MIDIほか</span></div>;
}

function EmptyPanel({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: UiIconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return <div className="simple-empty section-empty">
    <span><UiIcon name={icon} /></span>
    <h2>{title}</h2>
    <p>{description}</p>
    {actionLabel && onAction && <button className="primary-button compact" onClick={onAction}>{actionLabel}</button>}
  </div>;
}

function TrackRow({ track, onMenu, source }: { track: Track; onMenu: (track: Track) => void; source?: string[] }) {
  const { currentId, playing, playbackStatus, playTrack } = usePlayerStore();
  const active = currentId === track.id;
  const loading = active && playbackStatus === "loading";
  const holdTimerRef = useRef<number | undefined>(undefined);
  const longPressedRef = useRef(false);
  useEffect(() => () => {
    if (holdTimerRef.current !== undefined) window.clearTimeout(holdTimerRef.current);
  }, []);
  const cancelHold = () => {
    if (holdTimerRef.current !== undefined) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = undefined;
  };
  const beginHold = () => {
    cancelHold();
    longPressedRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onMenu(track);
      if (localStorage.getItem("dmplayer-haptics") !== "false") navigator.vibrate?.(12);
    }, 520);
  };
  return <div className={`track-row ${active ? "active" : ""}`}><button className="track-main" onPointerDown={beginHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} onContextMenu={(event) => { event.preventDefault(); cancelHold(); onMenu(track); }} onClick={() => { if (longPressedRef.current) { longPressedRef.current = false; return; } playTrack(track.id, source); }} aria-current={active ? "true" : undefined} aria-label={`${track.title}を再生。長押しでメニュー`}><Artwork track={track} size="small" /><span className="track-copy"><strong>{track.title}</strong><small>{loading ? "音源を読み込み中…" : `${track.artist || "不明なアーティスト"}${track.album ? ` · ${track.album}` : ""}`}</small></span>{active && <span aria-hidden="true" className={`playing-bars ${playing ? "moving" : ""} ${loading ? "loading" : ""}`}><i /><i /><i /></span>}</button><button className="more-button" onClick={() => onMenu(track)} aria-label={`${track.title}のメニュー`}><UiIcon name="more" /></button></div>;
}

function CollectionDetail({
  title,
  subtitle,
  tracks,
  onBack,
  onMenu,
  kind = "collection",
}: {
  title: string;
  subtitle: string;
  tracks: Track[];
  onBack: () => void;
  onMenu: (track: Track) => void;
  kind?: "collection" | "album" | "artist" | "playlist";
}) {
  const store = usePlayerStore();
  const ids = tracks.map((track) => track.id);
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  return <section className={`collection-detail collection-${kind}`}>
    <header className="content-header"><button className="back icon-back" onClick={onBack}><UiIcon name="back" />戻る</button></header>
    <div className="collection-hero">
      <Artwork track={tracks[0]} size="medium" />
      <div><small>{subtitle}</small><h1>{title}</h1><p>{tracks.length}曲 · {formatTime(totalDuration)}</p></div>
    </div>
    <div className="collection-actions">
      <button disabled={!tracks.length} onClick={() => tracks[0] && store.playTrack(tracks[0].id, ids)}><UiIcon name="play" />再生</button>
      <button disabled={!tracks.length} onClick={() => { if (!tracks.length) return; if (!store.shuffle) store.toggleShuffle(); store.playTrack(tracks[Math.floor(Math.random() * tracks.length)].id, ids); }}><UiIcon name="shuffle" />シャッフル</button>
    </div>
    {tracks.length ? <div className="track-list collection-tracks">{tracks.map((track) => <TrackRow key={track.id} track={track} source={ids} onMenu={onMenu} />)}</div> : <EmptyPanel icon="playlist" title="まだ曲がありません" description="曲のメニューからこのプレイリストへ追加できます。" />}
  </section>;
}

function ArtistDetail({
  artist,
  tracks,
  onBack,
  onMenu,
  onOpenAlbum,
}: {
  artist: string;
  tracks: Track[];
  onBack: () => void;
  onMenu: (track: Track) => void;
  onOpenAlbum: (album: string) => void;
}) {
  const store = usePlayerStore();
  const ids = tracks.map((track) => track.id);
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  const favoriteCount = tracks.filter((track) => track.favorite).length;
  const totalPlays = tracks.reduce((sum, track) => sum + (track.playCount ?? 0), 0);
  const popularTracks = [...tracks]
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || b.createdAt - a.createdAt)
    .slice(0, 5);
  const albumGroups = Array.from(tracks.reduce((groups, track) => {
    const name = track.album || "不明なアルバム";
    const current = groups.get(name) ?? [];
    current.push(track);
    groups.set(name, current);
    return groups;
  }, new Map<string, Track[]>())).map(([name, albumTracks]) => ({
    name,
    tracks: albumTracks,
    artworkTrack: albumTracks.find((track) => track.artwork) ?? albumTracks[0],
    duration: albumTracks.reduce((sum, track) => sum + (track.duration ?? 0), 0),
    newest: Math.max(...albumTracks.map((track) => track.createdAt)),
  })).sort((a, b) => b.newest - a.newest);
  const heroTrack = tracks.find((track) => track.artwork) ?? popularTracks[0] ?? tracks[0];
  const playAll = () => {
    if (tracks[0]) store.playTrack(tracks[0].id, ids);
  };
  const shuffleAll = () => {
    if (!tracks.length) return;
    if (!store.shuffle) store.toggleShuffle();
    store.playTrack(tracks[Math.floor(Math.random() * tracks.length)].id, ids);
  };

  return <section className="artist-detail">
    <header className="artist-detail-nav">
      <button className="artist-back" onClick={onBack}><UiIcon name="back" /><span>アーティスト</span></button>
      <span className="artist-nav-title">{artist}</span>
      <span aria-hidden="true" />
    </header>

    <div className="artist-hero">
      <div className="artist-hero-backdrop" aria-hidden="true"><Artwork track={heroTrack} size="medium" /></div>
      <div className="artist-visual">
        <span className="artist-vinyl" aria-hidden="true" />
        <div className="artist-portrait"><Artwork track={heroTrack} size="medium" /></div>
        {albumGroups.slice(1, 3).map((album, index) => <div className={`artist-floating-cover artist-floating-cover-${index + 1}`} key={album.name} aria-hidden="true"><Artwork track={album.artworkTrack} size="small" /></div>)}
      </div>
      <div className="artist-hero-copy">
        <small>ARTIST</small>
        <h1>{artist}</h1>
        <p>{albumGroups.length}アルバム <i /> {tracks.length}曲 <i /> {formatTime(totalDuration)}</p>
        <div className="artist-hero-actions">
          <button className="artist-primary-action" disabled={!tracks.length} onClick={playAll}><UiIcon name="play" /><span>再生</span></button>
          <button className="artist-secondary-action" disabled={!tracks.length} onClick={shuffleAll}><UiIcon name="shuffle" /><span>シャッフル</span></button>
        </div>
      </div>
    </div>

    <div className="artist-content-grid">
      <section className="artist-popular">
        <header className="artist-section-heading"><div><small>TOP TRACKS</small><h2>人気の曲</h2></div><span>{Math.min(5, tracks.length)}曲</span></header>
        <div className="artist-ranked-list">
          {popularTracks.map((track, index) => <div className="artist-ranked-row" key={track.id}><span className="artist-rank">{String(index + 1).padStart(2, "0")}</span><TrackRow track={track} source={ids} onMenu={onMenu} /></div>)}
        </div>
      </section>

      <aside className="artist-profile-card">
        <div className="artist-profile-heading"><span>{artist.slice(0, 1).toUpperCase()}</span><div><small>IN YOUR LIBRARY</small><strong>{artist}</strong></div></div>
        <div className="artist-stats">
          <div><strong>{tracks.length}</strong><span>曲</span></div>
          <div><strong>{albumGroups.length}</strong><span>アルバム</span></div>
          <div><strong>{favoriteCount}</strong><span>お気に入り</span></div>
        </div>
        {totalPlays > 0 && <p>再生 {totalPlays}回</p>}
      </aside>
    </div>

    <section className="artist-albums">
      <header className="artist-section-heading"><div><small>DISCOGRAPHY</small><h2>アルバム</h2></div><span>{albumGroups.length}作品</span></header>
      <div className="artist-album-grid">
        {albumGroups.map((album) => <button key={album.name} onClick={() => onOpenAlbum(album.name)}>
          <span className="artist-album-art"><Artwork track={album.artworkTrack} size="medium" /><i><UiIcon name="play" /></i></span>
          <strong>{album.name}</strong>
          <small>{album.tracks.length}曲 · {formatTime(album.duration)}</small>
        </button>)}
      </div>
    </section>

    {tracks.length > popularTracks.length && <section className="artist-all-tracks">
      <header className="artist-section-heading"><div><small>COMPLETE CATALOG</small><h2>すべての曲</h2></div><span>{tracks.length}曲</span></header>
      <div className="track-list">{tracks.map((track) => <TrackRow key={track.id} track={track} source={ids} onMenu={onMenu} />)}</div>
    </section>}
  </section>;
}

function TrackDetails({ track, onClose }: { track: Track; onClose: () => void }) {
  const bitrate = trackBitrate(track);
  const rows = [
    ["ビットレート", bitrate ? `${Math.round(bitrate / 1000)} kbps${track.bitrate ? "" : "（推定）"}` : "不明"],
    ["サンプルレート", track.sampleRate ? `${(track.sampleRate / 1000).toFixed(track.sampleRate % 1000 ? 1 : 0)} kHz` : "不明"],
    ["コーデック", track.codec || track.fileType.split("/")[1]?.toUpperCase() || "不明"],
    ["コンテナ", track.container || track.fileName.split(".").pop()?.toUpperCase() || "不明"],
    ["チャンネル", track.channels ? `${track.channels} ch` : "不明"],
    ["量子化ビット", track.bitsPerSample ? `${track.bitsPerSample} bit` : "不明"],
    ["ファイル容量", formatBytes(track.sourceFileSize ?? track.fileSize)],
    ["再生時間", formatTime(track.duration)],
  ];
  return <div className="sheet-backdrop detail-backdrop" onClick={onClose}><section className="track-details" role="dialog" aria-modal="true" aria-labelledby="track-details-title" onClick={(event) => event.stopPropagation()}>
    <header><button onClick={onClose} aria-label="閉じる"><UiIcon name="close" /></button><span id="track-details-title">曲の詳細</span><i /></header>
    <div className="detail-identity"><Artwork track={track} size="medium" /><h2>{track.title}</h2><p>{track.artist || "不明なアーティスト"} · {track.album || "不明なアルバム"}</p></div>
    <div className="detail-quality"><UiIcon name="info" /><div><small>AUDIO QUALITY</small><strong>{bitrate ? `${Math.round(bitrate / 1000)} kbps` : track.codec || "Audio"}</strong></div>{track.lossless && <span>LOSSLESS</span>}</div>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="detail-file"><small>ファイル名</small><span>{track.fileName}</span></div>
  </section></div>;
}

function SettingsHeading({ icon, title, caption }: { icon: "sound" | "palette" | "storage" | "app" | "timer" | "controls" | "refresh"; title: string; caption: string }) {
  return <div className="settings-heading"><span><UiIcon name={icon} /></span><div><h2>{title}</h2><p>{caption}</p></div></div>;
}

function PlaybackTools({
  playbackRate,
  onPlaybackRateChange,
  sleepTimer,
  sleepRemaining,
  onSleepMinutes,
  onSleepAfterTrack,
  onCancelSleep,
}: {
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  sleepTimer: SleepTimer;
  sleepRemaining: number;
  onSleepMinutes: (minutes: number) => void;
  onSleepAfterTrack: () => void;
  onCancelSleep: () => void;
}) {
  const rates = [0.75, 1, 1.25, 1.5, 2];
  return <section className="playback-tools">
    <div className="playback-tool-row">
      <div><strong>再生速度</strong><small>{playbackRate}×</small></div>
      <div className="playback-rate-options" role="group" aria-label="再生速度">
        {rates.map((rate) => <button key={rate} className={playbackRate === rate ? "active" : ""} aria-pressed={playbackRate === rate} onClick={() => onPlaybackRateChange(rate)}>{rate}×</button>)}
      </div>
    </div>
    <div className="playback-tool-row sleep-tool">
      <div><strong>スリープタイマー</strong><small>{sleepTimer.mode === "timer" ? `あと ${formatCountdown(sleepRemaining)}` : sleepTimer.mode === "track" ? "曲の終了時に停止" : "オフ"}</small></div>
      <div className="sleep-options" role="group" aria-label="スリープタイマー">
        {[15, 30, 60].map((minutes) => <button key={minutes} onClick={() => onSleepMinutes(minutes)}>{minutes}分</button>)}
        <button className={sleepTimer.mode === "track" ? "active" : ""} aria-pressed={sleepTimer.mode === "track"} onClick={onSleepAfterTrack}>曲の終了</button>
        {sleepTimer.mode !== "off" && <button className="sleep-cancel" onClick={onCancelSleep}>解除</button>}
      </div>
    </div>
  </section>;
}

function DevicePreferences({
  skipSeconds,
  keepScreenAwake,
  hapticsEnabled,
  onSkipSecondsChange,
  onKeepScreenAwakeChange,
  onHapticsChange,
}: {
  skipSeconds: 10 | 15 | 30;
  keepScreenAwake: boolean;
  hapticsEnabled: boolean;
  onSkipSecondsChange: (seconds: 10 | 15 | 30) => void;
  onKeepScreenAwakeChange: (enabled: boolean) => void;
  onHapticsChange: (enabled: boolean) => void;
}) {
  return <div className="preference-card">
    <div className="preference-row preference-choice">
      <div><strong>シーク送り</strong><small>コントロールセンターからの送り幅</small></div>
      <div className="preference-segmented" role="group" aria-label="シーク送り秒数">
        {([10, 15, 30] as const).map((seconds) => <button key={seconds} className={skipSeconds === seconds ? "active" : ""} aria-pressed={skipSeconds === seconds} onClick={() => onSkipSecondsChange(seconds)}>{seconds}秒</button>)}
      </div>
    </div>
    <button className="preference-row preference-toggle" role="switch" aria-checked={keepScreenAwake} onClick={() => onKeepScreenAwakeChange(!keepScreenAwake)}>
      <span><strong>画面をスリープさせない</strong><small>再生中だけ画面の自動ロックを防止</small></span>
      <i className={`switch ${keepScreenAwake ? "on" : ""}`} aria-hidden="true"><span /></i>
    </button>
    <button className="preference-row preference-toggle" role="switch" aria-checked={hapticsEnabled} onClick={() => onHapticsChange(!hapticsEnabled)}>
      <span><strong>触覚フィードバック</strong><small>長押しやお気に入り操作を振動で通知</small></span>
      <i className={`switch ${hapticsEnabled ? "on" : ""}`} aria-hidden="true"><span /></i>
    </button>
  </div>;
}

function AppearancePreferences({
  theme,
  ambientQuality,
  onThemeChange,
  onAmbientQualityChange,
}: {
  theme: "system" | "light" | "dark";
  ambientQuality: AmbientQuality;
  onThemeChange: (theme: "system" | "light" | "dark") => void;
  onAmbientQualityChange: (quality: AmbientQuality) => void;
}) {
  return <div className="preference-card appearance-preferences">
    <div className="preference-row preference-choice">
      <div><strong>テーマ</strong><small>アプリ全体の配色</small></div>
      <div className="preference-segmented" role="group" aria-label="表示テーマ">
        {(["system", "light", "dark"] as const).map((item) => <button className={theme === item ? "active" : ""} key={item} aria-pressed={theme === item} onClick={() => onThemeChange(item)}>{item === "system" ? "自動" : item === "light" ? "ライト" : "ダーク"}</button>)}
      </div>
    </div>
    <div className="preference-row preference-choice">
      <div><strong>背景エフェクト</strong><small>再生画面の動きと描画負荷</small></div>
      <div className="preference-segmented" role="group" aria-label="背景エフェクト品質">
        {(["auto", "high", "low"] as const).map((quality) => <button className={ambientQuality === quality ? "active" : ""} key={quality} aria-pressed={ambientQuality === quality} onClick={() => onAmbientQualityChange(quality)}>{quality === "auto" ? "自動" : quality === "high" ? "高" : "省電力"}</button>)}
      </div>
    </div>
  </div>;
}

function MiniPlayer({ onOpen, audioRef, variant }: { onOpen: () => void; audioRef: React.RefObject<HTMLAudioElement | null>; variant: "mobile" | "desktop" }) {
  const { tracks, currentId, queue, playing, playbackStatus, setPlaying, playTrack, next } = usePlayerStore();
  const track = tracks.find((item) => item.id === currentId);
  const loading = playbackStatus === "loading";
  const [progress, setProgress] = useState(0);
  useEffect(() => { const audio = audioRef.current; if (!audio) return; const update = () => setProgress(audio.duration ? audio.currentTime / audio.duration * 100 : 0); audio.addEventListener("timeupdate", update); return () => audio.removeEventListener("timeupdate", update); }, [audioRef, track]);
  if (!track) return null;
  return <div className={`mini-player mini-player-${variant} ${loading ? "is-loading" : ""}`}><div className="mini-progress" style={{ width: `${progress}%` }} /><button className="mini-main" onClick={onOpen}><Artwork track={track} size="small" /><span><strong>{track.title}</strong><small>{loading ? "音源を読み込み中…" : track.artist}</small></span></button><button className="round-control" onClick={() => playing ? setPlaying(false) : playTrack(track.id, queue)} aria-label={loading ? "読み込み中" : playing ? "一時停止" : "再生"}><span className="control-icon-state">{loading ? <i className="playback-spinner" /> : <PlayerControlIcon name={playing ? "pause" : "play"} />}</span></button><button className="round-control" onClick={next} aria-label="次の曲"><PlayerControlIcon name="next" /></button></div>;
}

function TrackAmbientBackground({ track, quality }: { track: Track; quality: AmbientQuality }) {
  const artworkBlob = useMemo(() => {
    if (track.artwork) return track.artwork;
    if (track.artworkData) {
      return new Blob([track.artworkData], { type: track.artworkType || "image/jpeg" });
    }
    return undefined;
  }, [track.artwork, track.artworkData, track.artworkType]);
  const artworkUrl = useMemo(
    () => track.artworkUrl || (artworkBlob ? URL.createObjectURL(artworkBlob) : undefined),
    [artworkBlob, track.artworkUrl],
  );
  useEffect(() => () => {
    if (artworkUrl && !track.artworkUrl) URL.revokeObjectURL(artworkUrl);
  }, [artworkUrl, track.artworkUrl]);
  const albumKey = [
    track.album || track.id,
    track.artist || "",
    artworkBlob?.size ?? track.artworkUrl ?? "no-artwork",
  ].join("::");

  return (
    <AnimatedAlbumBackground
      artwork={artworkUrl}
      albumKey={albumKey}
      transitionDurationMs={2800}
      quality={quality}
    />
  );
}

type NowPlayingMode = "player" | "lyrics" | "queue";

function NowPlaying({
  onClose,
  onOpenArtist,
  audioRef,
  ambientQuality,
  closing = false,
}: {
  onClose: () => void;
  onOpenArtist: (artist: string) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  ambientQuality?: AmbientQuality;
  closing?: boolean;
}) {
  const store = usePlayerStore(); const track = store.tracks.find((item) => item.id === store.currentId);
  const backgroundQuality = ambientQuality ?? (
    typeof window === "undefined"
      ? "auto"
      : (["auto", "high", "low"] as const).find((quality) => quality === localStorage.getItem("dmplayer-ambient-quality")) ?? "auto"
  );
  const [time, setTime] = useState(0); const [duration, setDuration] = useState(track?.duration ?? 0); const [playerMode, setPlayerMode] = useState<NowPlayingMode>("player"); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(track?.lyrics ?? "");
  const seekingRef = useRef(false);
  const playerRef = useRef<HTMLElement>(null);
  const nowScrollRef = useRef<HTMLDivElement>(null);
  const dismissStartYRef = useRef(0);
  const dismissDistanceRef = useRef(0);
  const dismissStartedAtRef = useRef(0);
  const dismissResetTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => { const timer = window.setTimeout(() => { setDraft(track?.lyrics ?? ""); setEditing(false); }, 0); return () => window.clearTimeout(timer); }, [track?.id, track?.lyrics]);
  useEffect(() => { const audio = audioRef.current; if (!audio) return; const update = () => { if (!seekingRef.current) setTime(audio.currentTime); setDuration(audio.duration || track?.duration || 0); }; update(); audio.addEventListener("timeupdate", update); audio.addEventListener("durationchange", update); return () => { audio.removeEventListener("timeupdate", update); audio.removeEventListener("durationchange", update); }; }, [audioRef, track]);
  useEffect(() => () => {
    if (dismissResetTimerRef.current !== undefined) window.clearTimeout(dismissResetTimerRef.current);
  }, []);
  useEffect(() => {
    const player = playerRef.current;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      player?.style.setProperty("--player-viewport-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
    };
    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => nowScrollRef.current?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(frame);
  }, [playerMode, track?.id]);
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
  const visibleQueue = store.queue
    .map((id, index) => ({ id, index }))
    .slice(currentQueueIndex >= 0 ? currentQueueIndex : 0);
  const upcomingCount = Math.max(0, store.queue.length - currentQueueIndex - 1);
  return <section ref={playerRef} className={`now-playing mode-${playerMode} ${closing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="now-playing-title"><TrackAmbientBackground track={track} quality={backgroundQuality} /><header onPointerDown={beginDismissDrag} onPointerMove={moveDismissDrag} onPointerUp={endDismissDrag} onPointerCancel={(event) => endDismissDrag(event, true)}><button className="now-close" onClick={onClose} aria-label="閉じる"><UiIcon name="back" /></button><span id="now-playing-title" className="now-header-album" title={track.album}>{track.album || "不明なアルバム"}</span><span className="now-header-spacer" aria-hidden="true" /></header><div ref={nowScrollRef} className={`now-scroll mode-${playerMode}`}><div className="now-body">
    <div className="now-stage" data-mode={playerMode}>
      <div id="now-stage-player" className={`now-stage-view now-stage-player ${playerMode === "player" ? "is-active" : ""}`} aria-hidden={playerMode !== "player"}>
        {track.midi ? <MidiStudio track={track} audioRef={audioRef} /> : <JukeboxArtwork track={track} playing={store.playing} />}
      </div>
      <div id="now-stage-lyrics" className={`now-stage-view now-stage-lyrics ${playerMode === "lyrics" ? "is-active" : ""}`} aria-hidden={playerMode !== "lyrics"}>
        <LyricsPanel key={track.id} track={track} audioRef={audioRef} time={time} activeLine={activeLine} editing={editing} draft={draft} onDraftChange={setDraft} onCancelEdit={() => setEditing(false)} onSave={() => { void store.updateTrack(track.id, { lyrics: draft }); setEditing(false); }} onEdit={() => setEditing(true)} />
      </div>
      <div id="now-stage-queue" className={`now-stage-view now-stage-queue ${playerMode === "queue" ? "is-active" : ""}`} aria-hidden={playerMode !== "queue"}>
        <section className="queue-panel" aria-label="再生キュー">
          <div className="queue-heading">
            <div><small>UP NEXT</small><span>次に再生</span><p>再生中 + 次の曲 {upcomingCount}曲</p></div>
            <button disabled={upcomingCount === 0} onClick={store.clearUpcoming}>消去</button>
          </div>
          <div className="queue-list" role="list">{visibleQueue.map(({ id, index }, visibleIndex) => {
            const item = store.tracks.find((candidate) => candidate.id === id);
            if (!item) return null;
            const active = id === store.currentId;
            return <div className={`queue-row ${active ? "active" : ""}`} key={id} role="listitem">
              <span className="queue-number">{active ? <i><b /><b /><b /></i> : String(Math.max(1, visibleIndex)).padStart(2, "0")}</span>
              <button className="queue-track" onClick={() => store.playTrack(id, store.queue)}><Artwork track={item} size="small" /><span><strong>{item.title}</strong><small>{item.artist}</small></span></button>
              {active ? <span className="queue-current">再生中</span> : <div className="queue-actions"><button disabled={index <= currentQueueIndex + 1} onClick={() => store.moveQueueItem(index, index - 1)} aria-label={`${item.title}を上へ移動`}><UiIcon name="up" /></button><button disabled={index === store.queue.length - 1} onClick={() => store.moveQueueItem(index, index + 1)} aria-label={`${item.title}を下へ移動`}><UiIcon name="down" /></button><button className="queue-remove" onClick={() => store.removeFromQueue(id)} aria-label={`${item.title}をキューから削除`}><UiIcon name="close" /></button></div>}
            </div>;
          })}</div>
        </section>
      </div>
    </div>
    <div className="now-info"><div><h1>{track.title}</h1><p><button className="artist-link" onClick={() => onOpenArtist(track.artist || "不明なアーティスト")}>{track.artist || "不明なアーティスト"}</button><span> · {track.album || "不明なアルバム"}</span></p></div><FavoriteButton favorite={track.favorite} onToggle={() => void store.updateTrack(track.id, { favorite: !track.favorite })} /></div>
    <div className="seek"><input aria-label="再生位置" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(time, duration || 1)} style={{ "--seek-progress": `${duration ? Math.min(100, time / duration * 100) : 0}%` } as React.CSSProperties} onPointerDown={() => { seekingRef.current = true; }} onInput={(event) => previewSeek(Number(event.currentTarget.value))} onChange={(event) => previewSeek(Number(event.currentTarget.value))} onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))} onPointerCancel={(event) => commitSeek(Number(event.currentTarget.value))} onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))} onBlur={(event) => { if (seekingRef.current) commitSeek(Number(event.currentTarget.value)); }} /><div><span>{formatTime(time)}</span><span>-{formatTime(Math.max(0, duration - time))}</span></div></div>
    <div className="play-controls"><button className={store.shuffle ? "on" : ""} onClick={store.toggleShuffle} aria-label={store.shuffle ? "シャッフルを解除" : "シャッフル"} aria-pressed={store.shuffle}><PlayerControlIcon name="shuffle" /></button><button onClick={store.previous} aria-label="前の曲"><PlayerControlIcon name="previous" /></button><button className={`play-main ${store.playbackStatus === "loading" ? "is-loading" : ""}`} onClick={() => store.playing ? store.setPlaying(false) : store.playTrack(track.id, store.queue)} aria-label={store.playbackStatus === "loading" ? "読み込み中" : store.playing ? "一時停止" : "再生"}>{store.playbackStatus === "loading" ? <i className="playback-spinner" /> : <PlayerControlIcon name={store.playing ? "pause" : "play"} />}</button><button onClick={store.next} aria-label="次の曲"><PlayerControlIcon name="next" /></button><button className={store.repeat !== "off" ? "on repeat-control" : "repeat-control"} onClick={store.cycleRepeat} aria-label={store.repeat === "off" ? "リピート：オフ" : store.repeat === "all" ? "リピート：すべて" : "リピート：1曲"} aria-pressed={store.repeat !== "off"}><PlayerControlIcon name="repeat" />{store.repeat === "one" && <span>1</span>}</button></div>
    <div className="volume-row"><PlayerControlIcon name="volume-low" /><input aria-label="音量" type="range" min="0" max="1" step="0.01" value={store.volume} style={{ "--volume-progress": `${store.volume * 100}%` } as React.CSSProperties} onChange={(event) => store.setVolume(Number(event.target.value))} /><PlayerControlIcon name="volume-high" /></div>
    <nav className="now-tabs now-mode-dock" aria-label="表示を切り替え">
      <button className={playerMode === "player" ? "active" : ""} aria-label="再生" aria-pressed={playerMode === "player"} aria-controls="now-stage-player" onClick={() => setPlayerMode("player")}><UiIcon name="artwork" /><span>再生</span></button>
      <button className={playerMode === "lyrics" ? "active" : ""} aria-label="歌詞" aria-pressed={playerMode === "lyrics"} aria-controls="now-stage-lyrics" onClick={() => setPlayerMode("lyrics")}><UiIcon name="lyrics" /><span>歌詞</span></button>
      <button className={playerMode === "queue" ? "active" : ""} aria-label="次に再生" aria-pressed={playerMode === "queue"} aria-controls="now-stage-queue" onClick={() => setPlayerMode("queue")}><UiIcon name="queue" /><span>次に再生</span>{upcomingCount > 0 && <small>{upcomingCount}</small>}</button>
    </nav>
    <aside className="now-landscape-rail">
      <header><div><span>UP NEXT</span><strong>次に再生</strong></div><button onClick={() => setPlayerMode("queue")}>すべて見る</button></header>
      <div className="landscape-queue">{upcomingTracks.length ? upcomingTracks.map((item, index) => <button key={item.id} onClick={() => store.playTrack(item.id, store.queue)}><span>{String(index + 1).padStart(2, "0")}</span><Artwork track={item} size="small" /><div><strong>{item.title}</strong><small>{item.artist}</small></div></button>) : <p>次に再生する曲はありません</p>}</div>
      <div className="landscape-details"><div><span>アルバム</span><strong>{track.album || "不明なアルバム"}</strong></div><div><span>サウンド</span><strong>{store.eqEnabled ? "5バンドEQ" : "オリジナル"}</strong></div><div><span>再生モード</span><strong>{store.shuffle ? "シャッフル" : store.repeat === "one" ? "1曲リピート" : store.repeat === "all" ? "全曲リピート" : "通常再生"}</strong></div></div>
    </aside>
  </div></div></section>;
}

export default function PlayerApp() {
  const store = usePlayerStore();
  const [tab, setTab] = useState<Tab>("library");
  const [view, setView] = useState<LibraryView>("home");
  const [motion, setMotion] = useState<"forward" | "back" | "tab">("tab");
  const [query, setQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<TrackSearchFilter>("all");
  const [nowOpen, setNowOpen] = useState(false);
  const [nowClosing, setNowClosing] = useState(false);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [menuTrack, setMenuTrack] = useState<Track>();
  const [detailTrack, setDetailTrack] = useState<Track>();
  const [selectedAlbum, setSelectedAlbum] = useState<string>();
  const [selectedArtist, setSelectedArtist] = useState<string>();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>("idle");
  const [updatePromptDismissed, setUpdatePromptDismissed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [smoothScrollRequest, setSmoothScrollRequest] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [trackSort, setTrackSort] = useState<TrackSort>("default");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [skipSeconds, setSkipSeconds] = useState<10 | 15 | 30>(10);
  const [ambientQuality, setAmbientQuality] = useState<AmbientQuality>("auto");
  const [keepScreenAwake, setKeepScreenAwake] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [sleepTimer, setSleepTimer] = useState<SleepTimer>({ mode: "off" });
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const dragDepthRef = useRef(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const updateRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const loadLibrary = store.load;
  const checkForAppUpdate = useCallback(async (userInitiated = false) => {
    const registration = updateRegistrationRef.current;
    if (!registration) {
      if (userInitiated) setNotice("アップデート機能を準備しています。少し待ってからお試しください。");
      return;
    }
    if (userInitiated) setAppUpdateState("checking");
    try {
      await registration.update();
      if (registration.waiting && navigator.serviceWorker.controller) {
        setAppUpdateState("ready");
        setUpdatePromptDismissed(false);
      } else if (!registration.installing && userInitiated) {
        setAppUpdateState("current");
      }
    } catch {
      if (userInitiated) {
        setAppUpdateState("idle");
        setNotice("アップデートを確認できませんでした。通信状態をご確認ください。");
      }
    }
  }, []);
  const applyAppUpdate = useCallback(() => {
    const waitingWorker = updateRegistrationRef.current?.waiting;
    if (!waitingWorker) {
      void checkForAppUpdate(true);
      return;
    }
    setNotice("アップデートを適用しています…");
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, [checkForAppUpdate]);
  useEffect(() => {
    if (fileRef.current) fileRef.current.accept = AUDIO_FILE_ACCEPT;
  }, []);
  useEffect(() => {
    if (localStorage.getItem("dmplayer-sidebar-collapsed") !== "true") return;
    const frame = requestAnimationFrame(() => setSidebarCollapsed(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const savedRate = Number(localStorage.getItem("dmplayer-playback-rate"));
    if (![0.75, 1, 1.25, 1.5, 2].includes(savedRate)) return;
    const frame = requestAnimationFrame(() => setPlaybackRate(savedRate));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const savedSkip = Number(localStorage.getItem("dmplayer-skip-seconds"));
    const savedQuality = localStorage.getItem("dmplayer-ambient-quality");
    const frame = requestAnimationFrame(() => {
      if (savedSkip === 10 || savedSkip === 15 || savedSkip === 30) setSkipSeconds(savedSkip);
      if (savedQuality === "auto" || savedQuality === "high" || savedQuality === "low") setAmbientQuality(savedQuality);
      setKeepScreenAwake(localStorage.getItem("dmplayer-keep-awake") === "true");
      setHapticsEnabled(localStorage.getItem("dmplayer-haptics") !== "false");
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const releaseWakeLock = () => {
      const activeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (activeLock) void activeLock.release().catch(() => undefined);
    };
    if (!keepScreenAwake || !store.playing) {
      releaseWakeLock();
      return;
    }
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (!wakeLock) return;
    let disposed = false;
    const acquireWakeLock = async () => {
      if (disposed || document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        const lock = await wakeLock.request("screen");
        if (disposed) {
          void lock.release();
          return;
        }
        wakeLockRef.current = lock;
      } catch {
        // The browser may decline the request when the PWA is backgrounded.
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
      else releaseWakeLock();
    };
    void acquireWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseWakeLock();
    };
  }, [keepScreenAwake, store.playing]);
  useEffect(() => {
    if (sleepTimer.mode !== "timer") return;
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((sleepTimer.endsAt - Date.now()) / 1000));
      setSleepRemaining(remaining);
      if (remaining > 0) return;
      window.clearInterval(interval);
      usePlayerStore.getState().setPlaying(false);
      setSleepTimer({ mode: "off" });
      setNotice("スリープタイマーで停止しました");
    }, 1000);
    return () => window.clearInterval(interval);
  }, [sleepTimer]);
  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      const frame = requestAnimationFrame(() => setAppUpdateState("unsupported"));
      return () => cancelAnimationFrame(frame);
    }
    let disposed = false;
    let refreshing = false;
    let registration: ServiceWorkerRegistration | undefined;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const showWaitingUpdate = () => {
      if (!registration?.waiting || !navigator.serviceWorker.controller) return false;
      setAppUpdateState("ready");
      setUpdatePromptDismissed(false);
      return true;
    };
    const checkInBackground = async () => {
      if (!registration || document.visibilityState !== "visible") return;
      try {
        await registration.update();
        if (!disposed && !registration.installing && !showWaitingUpdate()) {
          setAppUpdateState((state) => state === "checking" ? "current" : state);
        }
      } catch {
        // Keep the installed app usable while offline and retry on the next resume.
      }
    };
    const onUpdateFound = () => {
      const worker = registration?.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (disposed) return;
        if (worker.state === "installed") {
          if (!showWaitingUpdate() && !navigator.serviceWorker.controller) {
            setAppUpdateState("current");
          }
        } else if (worker.state === "redundant") {
          setAppUpdateState("idle");
        }
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkInBackground();
    };
    const onControllerChange = () => {
      if (disposed || refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((registered) => {
      if (disposed) return;
      registration = registered;
      updateRegistrationRef.current = registered;
      registered.addEventListener("updatefound", onUpdateFound);
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("online", onVisibilityChange);
      if (!showWaitingUpdate()) void checkInBackground();
    }).catch(() => undefined);
    return () => {
      disposed = true;
      if (registration) registration.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      updateRegistrationRef.current = null;
    };
  }, []);
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
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab, view, selectedAlbum, selectedArtist, selectedPlaylistId]);
  useEffect(() => {
    if (!smoothScrollRequest) return;
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [smoothScrollRequest]);
  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    localStorage.setItem("dmplayer-playback-rate", String(rate));
    setNotice(`再生速度を${rate}倍にしました`);
  };
  const changeSkipSeconds = (seconds: 10 | 15 | 30) => {
    setSkipSeconds(seconds);
    localStorage.setItem("dmplayer-skip-seconds", String(seconds));
    setNotice(`シーク送りを${seconds}秒にしました`);
  };
  const changeAmbientQuality = (quality: AmbientQuality) => {
    setAmbientQuality(quality);
    localStorage.setItem("dmplayer-ambient-quality", quality);
    setNotice(quality === "auto" ? "背景エフェクトを端末に合わせます" : quality === "high" ? "背景エフェクトを高品質にしました" : "背景エフェクトを省電力にしました");
  };
  const changeKeepScreenAwake = (enabled: boolean) => {
    const supportsWakeLock = Boolean((navigator as Navigator & { wakeLock?: unknown }).wakeLock);
    if (enabled && !supportsWakeLock) {
      setNotice("この端末では画面ロック防止を利用できません");
      return;
    }
    setKeepScreenAwake(enabled);
    localStorage.setItem("dmplayer-keep-awake", String(enabled));
    setNotice(enabled ? "再生中は画面をスリープさせません" : "画面ロック防止を解除しました");
  };
  const changeHaptics = (enabled: boolean) => {
    setHapticsEnabled(enabled);
    localStorage.setItem("dmplayer-haptics", String(enabled));
    if (enabled) navigator.vibrate?.(12);
  };
  const scheduleSleep = (minutes: number) => {
    const seconds = minutes * 60;
    setSleepTimer({ mode: "timer", endsAt: Date.now() + seconds * 1000 });
    setSleepRemaining(seconds);
    setNotice(`${minutes}分後に停止します`);
  };
  const stopAfterCurrentTrack = () => {
    setSleepTimer({ mode: "track" });
    setSleepRemaining(0);
    setNotice("現在の曲が終わったら停止します");
  };
  const cancelSleep = () => {
    setSleepTimer({ mode: "off" });
    setSleepRemaining(0);
    setNotice("スリープタイマーを解除しました");
  };
  const completeTrackSleep = () => {
    setSleepTimer({ mode: "off" });
    setSleepRemaining(0);
    setNotice("曲の終了時に停止しました");
  };
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const result = await store.addFiles(Array.from(files));
      const details = [
        result.duplicates ? `重複 ${result.duplicates}` : "",
        result.unsupported ? `対象外 ${result.unsupported}` : "",
        result.failed ? `失敗 ${result.failed}` : "",
      ].filter(Boolean).join(" · ");
      setNotice(
        result.quotaExceeded
          ? `${result.added ? `${result.added}曲を追加後、` : ""}端末の保存容量が不足しました`
          : result.added
          ? `${result.added}曲を追加しました${details ? `（${details}）` : ""}`
          : details
            ? `追加はありませんでした（${details}）`
            : "新しく追加できる曲がありませんでした",
      );
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
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };
  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!dragActive) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };
  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (store.importProgress) {
      setNotice("現在の追加処理が終わってからもう一度お試しください");
      return;
    }
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  };
  const navigateView = (next: LibraryView, direction: "forward" | "back" = "forward") => {
    if (next === view) {
      setSmoothScrollRequest((request) => request + 1);
      return;
    }
    setMotion(direction);
    setView(next);
  };
  const navigateTab = (next: Tab) => {
    if (next === tab && view === "home" && !selectedPlaylistId && !selectedAlbum) {
      setSmoothScrollRequest((request) => request + 1);
      return;
    }
    setMotion("tab");
    setTab(next);
    setView("home");
    setSelectedAlbum(undefined);
    setSelectedArtist(undefined);
    setSelectedPlaylistId(undefined);
  };
  const openNowPlaying = () => {
    setNowClosing(false);
    setNowOpen(true);
  };
  const closeNowPlaying = useCallback(() => {
    if (nowClosing) return;
    setNowClosing(true);
    window.setTimeout(() => {
      setNowOpen(false);
      setNowClosing(false);
    }, 360);
  }, [nowClosing]);
  const openRecentDetail = () => {
    setMotion("forward");
    setTab("library");
    setView("recent");
    setSelectedAlbum(undefined);
    setSelectedArtist(undefined);
    setSelectedPlaylistId(undefined);
  };
  const openPlaylistDetail = (playlistId: string) => {
    setMotion("forward");
    setTab("playlists");
    setView("home");
    setSelectedAlbum(undefined);
    setSelectedArtist(undefined);
    setSelectedPlaylistId(playlistId);
  };
  const openArtistDetail = (artist: string) => {
    setMotion("forward");
    setTab("library");
    setView("artist-detail");
    setSelectedAlbum(undefined);
    setSelectedArtist(artist || "不明なアーティスト");
    setSelectedPlaylistId(undefined);
  };
  useEffect(() => {
    const closeTopOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailTrack) {
        event.preventDefault();
        setDetailTrack(undefined);
        return;
      }
      if (menuTrack) {
        event.preventDefault();
        setMenuTrack(undefined);
        return;
      }
      if (nowOpen && !nowClosing) {
        event.preventDefault();
        closeNowPlaying();
      }
    };
    window.addEventListener("keydown", closeTopOverlay);
    return () => window.removeEventListener("keydown", closeTopOverlay);
  }, [closeNowPlaying, detailTrack, menuTrack, nowClosing, nowOpen]);
  const requestPersistentStorage = async () => {
    if (!navigator.storage?.persist) {
      setNotice("この環境では永続ストレージを要求できません。");
      return;
    }
    const granted = await navigator.storage.persist();
    setStoragePersistent(granted);
    setNotice(granted ? "ストレージが保護されました。" : "ストレージ保護は許可されませんでした。");
  };
  const openPicker = () => {
    if (!store.importProgress) fileRef.current?.click();
  };
  const filtered = useMemo(
    () => searchTracks(store.tracks, query, searchFilter),
    [query, searchFilter, store.tracks],
  );
  const recent = [...store.tracks].sort((a, b) => b.createdAt - a.createdAt);
  const history = store.tracks.filter((track) => track.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
  const favorites = store.tracks.filter((track) => track.favorite);
  const mostPlayed = [...store.tracks].filter((track) => track.playCount > 0).sort((a, b) => b.playCount - a.playCount);
  const albums = [...new Set(store.tracks.map((track) => track.album || "不明なアルバム"))];
  const artists = [...new Set(store.tracks.map((track) => track.artist || "不明なアーティスト"))];
  const source = view === "favorites" ? favorites : view === "recent" ? recent : view === "history" ? history : store.tracks;
  const visibleSource = sortTracks(source, trackSort);
  const visibleSourceIds = visibleSource.map((track) => track.id);
  const current = store.tracks.find((track) => track.id === store.currentId);

  const libraryContent = () => {
    if (!store.tracks.length) return <EmptyLibrary onAdd={openPicker} />;
    if (view === "album-detail" && selectedAlbum) {
      const albumTracks = store.tracks.filter((track) => (track.album || "不明なアルバム") === selectedAlbum);
      return <CollectionDetail kind="album" title={selectedAlbum} subtitle={albumTracks[0]?.artist || "アルバム"} tracks={albumTracks} onBack={() => { setSelectedAlbum(undefined); navigateView("albums", "back"); }} onMenu={setMenuTrack} />;
    }
    if (view === "artist-detail" && selectedArtist) {
      const artistTracks = store.tracks.filter((track) => (track.artist || "不明なアーティスト") === selectedArtist);
      return <ArtistDetail artist={selectedArtist} tracks={artistTracks} onBack={() => { setSelectedArtist(undefined); navigateView("artists", "back"); }} onMenu={setMenuTrack} onOpenAlbum={(album) => { setSelectedArtist(undefined); setSelectedAlbum(album); navigateView("album-detail"); }} />;
    }
    if (view !== "home") return <><header className="content-header"><button className="back icon-back" onClick={() => navigateView("home", "back")}><UiIcon name="back" />ライブラリ</button><button className="circle-add" aria-label="音楽を追加" disabled={Boolean(store.importProgress)} onClick={openPicker}><UiIcon name="add" /></button></header><h1>{({ songs: "曲", albums: "アルバム", artists: "アーティスト", recent: "最近追加した項目", history: "最近再生した曲", favorites: "お気に入り", home: "ライブラリ", "album-detail": "アルバム", "artist-detail": "アーティスト" } as const)[view]}</h1>{view === "albums" ? <div className="album-grid">{albums.map((album) => { const track = store.tracks.find((item) => (item.album || "不明なアルバム") === album); return <button key={album} onClick={() => { setSelectedArtist(undefined); setSelectedAlbum(album); navigateView("album-detail"); }}><Artwork track={track} /><strong>{album}</strong><small>{track?.artist}</small></button>; })}</div> : view === "artists" ? <div className="artist-list">{artists.map((artist) => <button key={artist} onClick={() => openArtistDetail(artist)}><span>{artist.slice(0, 1)}</span><strong>{artist}</strong><small>{store.tracks.filter((track) => (track.artist || "不明なアーティスト") === artist).length}曲</small><b>›</b></button>)}</div> : <><div className="track-sort" role="group" aria-label="曲の並び順">{([["default", "既定"], ["title", "曲名"], ["artist", "アーティスト"], ["album", "アルバム"]] as const).map(([id, label]) => <button key={id} className={trackSort === id ? "active" : ""} aria-pressed={trackSort === id} onClick={() => setTrackSort(id)}>{label}</button>)}</div><div className="track-list">{visibleSource.map((track) => <TrackRow key={track.id} track={track} source={visibleSourceIds} onMenu={setMenuTrack} />)}{view === "history" && !visibleSource.length && <EmptyPanel icon="timer" title="再生履歴はありません" description="曲を再生すると、ここからすぐに戻れます。" />}{view === "favorites" && !visibleSource.length && <EmptyPanel icon="heart" title="お気に入りはまだありません" description="曲のハートを押すと、ここへまとめられます。" />}</div></>}</>;
    const featured = current || recent[0];
    const replay = mostPlayed.length ? mostPlayed : history;
    return <>
      <header className="content-header library-topbar header-actions-only"><button className="circle-add" onClick={openPicker} aria-label="音楽を追加"><UiIcon name="add" /></button></header>
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

  const selectedPlaylist = store.playlists.find((playlist) => playlist.id === selectedPlaylistId);
  const selectedPlaylistTracks = selectedPlaylistId === "favorites"
    ? favorites
    : selectedPlaylist?.trackIds.map((id) => store.tracks.find((track) => track.id === id)).filter((track): track is Track => Boolean(track)) ?? [];
  const playlistsContent = selectedPlaylistId ? <CollectionDetail
    kind="playlist"
    title={selectedPlaylistId === "favorites" ? "お気に入りの曲" : selectedPlaylist?.name || "プレイリスト"}
    subtitle={selectedPlaylistId === "favorites" ? "自動更新プレイリスト" : "プレイリスト"}
    tracks={selectedPlaylistTracks}
    onBack={() => { setMotion("back"); setSelectedPlaylistId(undefined); }}
    onMenu={setMenuTrack}
  /> : <>
    <header className="content-header header-actions-only"><button className="circle-add" aria-label="プレイリストを作成" onClick={() => { const name = prompt("プレイリスト名"); if (name?.trim()) void store.createPlaylist(name.trim()); }}><UiIcon name="add" /></button></header>
    <div className="page-heading"><small>YOUR COLLECTIONS</small><h1>プレイリスト</h1></div>
    <div className="playlist-list">
      <div className="smart-playlist-row">
        <button className="playlist-main" onClick={() => { setMotion("forward"); setSelectedPlaylistId("favorites"); }}>
          <span><UiIcon name="heart" /></span><div><strong>お気に入りの曲</strong><small>自動更新 · {favorites.length}曲</small></div>
        </button>
        <em>SMART</em>
      </div>
      {store.playlists.map((playlist) => <div key={playlist.id}><button className="playlist-main" onClick={() => { setMotion("forward"); setSelectedPlaylistId(playlist.id); }}><span><UiIcon name="playlist" /></span><div><strong>{playlist.name}</strong><small>{playlist.trackIds.length}曲</small></div></button><button aria-label={`${playlist.name}を削除`} onClick={() => { if (confirm(`「${playlist.name}」を削除しますか？`)) void store.deletePlaylist(playlist.id); }}><UiIcon name="more" /></button></div>)}
      {!store.playlists.length && <button className="playlist-empty-card" onClick={() => { const name = prompt("プレイリスト名"); if (name?.trim()) void store.createPlaylist(name.trim()); }}><span><UiIcon name="add" /></span><div><strong>最初のプレイリストを作成</strong><small>気分や用途ごとに曲をまとめられます</small></div></button>}
    </div>
  </>;
  const searchActive = Boolean(query.trim()) || searchFilter !== "all";
  const filteredIds = filtered.map((track) => track.id);
  const searchContent = <>
    <header className="content-header header-actions-only"><button className="circle-add" aria-label="音楽を追加" disabled={Boolean(store.importProgress)} onClick={openPicker}><UiIcon name="add" /></button></header>
    <div className="page-heading search-heading"><small>FIND YOUR MUSIC</small><h1>検索</h1><p>曲名だけでなく、アーティスト、アルバム、ファイル形式からも探せます。</p></div>
    {!store.tracks.length ? <EmptyPanel icon="search" title="検索できる曲がありません" description="音楽を追加すると、曲名・アーティスト・音質から探せます。" actionLabel="音楽を追加" onAction={openPicker} /> : <>
    <div className="search-box">
      <span><UiIcon name="search" /></span>
      <input type="search" aria-label="ライブラリを検索" autoComplete="off" inputMode="search" placeholder="曲、アーティスト、アルバム" value={query} onChange={(event) => setQuery(event.target.value)} />
      {query && <button aria-label="検索語を消去" onClick={() => setQuery("")}><UiIcon name="close" /></button>}
    </div>
    <div className="search-filters" role="group" aria-label="検索フィルター">
      {([
        ["all", "すべて"],
        ["favorites", "お気に入り"],
        ["lossless", "ロスレス"],
        ["hires", "ハイレゾ"],
        ["unplayed", "未再生"],
      ] as const).map(([id, label]) => <button key={id} className={searchFilter === id ? "active" : ""} aria-pressed={searchFilter === id} onClick={() => setSearchFilter(id)}>{label}</button>)}
    </div>
    {searchActive ? <>
      <div className="search-summary"><span><strong>{filtered.length}</strong>曲</span><button onClick={() => { setQuery(""); setSearchFilter("all"); }}>条件をリセット</button></div>
      <div className="track-list search-results">
        {filtered.map((track) => <TrackRow key={track.id} track={track} source={filteredIds} onMenu={setMenuTrack} />)}
        {!filtered.length && <EmptyPanel icon="search" title="見つかりませんでした" description="語句を短くするか、フィルターを切り替えてください。" actionLabel="条件をリセット" onAction={() => { setQuery(""); setSearchFilter("all"); }} />}
      </div>
    </> : <div className="search-discovery">
      <div className="search-discovery-copy"><small>QUICK FILTERS</small><h2>音質や再生状況から探す</h2></div>
      <div className="search-discovery-grid">
        <button onClick={() => setSearchFilter("favorites")}><span><UiIcon name="heart" /></span><strong>お気に入り</strong><small>{favorites.length}曲</small></button>
        <button onClick={() => setSearchFilter("lossless")}><span><UiIcon name="sound" /></span><strong>ロスレス</strong><small>{searchTracks(store.tracks, "", "lossless").length}曲</small></button>
        <button onClick={() => setSearchFilter("hires")}><span><UiIcon name="controls" /></span><strong>ハイレゾ</strong><small>{searchTracks(store.tracks, "", "hires").length}曲</small></button>
        <button onClick={() => setSearchFilter("unplayed")}><span><UiIcon name="play" /></span><strong>未再生</strong><small>{searchTracks(store.tracks, "", "unplayed").length}曲</small></button>
      </div>
    </div>}</>}
  </>;
  const settingsContent = <div className="settings-page">
    <div className="page-heading"><small>PERSONALIZE</small><h1>設定</h1></div>
    <section className="settings-section app-update-section"><SettingsHeading icon="refresh" title="アプリの更新" caption="インストール済みアプリも最新版へ" /><div className="setting-card rows app-update-card"><div><span>現在のバージョン</span><strong>Version 0.5.1</strong></div><button disabled={appUpdateState === "checking" || appUpdateState === "unsupported"} onClick={() => appUpdateState === "ready" ? applyAppUpdate() : void checkForAppUpdate(true)}><span className="settings-action"><UiIcon name="refresh" />アップデートを確認</span><strong>{appUpdateState === "ready" ? store.playing ? "停止して更新" : "今すぐ更新" : appUpdateState === "checking" ? "確認中…" : appUpdateState === "current" ? "最新版" : appUpdateState === "unsupported" ? "利用不可" : "確認する"}</strong></button><div className="setting-note">起動時・アプリ復帰時・オンライン復帰時にも自動で確認します。</div></div></section>
    <section className="settings-section"><SettingsHeading icon="timer" title="再生" caption="速度とスリープタイマー" /><PlaybackTools playbackRate={playbackRate} onPlaybackRateChange={changePlaybackRate} sleepTimer={sleepTimer} sleepRemaining={sleepRemaining} onSleepMinutes={scheduleSleep} onSleepAfterTrack={stopAfterCurrentTrack} onCancelSleep={cancelSleep} /></section>
    <section className="settings-section"><SettingsHeading icon="controls" title="操作と端末" caption="シーク、画面ロック、触覚" /><DevicePreferences skipSeconds={skipSeconds} keepScreenAwake={keepScreenAwake} hapticsEnabled={hapticsEnabled} onSkipSecondsChange={changeSkipSeconds} onKeepScreenAwakeChange={changeKeepScreenAwake} onHapticsChange={changeHaptics} /></section>
    <section className="settings-section"><SettingsHeading icon="sound" title="サウンド" caption="5バンドEQとプリセット" /><Equalizer /></section>
    <section className="settings-section"><SettingsHeading icon="palette" title="外観" caption="テーマと再生画面の描画品質" /><AppearancePreferences theme={store.theme} ambientQuality={ambientQuality} onThemeChange={store.setTheme} onAmbientQualityChange={changeAmbientQuality} /></section>
    <section className="settings-section"><SettingsHeading icon="storage" title="ストレージ" caption="すべての音源は端末内だけに保存" /><div className="setting-card rows settings-rows"><div><span>保存した曲</span><strong>{store.tracks.length}曲</strong></div><div><span>使用容量</span><strong>{(store.tracks.reduce((sum, track) => sum + track.fileSize, 0) / 1024 / 1024).toFixed(1)} MB</strong></div><button onClick={() => void requestPersistentStorage()}><span className="settings-action"><UiIcon name="shield" />ストレージを保護</span><strong>{storagePersistent === true ? "保護済み" : storagePersistent === false ? "未保護" : "確認中"}</strong></button><button className="danger" onClick={() => { if (confirm("保存したすべての曲とプレイリストを削除しますか？この操作は取り消せません。")) void store.clear(); }}><span className="settings-action"><UiIcon name="trash" />ライブラリをすべて削除</span></button></div></section>
    <section className="settings-section"><SettingsHeading icon="app" title="このアプリについて" caption="ローカルファーストPWA" /><div className="setting-card rows"><div><span>DMPlayer2</span><strong>Version 0.5.1</strong></div><div className="setting-note">端末内保存 · オフライン対応</div></div></section>
  </div>;

  return <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} onDragEnter={handleDragEnter} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={handleDragLeave} onDrop={handleDrop}><input ref={fileRef} hidden type="file" accept={AUDIO_FILE_ACCEPT} multiple onChange={(event) => void addFiles(event.target.files)} /><PlayerEngine audioRef={audioRef} playbackRate={playbackRate} stopAfterTrack={sleepTimer.mode === "track"} onStopAfterTrack={completeTrackSleep} /><SidebarLibrary onOpenRecent={openRecentDetail} onOpenPlaylist={openPlaylistDetail} /><aside className="sidebar"><button className="sidebar-toggle" aria-label={sidebarCollapsed ? "サイドバーを開く" : "サイドバーを収納"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((collapsed) => { const next = !collapsed; localStorage.setItem("dmplayer-sidebar-collapsed", String(next)); return next; })}><UiIcon name="back" /></button><div className="sidebar-brand"><BrandMark /><strong>DMPlayer2</strong></div>{([["library", "ライブラリ"], ["playlists", "プレイリスト"], ["search", "検索"], ["settings", "設定"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTab(id)} aria-label={label}><NavIcon name={id} /><span className="sidebar-label">{label}</span></button>)}<button className="sidebar-add" disabled={Boolean(store.importProgress)} onClick={openPicker} aria-label="音楽を追加"><UiIcon name="add" /><span className="sidebar-label">音楽を追加</span></button></aside><section ref={contentRef} className="content"><div key={`${tab}-${view}-${selectedAlbum ?? selectedArtist ?? selectedPlaylistId ?? ""}`} className={`content-inner view-transition view-${motion}`}>{tab === "library" ? libraryContent() : tab === "playlists" ? playlistsContent : tab === "search" ? searchContent : settingsContent}</div></section><TabletPlayer audioRef={audioRef} onOpen={openNowPlaying} /><div className="mobile-dock"><MiniPlayer variant="mobile" onOpen={openNowPlaying} audioRef={audioRef} /><nav className="tab-bar" aria-label="メインナビゲーション">{([["library", "ライブラリ"], ["playlists", "プレイリスト"], ["search", "検索"], ["settings", "設定"]] as const).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => navigateTab(id)} aria-current={tab === id ? "page" : undefined}><NavIcon name={id} /><small>{label}</small></button>)}</nav></div>{nowOpen && <NowPlaying closing={nowClosing} onClose={closeNowPlaying} onOpenArtist={(artist) => { openArtistDetail(artist); closeNowPlaying(); }} audioRef={audioRef} />}
    {menuTrack && <div className="sheet-backdrop" onClick={() => setMenuTrack(undefined)}><section className="action-sheet" role="dialog" aria-modal="true" aria-label={`${menuTrack.title}の操作メニュー`} onClick={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <div className="sheet-track"><Artwork track={menuTrack} size="small" /><div><strong>{menuTrack.title}</strong><small>{menuTrack.artist} · {trackBitrate(menuTrack) ? `${Math.round(trackBitrate(menuTrack)! / 1000)} kbps` : menuTrack.codec || "Audio"}</small></div></div>
      <button onClick={() => { store.playTrack(menuTrack.id); setMenuTrack(undefined); }}><UiIcon name="play" /><span>今すぐ再生</span></button>
      <button onClick={() => { store.addNext(menuTrack.id); setNotice("次に再生します"); setMenuTrack(undefined); }}><UiIcon name="next" /><span>次に再生</span></button>
      <button onClick={() => { store.addToQueue(menuTrack.id); setNotice("キューに追加しました"); setMenuTrack(undefined); }}><UiIcon name="queue" /><span>キューに追加</span></button>
      <button onClick={() => { void store.updateTrack(menuTrack.id, { favorite: !menuTrack.favorite }); setMenuTrack(undefined); }}><UiIcon name="heart" /><span>{menuTrack.favorite ? "お気に入りから削除" : "お気に入りに追加"}</span></button>
      <button onClick={() => { setDetailTrack(menuTrack); setMenuTrack(undefined); }}><UiIcon name="info" /><span>曲の詳細を見る</span></button>
      <button onClick={() => { const title = prompt("曲名", menuTrack.title); if (title === null) return; const artist = prompt("アーティスト", menuTrack.artist ?? ""); if (artist === null) return; const album = prompt("アルバム", menuTrack.album ?? ""); if (album === null) return; void store.updateTrack(menuTrack.id, { title: title.trim() || menuTrack.title, artist: artist.trim() || "不明なアーティスト", album: album.trim() || "不明なアルバム" }); setMenuTrack(undefined); }}><UiIcon name="edit" /><span>曲情報を編集</span></button>
      <button onClick={() => { const id = menuTrack.id; setMenuTrack(undefined); void store.refreshMetadata(id).then((success) => setNotice(success ? "埋め込み情報を更新しました" : "埋め込み情報を読み取れませんでした")); }}><UiIcon name="refresh" /><span>メタデータとカバーを再解析</span></button>
      {store.playlists.map((playlist) => <button key={playlist.id} onClick={() => { void store.togglePlaylistTrack(playlist.id, menuTrack.id); setNotice(`「${playlist.name}」を更新しました`); setMenuTrack(undefined); }}><UiIcon name="playlist" /><span>{playlist.name}に追加 / 削除</span></button>)}
      <button className="danger" onClick={() => { if (confirm(`「${menuTrack.title}」をライブラリから削除しますか？`)) void store.deleteTrack(menuTrack.id); setMenuTrack(undefined); }}><UiIcon name="trash" /><span>ライブラリから削除</span></button>
      <button className="cancel" onClick={() => setMenuTrack(undefined)}>キャンセル</button>
    </section></div>}
    {detailTrack && <TrackDetails track={detailTrack} onClose={() => setDetailTrack(undefined)} />}
    {dragActive && <div className="drop-overlay" aria-hidden="true"><div><span><UiIcon name="add" /></span><strong>音楽をここにドロップ</strong><small>複数ファイルをまとめて追加できます</small><em>MP3 · M4A · FLAC · WAV · MIDI ほか</em></div></div>}
    {store.importProgress ? <div className="toast import-toast" role="status" aria-live="polite" aria-atomic="true"><div><span>ライブラリへ追加中</span><strong>{store.importProgress.processed} / {store.importProgress.total}</strong></div><small>{store.importProgress.currentFile}</small><i><b style={{ width: `${store.importProgress.total ? store.importProgress.processed / store.importProgress.total * 100 : 0}%` }} /></i></div> : appUpdateState === "ready" && !updatePromptDismissed ? <div className="toast update-toast" role="status" aria-live="polite" aria-atomic="true"><span><strong>新しいバージョンがあります</strong><small>{store.playing ? "再生を停止して更新します" : "すぐに最新版へ切り替えられます"}</small></span><button className="update-now" onClick={applyAppUpdate}>{store.playing ? "停止して更新" : "今すぐ更新"}</button><button className="update-dismiss" aria-label="アップデート通知を閉じる" onClick={() => setUpdatePromptDismissed(true)}><UiIcon name="close" /></button></div> : notice && <div className="toast" role="status" aria-live="polite" aria-atomic="true">{notice}</div>}{!store.ready && <div className="loading"><BrandMark /><p>ライブラリを準備しています</p></div>}{current && <button className="desktop-now" onClick={openNowPlaying}>再生画面を開く</button>}</main>;
}
