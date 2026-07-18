"use client";

import { usePlayerStore } from "../store";

type SidebarLibraryProps = {
  onOpenRecent: () => void;
  onOpenPlaylist: (playlistId: string) => void;
};

export function SidebarLibrary({ onOpenRecent, onOpenPlaylist }: SidebarLibraryProps) {
  const { tracks, playlists, createPlaylist } = usePlayerStore();
  const favorites = tracks.filter((track) => track.favorite);
  const recent = [...tracks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);

  return (
    <section className="sidebar-library" aria-label="サイドバーのプレイリスト">
      <div className="sidebar-quick">
        <span>クイックアクセス</span>
        <button onClick={onOpenRecent}>
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
        <button className="smart-playlist" onClick={() => onOpenPlaylist("favorites")}>
          <i>♥</i><span><strong>お気に入りの曲</strong><small>自動更新 · {favorites.length}曲</small></span>
        </button>
        {playlists.length ? playlists.map((playlist, index) => (
          <button
            key={playlist.id}
            onClick={() => onOpenPlaylist(playlist.id)}
          >
            <i style={{ "--playlist-hue": `${(index * 47 + 325) % 360}` } as React.CSSProperties}>♫</i>
            <span><strong>{playlist.name}</strong><small>{playlist.trackIds.length}曲</small></span>
          </button>
        )) : <p>作成したプレイリストが<br />ここに表示されます</p>}
      </div>
      <footer><span>{tracks.length}曲</span><span>{playlists.length + 1}プレイリスト</span></footer>
    </section>
  );
}
