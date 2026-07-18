"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

const SAMPLE_SIZE = 48;
const MAX_CACHE_ENTRIES = 64;
const DEFAULT_TRANSITION_MS = 2600;
const MIN_TRANSITION_MS = 1500;
const MAX_TRANSITION_MS = 4000;

type Rgb = readonly [number, number, number];
type Hsl = { h: number; s: number; l: number };
type AudioFrame = { bands?: number[]; level?: number };
type AmbientQuality = "auto" | "high" | "low";
type ResolvedAmbientQuality = Exclude<AmbientQuality, "auto">;
type AmbientCssProperties = CSSProperties & Record<`--ambient-${string}`, string | number>;

export type AlbumAmbientPalette = {
  base: string;
  dominant: string;
  secondary: string;
  accent: string;
  dark: string;
  light: string;
  blobs: readonly [string, string, string, string, string];
};

export type AnimatedAlbumBackgroundProps = {
  /**
   * A browser-loadable artwork URL. Blob/data URLs are supported and are ideal
   * for local IndexedDB artwork.
   */
  artwork?: string | null;
  /**
   * Prefer a stable album id here when a new Blob URL is created for every
   * render. Palettes are cached by this key, or by `artwork` when it is absent.
   */
  albumKey?: string | null;
  className?: string;
  /**
   * The palette crossfade is intentionally clamped to 1.5–4 seconds.
   */
  transitionDurationMs?: number;
  /**
   * `auto` lowers the effect tier on constrained/save-data devices. CSS can
   * hide blobs 4–5 or reduce blur when `data-quality="low"`.
   */
  quality?: AmbientQuality;
};

type PaletteLayer = {
  id: number;
  cacheKey: string;
  palette: AlbumAmbientPalette;
  visible: boolean;
};

type ColorBucket = {
  red: number;
  green: number;
  blue: number;
  count: number;
  weight: number;
};

type ColorCandidate = {
  rgb: Rgb;
  hsl: Hsl;
  count: number;
  weight: number;
};

const FALLBACK_PALETTES: readonly AlbumAmbientPalette[] = [
  {
    base: "#100b18",
    dominant: "#8f345f",
    secondary: "#59367e",
    accent: "#c65373",
    dark: "#0b0911",
    light: "#b47f9d",
    blobs: ["#8f345f", "#59367e", "#c65373", "#394f77", "#b47f9d"],
  },
  {
    base: "#071518",
    dominant: "#17656c",
    secondary: "#2d4f73",
    accent: "#538b7c",
    dark: "#050e11",
    light: "#76aaa3",
    blobs: ["#17656c", "#2d4f73", "#538b7c", "#473c68", "#76aaa3"],
  },
  {
    base: "#171006",
    dominant: "#76532e",
    secondary: "#70414a",
    accent: "#a66b42",
    dark: "#0d0a07",
    light: "#b99773",
    blobs: ["#76532e", "#70414a", "#a66b42", "#454d6a", "#b99773"],
  },
] as const;

const paletteCache = new Map<string, Promise<AlbumAmbientPalette>>();

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function stableHash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function fallbackPalette(key: string) {
  return FALLBACK_PALETTES[stableHash(key) % FALLBACK_PALETTES.length];
}

function rgbToHsl([redByte, greenByte, blueByte]: Rgb): Hsl {
  const red = redByte / 255;
  const green = greenByte / 255;
  const blue = blueByte / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if (delta === 0) return { h: 0, s: 0, l: lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return {
    h: ((hue * 60) + 360) % 360,
    s: Number.isFinite(saturation) ? saturation : 0,
    l: lightness,
  };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
  let channels: Rgb = [0, 0, 0];

  if (section < 1) channels = [chroma, intermediate, 0];
  else if (section < 2) channels = [intermediate, chroma, 0];
  else if (section < 3) channels = [0, chroma, intermediate];
  else if (section < 4) channels = [0, intermediate, chroma];
  else if (section < 5) channels = [intermediate, 0, chroma];
  else channels = [chroma, 0, intermediate];

  const match = l - chroma / 2;
  return channels.map((channel) => Math.round((channel + match) * 255)) as unknown as Rgb;
}

function rgbToHex(rgb: Rgb) {
  return `#${rgb.map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(color: string): Rgb {
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)) as unknown as Rgb;
}

function mixRgb(first: Rgb, second: Rgb, amount: number): Rgb {
  return first.map((channel, index) => (
    Math.round(channel + (second[index] - channel) * amount)
  )) as unknown as Rgb;
}

function tuneColor(
  rgb: Rgb,
  {
    minimumSaturation,
    maximumSaturation,
    minimumLightness,
    maximumLightness,
    saturationScale = 1.08,
  }: {
    minimumSaturation: number;
    maximumSaturation: number;
    minimumLightness: number;
    maximumLightness: number;
    saturationScale?: number;
  },
) {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({
    h: hsl.h,
    s: clamp(hsl.s * saturationScale, minimumSaturation, maximumSaturation),
    l: clamp(hsl.l, minimumLightness, maximumLightness),
  });
}

function colorDistance(first: ColorCandidate, second: ColorCandidate) {
  const red = (first.rgb[0] - second.rgb[0]) / 255;
  const green = (first.rgb[1] - second.rgb[1]) / 255;
  const blue = (first.rgb[2] - second.rgb[2]) / 255;
  const rgbDistance = Math.sqrt(red * red + green * green + blue * blue) / Math.sqrt(3);
  const hueDifference = Math.min(
    Math.abs(first.hsl.h - second.hsl.h),
    360 - Math.abs(first.hsl.h - second.hsl.h),
  ) / 180;
  return rgbDistance * 0.72 + hueDifference * Math.min(first.hsl.s, second.hsl.s) * 0.28;
}

function buildPalette(candidates: ColorCandidate[], key: string): AlbumAmbientPalette {
  const fallback = fallbackPalette(key);
  if (!candidates.length) return fallback;

  const ranked = [...candidates]
    .sort((first, second) => second.weight - first.weight)
    .slice(0, 32);
  const selected: ColorCandidate[] = [];

  while (selected.length < 7 && selected.length < ranked.length) {
    let best: ColorCandidate | undefined;
    let bestScore = -1;
    for (const candidate of ranked) {
      if (selected.includes(candidate)) continue;
      const distance = selected.length
        ? Math.min(...selected.map((existing) => colorDistance(candidate, existing)))
        : 0.5;
      const prominence = Math.log2(candidate.weight + 1);
      const saturationLift = 0.78 + candidate.hsl.s * 0.4;
      const score = prominence * saturationLift * (0.62 + distance * 1.35);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) break;
    selected.push(best);
  }

  const fallbackColors = fallback.blobs.map(hexToRgb);
  const selectedRgb = selected.map((candidate) => candidate.rgb);
  while (selectedRgb.length < 5) {
    selectedRgb.push(fallbackColors[selectedRgb.length % fallbackColors.length]);
  }

  const dominantSource = selectedRgb[0];
  const secondarySource = selectedRgb[1];
  const accentSource = [...selected]
    .sort((first, second) => (
      (second.hsl.s * 0.7 + second.weight / (ranked[0].weight || 1) * 0.3)
      - (first.hsl.s * 0.7 + first.weight / (ranked[0].weight || 1) * 0.3)
    ))[0]?.rgb ?? selectedRgb[2];
  const darkSource = [...ranked]
    .filter((candidate) => candidate.count >= 2)
    .sort((first, second) => first.hsl.l - second.hsl.l)[0]?.rgb ?? dominantSource;
  const lightSource = [...selected]
    .sort((first, second) => second.hsl.l - first.hsl.l)[0]?.rgb ?? selectedRgb[3];

  const dominant = tuneColor(dominantSource, {
    minimumSaturation: 0.18,
    maximumSaturation: 0.72,
    minimumLightness: 0.27,
    maximumLightness: 0.52,
  });
  const secondary = tuneColor(secondarySource, {
    minimumSaturation: 0.16,
    maximumSaturation: 0.68,
    minimumLightness: 0.23,
    maximumLightness: 0.49,
  });
  const accent = tuneColor(accentSource, {
    minimumSaturation: 0.28,
    maximumSaturation: 0.78,
    minimumLightness: 0.32,
    maximumLightness: 0.57,
  });
  const light = tuneColor(lightSource, {
    minimumSaturation: 0.12,
    maximumSaturation: 0.58,
    minimumLightness: 0.43,
    maximumLightness: 0.64,
    saturationScale: 0.95,
  });
  const dark = tuneColor(darkSource, {
    minimumSaturation: 0.12,
    maximumSaturation: 0.48,
    minimumLightness: 0.055,
    maximumLightness: 0.14,
    saturationScale: 0.8,
  });
  const base = tuneColor(mixRgb(dark, dominant, 0.14), {
    minimumSaturation: 0.15,
    maximumSaturation: 0.5,
    minimumLightness: 0.055,
    maximumLightness: 0.13,
    saturationScale: 0.9,
  });
  const fifth = tuneColor(selectedRgb[4], {
    minimumSaturation: 0.14,
    maximumSaturation: 0.64,
    minimumLightness: 0.25,
    maximumLightness: 0.54,
  });

  return {
    base: rgbToHex(base),
    dominant: rgbToHex(dominant),
    secondary: rgbToHex(secondary),
    accent: rgbToHex(accent),
    dark: rgbToHex(dark),
    light: rgbToHex(light),
    blobs: [
      rgbToHex(dominant),
      rgbToHex(secondary),
      rgbToHex(accent),
      rgbToHex(light),
      rgbToHex(fifth),
    ],
  };
}

function candidatesFromImageData(data: Uint8ClampedArray) {
  const buckets = new Map<number, ColorBucket>();

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 176) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const hsl = rgbToHsl([red, green, blue]);
    if (hsl.l < 0.015 || hsl.l > 0.985) continue;

    const key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
    const existing = buckets.get(key) ?? {
      red: 0,
      green: 0,
      blue: 0,
      count: 0,
      weight: 0,
    };
    const middleLightness = 1 - Math.min(1, Math.abs(hsl.l - 0.5) * 1.7);
    const extremePenalty = hsl.l < 0.05 || hsl.l > 0.94 ? 0.14 : 1;
    const pixelWeight = (0.42 + hsl.s * 1.1 + middleLightness * 0.22) * extremePenalty;

    existing.red += red;
    existing.green += green;
    existing.blue += blue;
    existing.count += 1;
    existing.weight += pixelWeight;
    buckets.set(key, existing);
  }

  return [...buckets.values()].map((bucket): ColorCandidate => {
    const rgb = [
      bucket.red / bucket.count,
      bucket.green / bucket.count,
      bucket.blue / bucket.count,
    ] as Rgb;
    return {
      rgb,
      hsl: rgbToHsl(rgb),
      count: bucket.count,
      weight: bucket.weight,
    };
  });
}

function loadArtworkImage(artwork: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error("Artwork palette extraction timed out."));
    }, 12000);

    image.decoding = "async";
    if (!artwork.startsWith("blob:") && !artwork.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      reject(new Error("Artwork could not be loaded for palette extraction."));
    };
    image.src = artwork;
  });
}

async function extractPalette(artwork: string, key: string) {
  const image = await loadArtworkImage(artwork);
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true,
  });
  if (!context) throw new Error("Canvas 2D is unavailable.");

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error("Artwork has no readable dimensions.");
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = (sourceWidth - cropSize) / 2;
  const sourceY = (sourceHeight - cropSize) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    SAMPLE_SIZE,
    SAMPLE_SIZE,
  );
  const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  return buildPalette(candidatesFromImageData(pixels), key);
}

function getCachedPalette(artwork: string, key: string) {
  const existing = paletteCache.get(key);
  if (existing) return existing;

  const pending = extractPalette(artwork, key).catch(() => fallbackPalette(key));
  paletteCache.set(key, pending);
  if (paletteCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = paletteCache.keys().next().value;
    if (oldestKey) paletteCache.delete(oldestKey);
  }
  return pending;
}

function paletteStyle(palette: AlbumAmbientPalette, visible: boolean, duration: number) {
  return {
    "--ambient-base-color": palette.base,
    "--ambient-dominant-color": palette.dominant,
    "--ambient-secondary-color": palette.secondary,
    "--ambient-accent-color": palette.accent,
    "--ambient-dark-color": palette.dark,
    "--ambient-light-color": palette.light,
    "--ambient-blob-1-color": palette.blobs[0],
    "--ambient-blob-2-color": palette.blobs[1],
    "--ambient-blob-3-color": palette.blobs[2],
    "--ambient-blob-4-color": palette.blobs[3],
    "--ambient-blob-5-color": palette.blobs[4],
    "--ambient-layer-opacity": visible ? 1 : 0,
    backgroundColor: palette.base,
    opacity: visible ? 1 : 0,
    transition: `opacity ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
  } as AmbientCssProperties;
}

function resolveAutomaticQuality(): ResolvedAmbientQuality {
  const navigatorWithHints = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const constrainedMemory = (
    typeof navigatorWithHints.deviceMemory === "number"
    && navigatorWithHints.deviceMemory <= 4
  );
  const constrainedCpu = (
    typeof navigator.hardwareConcurrency === "number"
    && navigator.hardwareConcurrency <= 4
  );
  return navigatorWithHints.connection?.saveData || constrainedMemory || constrainedCpu ? "low" : "high";
}

export function AnimatedAlbumBackground({
  artwork,
  albumKey,
  className = "",
  transitionDurationMs = DEFAULT_TRANSITION_MS,
  quality = "auto",
}: AnimatedAlbumBackgroundProps) {
  const cacheKey = useMemo(() => (
    albumKey?.trim()
      ? `album:${albumKey.trim()}`
      : artwork
        ? `artwork:${artwork}`
        : "artwork:none"
  ), [albumKey, artwork]);
  const duration = clamp(transitionDurationMs, MIN_TRANSITION_MS, MAX_TRANSITION_MS);
  const initialPalette = useMemo(() => fallbackPalette(cacheKey), [cacheKey]);
  const [layers, setLayers] = useState<PaletteLayer[]>(() => [{
    id: 0,
    cacheKey: `fallback:${cacheKey}`,
    palette: initialPalette,
    visible: true,
  }]);
  const [automaticQuality, setAutomaticQuality] = useState<ResolvedAmbientQuality>("high");
  const [reducedMotion, setReducedMotion] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const activePaletteKeyRef = useRef(`fallback:${cacheKey}`);
  const layerSequenceRef = useRef(0);
  const animationFramesRef = useRef<Set<number>>(new Set());
  const cleanupTimerRef = useRef<number | undefined>(undefined);
  const audioAnimationFrameRef = useRef<number | undefined>(undefined);
  const pendingAudioFrameRef = useRef<AudioFrame>({});
  const resolvedQuality = quality === "auto" ? automaticQuality : quality;

  useEffect(() => {
    const animationFrames = animationFramesRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      animationFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      animationFrames.clear();
      if (cleanupTimerRef.current !== undefined) {
        window.clearTimeout(cleanupTimerRef.current);
      }
      if (audioAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(audioAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAutomaticQuality(resolveAutomaticQuality());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resetEnergy = () => {
      root.style.setProperty("--ambient-layer-scale", "1");
      root.style.setProperty("--ambient-overlay-opacity", "1");
    };
    if (reducedMotion || resolvedQuality === "low") {
      resetEnergy();
      return;
    }
    const updateEnergy = (event: Event) => {
      pendingAudioFrameRef.current = (event as CustomEvent<AudioFrame>).detail ?? {};
      if (audioAnimationFrameRef.current !== undefined) return;
      audioAnimationFrameRef.current = window.requestAnimationFrame(() => {
        audioAnimationFrameRef.current = undefined;
        const frame = pendingAudioFrameRef.current;
        const energy = clamp(frame.level ?? 0, 0, 1);
        const bass = clamp(frame.bands?.[0] ?? 0, 0, 1);
        root.style.setProperty("--ambient-layer-scale", (1 + bass * 0.018).toFixed(4));
        root.style.setProperty("--ambient-overlay-opacity", (1 - energy * 0.055).toFixed(4));
      });
    };
    window.addEventListener("dmplayer:audio-frame", updateEnergy);
    return () => {
      window.removeEventListener("dmplayer:audio-frame", updateEnergy);
      if (audioAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(audioAnimationFrameRef.current);
        audioAnimationFrameRef.current = undefined;
      }
      resetEnergy();
    };
  }, [reducedMotion, resolvedQuality]);

  useEffect(() => {
    let effectActive = true;
    const requestedKey = artwork ? cacheKey : `fallback:${cacheKey}`;
    const paletteRequest = artwork
      ? getCachedPalette(artwork, cacheKey)
      : Promise.resolve(fallbackPalette(cacheKey));

    paletteRequest.then((palette) => {
      if (!effectActive || !mountedRef.current || activePaletteKeyRef.current === requestedKey) return;
      activePaletteKeyRef.current = requestedKey;

      animationFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
      animationFramesRef.current.clear();
      if (cleanupTimerRef.current !== undefined) {
        window.clearTimeout(cleanupTimerRef.current);
      }

      const newLayerId = ++layerSequenceRef.current;
      setLayers((current) => [
        ...current.map((layer) => ({ ...layer, visible: false })),
        {
          id: newLayerId,
          cacheKey: requestedKey,
          palette,
          visible: false,
        },
      ].slice(-3));

      const firstFrame = window.requestAnimationFrame(() => {
        animationFramesRef.current.delete(firstFrame);
        const secondFrame = window.requestAnimationFrame(() => {
          animationFramesRef.current.delete(secondFrame);
          if (!mountedRef.current) return;
          setLayers((current) => current.map((layer) => (
            layer.id === newLayerId
              ? { ...layer, visible: true }
              : { ...layer, visible: false }
          )));
        });
        animationFramesRef.current.add(secondFrame);
      });
      animationFramesRef.current.add(firstFrame);

      cleanupTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setLayers((current) => current.filter((layer) => layer.id === newLayerId));
        cleanupTimerRef.current = undefined;
      }, duration + 180);
    });

    return () => {
      effectActive = false;
    };
  }, [artwork, cacheKey, duration]);

  const rootStyle = {
    "--ambient-palette-transition-duration": `${duration}ms`,
    "--ambient-layer-scale": 1,
    "--ambient-overlay-opacity": 1,
    "--ambient-noise-opacity": resolvedQuality === "low" ? 0.014 : 0.024,
    "--ambient-blob-count": resolvedQuality === "low" ? 3 : 5,
    "--ambient-blob-1-duration": "37s",
    "--ambient-blob-2-duration": "43s",
    "--ambient-blob-3-duration": "51s",
    "--ambient-blob-4-duration": "61s",
    "--ambient-blob-5-duration": "47s",
  } as AmbientCssProperties;

  return (
    <div
      className={`music-player-background animated-album-background ${className}`.trim()}
      ref={rootRef}
      data-quality={resolvedQuality}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={rootStyle}
      aria-hidden="true"
    >
      {layers.map((layer) => (
        <div
          className={`ambient-palette-layer ${layer.visible ? "is-active" : "is-outgoing"}`}
          key={layer.id}
          style={paletteStyle(layer.palette, layer.visible, duration)}
        >
          <div className="base-background ambient-base-background" />
          <div className="ambient-blob ambient-blob-1" />
          <div className="ambient-blob ambient-blob-2" />
          <div className="ambient-blob ambient-blob-3" />
          <div className="ambient-blob ambient-blob-4" />
          <div className="ambient-blob ambient-blob-5" />
        </div>
      ))}
      <div className="dark-overlay ambient-dark-overlay" />
      <div className="noise-overlay ambient-noise-overlay" />
    </div>
  );
}
