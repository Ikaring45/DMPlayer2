"use client";

import { useCallback, useEffect, useRef } from "react";
import { getAudioFormatLabel } from "../lib/audio-formats";
import * as db from "../lib/db";
import { usePlayerStore } from "../store";

export function PlayerEngine({ audioRef }: { audioRef: React.RefObject<HTMLAudioElement | null> }) {
  const { tracks, currentId, volume, playing, repeat, eqEnabled, eqBands, setPlaying, updateTrack, next, previous } = usePlayerStore();
  const current = tracks.find((track) => track.id === currentId);
  const lastId = useRef<string | undefined>(undefined);
  const activeUrl = useRef<string | undefined>(undefined);
  const audioContext = useRef<AudioContext | undefined>(undefined);
  const equalizerFilters = useRef<BiquadFilterNode[]>([]);
  const analyser = useRef<AnalyserNode | undefined>(undefined);
  const visualizerFrame = useRef(0);
  const loadGeneration = useRef(0);
  const countedId = useRef<string | undefined>(undefined);
  const ignoredPauseEvents = useRef(0);

  const publishSilentFrame = useCallback(() => {
    window.dispatchEvent(new CustomEvent("dmplayer:audio-frame", {
      detail: { bands: [0, 0, 0, 0, 0], level: 0 },
    }));
  }, []);

  const stopVisualizer = useCallback(() => {
    if (visualizerFrame.current) cancelAnimationFrame(visualizerFrame.current);
    visualizerFrame.current = 0;
    publishSilentFrame();
  }, [publishSilentFrame]);

  const startVisualizer = useCallback(() => {
    const spectrum = analyser.current;
    if (!spectrum || visualizerFrame.current) return;
    const samples = new Uint8Array(spectrum.frequencyBinCount);
    const publishSpectrum = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) {
        visualizerFrame.current = 0;
        publishSilentFrame();
        return;
      }
      spectrum.getByteFrequencyData(samples);
      const ranges = [[1, 4], [4, 12], [12, 32], [32, 78], [78, 190]];
      const bands = ranges.map(([from, to]) => {
        let sum = 0;
        const end = Math.min(to, samples.length);
        for (let index = from; index < end; index += 1) sum += samples[index];
        return sum / Math.max(1, end - from) / 255;
      });
      const level = bands.reduce((sum, value) => sum + value, 0) / bands.length;
      window.dispatchEvent(new CustomEvent("dmplayer:audio-frame", { detail: { bands, level } }));
      visualizerFrame.current = requestAnimationFrame(publishSpectrum);
    };
    visualizerFrame.current = requestAnimationFrame(publishSpectrum);
  }, [audioRef, publishSilentFrame]);

  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioContext.current) return;
    const Context = window.AudioContext
      || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    try {
      const context = new Context();
      const source = context.createMediaElementSource(audio);
      const frequencies = [60, 230, 910, 3600, 14000];
      const state = usePlayerStore.getState();
      const filters = frequencies.map((frequency, index) => {
        const filter = context.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === frequencies.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = state.eqEnabled ? state.eqBands[index] ?? 0 : 0;
        return filter;
      });
      const spectrum = context.createAnalyser();
      spectrum.fftSize = 512;
      spectrum.smoothingTimeConstant = 0.82;
      source.connect(filters[0]);
      filters.forEach((filter, index) => filter.connect(filters[index + 1] ?? spectrum));
      spectrum.connect(context.destination);
      audioContext.current = context;
      equalizerFilters.current = filters;
      analyser.current = spectrum;
    } catch (error) {
      console.warn("Audio graph could not be initialized", error);
    }
  }, [audioRef]);

  const clearAudio = useCallback(() => {
    loadGeneration.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = undefined;
    lastId.current = undefined;
    countedId.current = undefined;
    stopVisualizer();
  }, [audioRef, stopVisualizer]);

  const loadTrackAudio = useCallback(async (id: string, autoplay: boolean) => {
    const generation = ++loadGeneration.current;
    const audioAtStart = audioRef.current;
    if (audioAtStart && lastId.current && lastId.current !== id) {
      if (!audioAtStart.paused) {
        ignoredPauseEvents.current += 1;
        audioAtStart.pause();
      }
      audioAtStart.removeAttribute("src");
      audioAtStart.load();
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
      activeUrl.current = undefined;
      lastId.current = undefined;
      stopVisualizer();
    }
    let blob: Blob | undefined;
    try {
      blob = await db.getTrackAudio(id);
    } catch (error) {
      console.error("Stored audio could not be read", error);
    }
    const audio = audioRef.current;
    if (
      generation !== loadGeneration.current
      || usePlayerStore.getState().currentId !== id
      || !audio
    ) return;
    if (!blob) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
      activeUrl.current = undefined;
      lastId.current = undefined;
      stopVisualizer();
      usePlayerStore.getState().setPlaying(false);
      window.dispatchEvent(new CustomEvent("dmplayer:notice", {
        detail: "音源データを読み込めませんでした。曲を追加し直してください。",
      }));
      return;
    }
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = URL.createObjectURL(blob);
    if (lastId.current !== id) countedId.current = undefined;
    lastId.current = id;
    audio.src = activeUrl.current;
    audio.volume = usePlayerStore.getState().volume;
    audio.load();
    if (autoplay && usePlayerStore.getState().playing) {
      void audio.play().catch(() => usePlayerStore.getState().setPlaying(false));
    }
  }, [audioRef, stopVisualizer]);

  useEffect(() => {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("dmplayer2:position:")) localStorage.removeItem(key);
    }
  }, []);

  useEffect(() => {
    const handlePlayRequest = (event: Event) => {
      const audio = audioRef.current;
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (!audio || !detail?.id) return;
      ensureAudioGraph();
      if (audioContext.current?.state === "suspended") void audioContext.current.resume();
      audio.volume = usePlayerStore.getState().volume;
      if (lastId.current === detail.id && audio.src) {
        void audio.play().catch(() => setPlaying(false));
      } else {
        void loadTrackAudio(detail.id, true);
      }
    };
    window.addEventListener("dmplayer:play-request", handlePlayRequest);
    return () => window.removeEventListener("dmplayer:play-request", handlePlayRequest);
  }, [audioRef, ensureAudioGraph, loadTrackAudio, setPlaying]);

  useEffect(() => () => {
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    if (visualizerFrame.current) cancelAnimationFrame(visualizerFrame.current);
    if (audioContext.current) void audioContext.current.close();
  }, []);

  useEffect(() => {
    equalizerFilters.current.forEach((filter, index) => {
      const target = eqEnabled ? eqBands[index] ?? 0 : 0;
      filter.gain.setTargetAtTime(target, filter.context.currentTime, 0.015);
    });
  }, [eqBands, eqEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentId) {
      clearAudio();
      if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
      return;
    }
    audio.volume = volume;
    if (lastId.current !== currentId) {
      void loadTrackAudio(currentId, playing);
      return;
    }
    if (playing && audio.paused) {
      if (audioContext.current?.state === "suspended") void audioContext.current.resume();
      void audio.play().catch(() => setPlaying(false));
    }
    if (!playing && !audio.paused) audio.pause();
  }, [audioRef, clearAudio, currentId, loadTrackAudio, playing, setPlaying, volume]);

  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    let cancelled = false;
    const setSystemMetadata = async () => {
      let artwork: MediaImage[] = [];
      if (current.artwork) {
        const src = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => resolve("");
          reader.readAsDataURL(current.artwork!);
        });
        if (src) artwork = [{ src, type: current.artworkType || current.artwork.type || "image/jpeg" }];
      }
      if (!cancelled) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: current.album,
          artwork,
        });
      }
    };
    void setSystemMetadata();
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => setPlaying(true)],
      ["pause", () => setPlaying(false)],
      ["nexttrack", next],
      ["previoustrack", previous],
      ["seekto", (details) => { if (audioRef.current && details.seekTime != null) audioRef.current.currentTime = details.seekTime; }],
      ["seekforward", () => { if (audioRef.current) audioRef.current.currentTime += 10; }],
      ["seekbackward", () => { if (audioRef.current) audioRef.current.currentTime -= 10; }],
    ];
    for (const [action, handler] of actions) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    }
    return () => { cancelled = true; };
  }, [audioRef, current, next, previous, setPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    const audio = audioRef.current;
    if (!audio) return;
    const updatePosition = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime, audio.duration),
        });
      } catch {}
    };
    audio.addEventListener("timeupdate", updatePosition);
    audio.addEventListener("durationchange", updatePosition);
    updatePosition();
    return () => {
      audio.removeEventListener("timeupdate", updatePosition);
      audio.removeEventListener("durationchange", updatePosition);
    };
  }, [audioRef, currentId, playing]);

  return (
    <audio
      ref={audioRef}
      preload="metadata"
      playsInline
      onPlay={() => {
        setPlaying(true);
        startVisualizer();
        const id = lastId.current;
        if (!id || countedId.current === id) return;
        countedId.current = id;
        const track = usePlayerStore.getState().tracks.find((item) => item.id === id);
        if (track) {
          void updateTrack(id, {
            playCount: track.playCount + 1,
            lastPlayedAt: Date.now(),
          });
        }
      }}
      onPause={() => {
        stopVisualizer();
        if (ignoredPauseEvents.current > 0) {
          ignoredPauseEvents.current -= 1;
          return;
        }
        setPlaying(false);
      }}
      onError={() => {
        setPlaying(false);
        if (current) {
          const format = getAudioFormatLabel(current.fileName, current.fileType);
          window.dispatchEvent(new CustomEvent("dmplayer:notice", {
            detail: `${format}を再生できませんでした。ファイルまたは端末の対応状況を確認してください。`,
          }));
        }
      }}
      onLoadedMetadata={(event) => {
        if (!current) return;
        if (!current.duration) void updateTrack(current.id, { duration: event.currentTarget.duration });
      }}
      onEnded={() => {
        stopVisualizer();
        if (repeat === "one" && audioRef.current) {
          audioRef.current.currentTime = 0;
          void audioRef.current.play();
        } else next();
      }}
    />
  );
}
