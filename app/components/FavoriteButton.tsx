"use client";

import { useState } from "react";
import { UiIcon } from "./Visuals";

type FavoriteButtonProps = {
  favorite: boolean;
  onToggle: () => void;
  className?: string;
  label?: string;
};

export function FavoriteButton({
  favorite,
  onToggle,
  className = "",
  label,
}: FavoriteButtonProps) {
  const [popKey, setPopKey] = useState(0);
  const classes = [
    "favorite-button",
    favorite ? "is-favorite" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-label={label ?? (favorite ? "お気に入りから削除" : "お気に入りに追加")}
      aria-pressed={favorite}
      onClick={() => {
        setPopKey((key) => key + 1);
        if (localStorage.getItem("dmplayer-haptics") !== "false") navigator.vibrate?.(10);
        onToggle();
      }}
    >
      <span
        key={popKey}
        className={`favorite-button-icon ${popKey ? "favorite-pop" : ""}`}
        aria-hidden="true"
      >
        <UiIcon name="heart" />
      </span>
    </button>
  );
}
