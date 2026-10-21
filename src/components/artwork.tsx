"use client";
import type { Game } from "@/lib/types";
import { safeImage } from "@/lib/model";
import { usePreferences } from "./preferences";

export function Artwork({
  game,
  className = "",
  eager = false,
}: {
  game: Game;
  className?: string;
  eager?: boolean;
}) {
  const { t } = usePreferences();
  return safeImage(game.image) ? (
    <img
      className={className}
      src={safeImage(game.image)}
      alt={t("Artwork for {name}", { name: game.name })}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
    />
  ) : null;
}
