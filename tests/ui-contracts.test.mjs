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

test("desktop sidebar collapses to an accessible persistent navigation rail", async () => {
  const [player, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /const \[sidebarCollapsed,\s*setSidebarCollapsed\]\s*=\s*useState\(false\)/);
  assert.match(player, /localStorage\.getItem\("dmplayer-sidebar-collapsed"\)/);
  assert.match(player, /localStorage\.setItem\("dmplayer-sidebar-collapsed"/);
  assert.match(player, /className=\{`app-shell \$\{sidebarCollapsed \? "sidebar-collapsed" : ""\}`\}/);
  assert.match(player, /className="sidebar-toggle"/);
  assert.match(player, /aria-label=\{sidebarCollapsed \? "サイドバーを開く" : "サイドバーを収納"\}/);
  assert.match(player, /aria-expanded=\{!sidebarCollapsed\}/);
  assert.match(player, /className="sidebar-label"/);

  assert.match(css, /\.app-shell\.sidebar-collapsed\{padding-left:76px\}/);
  assert.match(css, /\.sidebar-collapsed \.sidebar\{width:76px/);
  assert.match(css, /\.sidebar-collapsed \.sidebar-library\{display:none\}/);
  assert.match(css, /\.sidebar-collapsed \.now-playing\{left:76px\}/);
  assert.match(css, /\.sidebar>\.sidebar-toggle\{[\s\S]*?top:50%;[\s\S]*?border-radius:0 12px 12px 0/);
});

test("tablet player uses an accessible icon-only expand control", async () => {
  const [tablet, visuals, css] = await Promise.all([
    source("../app/components/TabletPlayer.tsx"),
    source("../app/components/Visuals.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(tablet, /className="ipad-expand"[\s\S]*?aria-label="再生画面を拡大"[\s\S]*?<UiIcon name="expand"\s*\/>/);
  assert.doesNotMatch(tablet, />拡大<\/button>/);
  assert.match(visuals, /\|\s*"expand"/);
  assert.match(visuals, /name === "expand"/);
  assert.match(css, /\.ipad-player>header>\.ipad-expand\{width:36px/);
});

test("brand artwork is reserved for the app shell instead of repeated page decoration", async () => {
  const [player, tablet, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/components/TabletPlayer.tsx"),
    source("../app/globals.css"),
  ]);

  assert.equal((player.match(/<BrandMark/g) ?? []).length, 2);
  assert.doesNotMatch(tablet, /BrandMark/);
  assert.match(player, /className="empty-library-glyph"[\s\S]*?<UiIcon name="artwork"\s*\/>/);
  assert.match(player, /className="content-header library-topbar header-actions-only"/);
  assert.match(css, /\.content-header\.header-actions-only\{justify-content:flex-end\}/);
  assert.match(css, /\.empty-library-glyph\{/);
});

test("playback utilities provide speed, sleep timer, and sortable library views", async () => {
  const [player, engine, visuals, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/components/PlayerEngine.tsx"),
    source("../app/components/Visuals.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /type TrackSort = "default" \| "title" \| "artist" \| "album"/);
  assert.match(player, /function sortTracks\(/);
  assert.match(player, /className="track-sort"[\s\S]*?aria-label="曲の並び順"/);
  assert.match(player, /\["default", "既定"\][\s\S]*?\["title", "曲名"\][\s\S]*?\["artist", "アーティスト"\][\s\S]*?\["album", "アルバム"\]/);
  assert.match(player, /function PlaybackTools\(/);
  assert.match(player, /dmplayer-playback-rate/);
  assert.match(player, /\[15,\s*30,\s*60\]/);
  assert.match(player, /曲の終了/);
  assert.match(player, /sleepTimer\.mode === "track"/);
  assert.match(player, /<PlayerEngine audioRef=\{audioRef\} playbackRate=\{playbackRate\} stopAfterTrack=\{sleepTimer\.mode === "track"\}/);

  assert.match(engine, /playbackRate\?: number/);
  assert.match(engine, /audioRef\.current\.playbackRate = playbackRate/);
  assert.match(engine, /if \(stopAfterTrack\)[\s\S]*?setPlaying\(false\)[\s\S]*?onStopAfterTrack\?\.\(\)/);
  assert.match(visuals, /name === "timer"/);

  assert.match(css, /\.playback-tools\{/);
  assert.match(css, /\.playback-rate-options/);
  assert.match(css, /\.sleep-options/);
  assert.match(css, /\.track-sort\{/);
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

test("device and appearance settings persist and control real player behavior", async () => {
  const [player, engine, favorite, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/components/PlayerEngine.tsx"),
    source("../app/components/FavoriteButton.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /function DevicePreferences\(\{/);
  assert.match(player, /function AppearancePreferences\(\{/);
  assert.match(player, /画面をスリープさせない/);
  assert.match(player, /触覚フィードバック/);
  assert.match(player, /背景エフェクト/);
  assert.match(player, /dmplayer-skip-seconds/);
  assert.match(player, /dmplayer-ambient-quality/);
  assert.match(player, /dmplayer-keep-awake/);
  assert.match(player, /dmplayer-haptics/);
  assert.match(player, /wakeLock\.request\("screen"\)/);
  assert.match(player, /quality=\{backgroundQuality\}/);
  assert.match(engine, /currentTime \+= skipSeconds/);
  assert.match(engine, /currentTime -= skipSeconds/);
  assert.match(favorite, /dmplayer-haptics/);
  assert.match(css, /\.preference-card\{/);
  assert.match(css, /\.preference-segmented button\.active\{/);
  assert.match(css, /\.preference-toggle:active\{/);
});

test("phone full player stays inside Android visual viewport without retaining outer scroll", async () => {
  const [player, visuals, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/components/Visuals.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /const viewport = window\.visualViewport/);
  assert.match(player, /--player-viewport-height/);
  assert.match(player, /viewport\?\.addEventListener\("resize", syncViewport\)/);
  assert.match(player, /nowScrollRef\.current\?\.scrollTo\(\{ top: 0 \}\)/);
  assert.match(player, /\[playerMode, track\?\.id\]/);
  assert.match(visuals, /image\.decode\(\)/);
  assert.match(visuals, /decodedArtworkUrl === artworkUrl/);
  assert.match(css, /\.art\.has-artwork\.image-ready img\{opacity:1\}/);
  assert.match(css, /@media \(orientation:portrait\) and \(max-width:540px\)\{/);
  assert.match(css, /height:var\(--player-viewport-height,100dvh\)/);
  assert.match(css, /grid-template-rows:minmax\(0,1fr\) auto auto auto auto auto/);
  assert.match(css, /\.now-playing \.now-scroll\.mode-player,[\s\S]*?overflow:hidden/);
  assert.match(css, /calc\(var\(--player-viewport-height,100dvh\) - 330px\)/);
});

test("full player switches artwork, lyrics, and queue inside one stable animated stage", async () => {
  const [player, css] = await Promise.all([
    source("../app/PlayerApp.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(player, /type NowPlayingMode = "player" \| "lyrics" \| "queue"/);
  assert.match(player, /className=\{`now-playing mode-\$\{playerMode\}/);
  assert.match(player, /<TrackAmbientBackground track=\{track\} quality=\{backgroundQuality\}\s*\/><header[\s\S]*?<div ref=\{nowScrollRef\} className=\{`now-scroll mode-\$\{playerMode\}`\}>/);
  assert.match(player, /<div className="now-stage" data-mode=\{playerMode\}>/);
  assert.match(player, /id="now-stage-player"[\s\S]*?id="now-stage-lyrics"[\s\S]*?id="now-stage-queue"/);
  assert.doesNotMatch(player, /\{lyricsOpen && <LyricsPanel/);
  assert.doesNotMatch(player, /\{queueOpen && <section className="queue-panel"/);
  assert.match(player, /className="now-tabs now-mode-dock"[\s\S]*?setPlayerMode\("player"\)[\s\S]*?setPlayerMode\("lyrics"\)[\s\S]*?setPlayerMode\("queue"\)/);
  assert.match(player, /aria-controls="now-stage-player"/);
  assert.match(player, /aria-controls="now-stage-lyrics"/);
  assert.match(player, /aria-controls="now-stage-queue"/);
  assert.match(player, /aria-label="再生"\s+aria-pressed=\{playerMode === "player"\}/);
  assert.match(player, /aria-label="歌詞"\s+aria-pressed=\{playerMode === "lyrics"\}/);
  assert.match(player, /aria-label="次に再生"\s+aria-pressed=\{playerMode === "queue"\}/);

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
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:599px\) and \(max-width:1099px\)\{[\s\S]*?\.now-playing>header\{[\s\S]*?height:calc\(58px \+ var\(--safe-top\)\)[\s\S]*?\.now-stage\{[\s\S]*?height:min\(390px,calc\(100dvh - 74px - var\(--safe-top\) - var\(--safe-bottom\)\)\)[\s\S]*?\.now-stage-player \.jukebox-artwork\{[\s\S]*?width:min\(100%,calc\(100dvh - 104px - var\(--safe-top\) - var\(--safe-bottom\)\)\)[\s\S]*?\.now-stage-lyrics \.lyrics-leading-space\{height:6%\}/);
  assert.match(css, /@media \(orientation:portrait\) and \(max-width:390px\) and \(max-height:700px\)\{[\s\S]*?\.now-stage\{height:clamp\(218px,36dvh,240px\)\}[\s\S]*?\.now-stage-player \.jukebox-artwork\{width:min\(64vw,240px\)\}[\s\S]*?\.now-playing \.now-scroll\.mode-player \.volume-row,[\s\S]*?\{display:none\}/);
  assert.match(css, /@media \(orientation:portrait\) and \(max-width:340px\) and \(max-height:620px\)\{[\s\S]*?\.now-stage\{height:clamp\(176px,33dvh,194px\)\}[\s\S]*?\.now-mode-dock button>span\{display:none\}/);

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
