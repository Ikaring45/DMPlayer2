import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("sidebar quick access opens detail views without starting playback", async () => {
  const sidebar = await source("../app/components/SidebarLibrary.tsx");

  assert.match(sidebar, /onOpenRecent:\s*\(\)\s*=>\s*void/);
  assert.match(sidebar, /onOpenPlaylist:\s*\(playlistId:\s*string\)\s*=>\s*void/);
  assert.match(sidebar, /onClick=\{onOpenRecent\}/);
  assert.match(sidebar, /onClick=\{\(\)\s*=>\s*onOpenPlaylist\("favorites"\)\}/);
  assert.match(sidebar, /onClick=\{\(\)\s*=>\s*onOpenPlaylist\(playlist\.id\)\}/);
  assert.doesNotMatch(sidebar, /\bplayTrack\b|\bsetPlaying\b|\bplayCollection\b/);
});

test("full player artist and favorite controls retain their interactive routes", async () => {
  const [player, favorite, tablet] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/components/FavoriteButton.tsx"),
    source("../app/components/TabletPlayer.tsx"),
  ]);

  assert.match(player, /type LibraryView\s*=\s*[^;]*"artist-detail"/);
  assert.match(player, /className="artist-link"\s+onClick=\{\(\)\s*=>\s*onOpenArtist\(/);
  assert.match(player, /setView\("artist-detail"\)/);
  assert.match(player, /onOpenArtist=\{\(artist\)\s*=>\s*\{\s*openArtistDetail\(artist\)/);

  assert.match(favorite, /aria-pressed=\{favorite\}/);
  assert.match(favorite, /setPopKey\(\(key\)\s*=>\s*key\s*\+\s*1\)/);
  assert.match(favorite, /favorite-pop/);
  assert.match(favorite, /<UiIcon name="heart"\s*\/>/);
  assert.match(player, /<FavoriteButton\s+favorite=\{track\.favorite\}/);
  assert.match(tablet, /<FavoriteButton/);
});

test("artist detail is a dedicated responsive page with playback, albums, and library context", async () => {
  const [player, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /function ArtistDetail\(\{/);
  assert.match(player, /className="artist-hero"/);
  assert.match(player, /className="artist-popular"/);
  assert.match(player, /className="artist-profile-card"/);
  assert.match(player, /className="artist-album-grid"/);
  assert.match(player, /onOpenAlbum\(album\.name\)/);
  assert.match(player, /return <ArtistDetail artist=\{selectedArtist\}/);
  assert.doesNotMatch(player, /<CollectionDetail kind="artist"/);

  assert.match(css, /\.artist-back\{[\s\S]*?white-space:nowrap/);
  assert.match(css, /\.artist-hero\{[\s\S]*?isolation:isolate/);
  assert.match(css, /\.artist-content-grid\{display:grid/);
  assert.match(css, /@media \(min-width:1280px\)\{[\s\S]*?\.artist-content-grid\{grid-template-columns:/);
  assert.match(css, /\.artist-album-grid\{[\s\S]*?scroll-snap-type:x proximity/);
});

test("album ambient background remains artwork-derived, cached, layered, and motion-aware", async () => {
  const [component, player, css] = await Promise.all([
    source("../app/components/AnimatedAlbumBackground.tsx"),
    source("../app/PlayerApp.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /<AnimatedAlbumBackground/);
  assert.match(player, /artwork=\{artworkUrl\}/);
  assert.match(component, /const SAMPLE_SIZE = 48/);
  assert.match(component, /const paletteCache = new Map<string,\s*Promise<AlbumAmbientPalette>>\(\)/);
  assert.match(component, /document\.createElement\("canvas"\)/);
  assert.match(component, /getCachedPalette\(artwork,\s*cacheKey\)/);
  assert.match(component, /clamp\(transitionDurationMs,\s*MIN_TRANSITION_MS,\s*MAX_TRANSITION_MS\)/);
  assert.match(component, /matchMedia\("\(prefers-reduced-motion:\s*reduce\)"\)/);
  assert.match(component, /data-quality=\{resolvedQuality\}/);
  assert.match(component, /data-reduced-motion=\{reducedMotion\s*\?\s*"true"\s*:\s*"false"\}/);

  for (let index = 1; index <= 5; index += 1) {
    assert.match(component, new RegExp(`ambient-blob ambient-blob-${index}`));
  }

  assert.match(css, /\.ambient-blob-1\{[^}]*var\(--ambient-blob-1-duration\)/);
  assert.match(css, /\.ambient-blob-2\{[^}]*var\(--ambient-blob-2-duration\)/);
  assert.match(css, /\.ambient-blob-3\{[^}]*var\(--ambient-blob-3-duration\)/);
  assert.match(css, /\.animated-album-background\[data-quality="low"\][\s\S]*?\.ambient-blob-5\{display:none\}/);
  assert.match(css, /\.animated-album-background\[data-reduced-motion="true"\]\s+\.ambient-blob\{animation:none!important\}/);
});

test("full player switches artwork, lyrics, and queue inside one stable animated stage", async () => {
  const [player, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /type NowPlayingMode = "player" \| "lyrics" \| "queue"/);
  assert.match(player, /className=\{`now-playing mode-\$\{playerMode\}/);
  assert.match(player, /<TrackAmbientBackground track=\{track\}\s*\/><header[\s\S]*?<div className=\{`now-scroll mode-\$\{playerMode\}`\}>/);
  assert.match(player, /<div className="now-stage" data-mode=\{playerMode\}>/);
  assert.match(player, /id="now-stage-player"[\s\S]*?id="now-stage-lyrics"[\s\S]*?id="now-stage-queue"/);
  assert.doesNotMatch(player, /\{lyricsOpen && <LyricsPanel/);
  assert.doesNotMatch(player, /\{queueOpen && <section className="queue-panel"/);
  assert.match(player, /className="now-tabs now-mode-dock"[\s\S]*?setPlayerMode\("player"\)[\s\S]*?setPlayerMode\("lyrics"\)[\s\S]*?setPlayerMode\("queue"\)/);
  assert.match(player, /aria-controls="now-stage-player"/);
  assert.match(player, /aria-controls="now-stage-lyrics"/);
  assert.match(player, /aria-controls="now-stage-queue"/);

  assert.match(css, /\.now-playing\{[\s\S]*?overflow:hidden!important/);
  assert.match(css, /\.now-scroll\{[\s\S]*?position:absolute[\s\S]*?overflow-y:auto/);
  assert.match(css, /\.now-stage\{[\s\S]*?position:relative;[\s\S]*?contain:layout paint/);
  assert.match(css, /\.now-stage-view\{[\s\S]*?position:absolute;[\s\S]*?visibility:hidden;[\s\S]*?transition:/);
  assert.match(css, /\.now-stage-view\.is-active\{[\s\S]*?visibility:visible;[\s\S]*?pointer-events:auto;[\s\S]*?opacity:1/);
  assert.match(css, /\.now-stage-lyrics \.lyrics-scroll\{[\s\S]*?overflow-y:auto;[\s\S]*?contain:layout paint/);
  assert.match(css, /\.now-stage-queue \.queue-panel\{[\s\S]*?display:grid;[\s\S]*?grid-template-rows:auto minmax\(0,1fr\)/);
  assert.match(css, /\.now-stage-queue \.queue-list\{[\s\S]*?overflow-y:auto;[\s\S]*?overscroll-behavior:contain/);
  assert.match(css, /\.now-mode-dock\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(min-width:760px\) and \(max-width:1099px\) and \(min-height:600px\) and \(orientation:landscape\)\{[\s\S]*?\.now-playing \.now-scroll\.mode-lyrics \.now-info,[\s\S]*?\{grid-column:2;grid-row:1\}[\s\S]*?\.now-playing \.now-scroll\.mode-lyrics \.seek,[\s\S]*?\{grid-column:2;grid-row:2\}[\s\S]*?\.now-playing \.now-scroll\.mode-lyrics \.play-controls,[\s\S]*?\{grid-column:2;grid-row:3\}[\s\S]*?\.now-playing \.now-scroll\.mode-lyrics \.volume-row,[\s\S]*?\{grid-column:2;grid-row:4\}[\s\S]*?\.now-playing \.now-scroll\.mode-lyrics \.now-tabs,[\s\S]*?\{grid-column:2;grid-row:5\}/);
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:599px\) and \(max-width:1099px\)\{[\s\S]*?\.now-playing>header\{[\s\S]*?height:calc\(58px \+ var\(--safe-top\)\)[\s\S]*?\.now-stage-player \.jukebox-artwork\{[\s\S]*?width:min\(100%,calc\(100dvh - 104px - var\(--safe-top\) - var\(--safe-bottom\)\)\)[\s\S]*?\.now-stage-lyrics \.lyrics-leading-space\{height:6%\}/);

  assert.match(player, /className="queue-actions"[\s\S]*?<UiIcon name="up"\s*\/>[\s\S]*?<UiIcon name="down"\s*\/>[\s\S]*?<UiIcon name="close"\s*\/>/);
  assert.match(player, /const visibleQueue = store\.queue[\s\S]*?\.slice\(currentQueueIndex >= 0 \? currentQueueIndex : 0\)/);
  assert.match(player, /disabled=\{upcomingCount === 0\}/);
});

test("artwork rims stay removed and every installed app icon is PNG", async () => {
  const [css, manifestText, layout, serviceWorker] = await Promise.all([
    source("../app/globals.css"),
    source("../public/manifest.webmanifest"),
    source("../app/layout.tsx"),
    source("../public/sw.js"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.match(css, /\.art\.has-artwork\{[^}]*border:0!important;[^}]*outline:0!important/);
  assert.match(css, /\.art\.has-artwork img\{[\s\S]*?inset:-1px;[\s\S]*?width:calc\(100% \+ 2px\);[\s\S]*?height:calc\(100% \+ 2px\)/);
  assert.match(css, /\.art::before,\.art::after\{display:none!important\}/);

  assert.equal(manifest.icons.length, 2);
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })),
    [
      { src: "./icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "./icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  );
  assert.doesNotMatch(manifestText, /\.svg\b/i);
  assert.match(layout, /favicon-32\.png/);
  assert.match(layout, /icon-192\.png/);
  assert.match(layout, /icon-512\.png/);
  assert.doesNotMatch(layout, /icon\.svg/);
  assert.match(serviceWorker, /\.\/icon-192\.png/);
  assert.match(serviceWorker, /\.\/icon-512\.png/);
  assert.doesNotMatch(serviceWorker, /icon\.svg/);

  for (const path of [
    "../public/favicon-32.png",
    "../public/icon-192.png",
    "../public/icon-512.png",
    "../public/apple-touch-icon.png",
  ]) {
    const url = new URL(path, import.meta.url);
    await access(url);
    assert.ok((await stat(url)).size > 0, `${path} must not be empty`);
  }
});
