"use client";

import { usePlayerStore } from "../store";

export function SidebarLibrary() {
  const { tracks, playlists, playTrack, createPlaylist } = usePlayerStore();
  const favorites = tracks.filter((track) => track.favorite).map((track) => track.id);
  const recent = [...tracks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((track) => track.id);

  const playCollection = (ids: string[]) => {
    if (ids[0]) playTrack(ids[0], ids);
  };

  return (
    <section className="sidebar-library" aria-label="サイドバーのプレイリスト">
      <div className="sidebar-quick">
        <span>クイックアクセス</span>
        <button disabled={!favorites.length} onClick={() => playCollection(favorites)}>
          <i className="quick-favorite">♥</i><strong>お気に入り</strong><small>{favorites.length}</small>
        </button>
        <button disabled={!recent.length} onClick={() => playCollection(recent)}>
          <i className="quick-recent">◷</i><strong>最近追加</strong><small>{recent.length}</small>
        </button>
      </div>
      <div className="sidebar-playlist-heading">
        <span>プレイリスト</span>
        <button
          aria-label="プレイリストを作成"
          onClick={() => {
            const name = prompt("プレイリスト名");
            if (name?.trim()) void createPlaylist(name.trim());
          }}
        >＋</button>
      </div>
      <div className="sidebar-playlist-list">
        {playlists.length ? playlists.map((playlist, index) => (
          <button
            key={playlist.id}
            disabled={!playlist.trackIds.length}
            onClick={() => playCollection(playlist.trackIds)}
          >
            <i style={{ "--playlist-hue": `${(index * 47 + 325) % 360}` } as React.CSSProperties}>♫</i>
            <span><strong>{playlist.name}</strong><small>{playlist.trackIds.length}曲</small></span>
          </button>
        )) : <p>作成したプレイリストが<br />ここに表示されます</p>}
      </div>
      <footer><span>{tracks.length}曲</span><span>{playlists.length}プレイリスト</span></footer>
    </section>
  );
}
