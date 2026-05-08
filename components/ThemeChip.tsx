import clsx from "clsx";
import type { Theme } from "@/lib/types";

interface ThemeChipProps {
  theme: Theme;
  selected?: boolean;
  onClick: (theme: Theme) => void;
}

export default function ThemeChip({
  theme,
  selected = false,
  onClick,
}: ThemeChipProps) {
  return (
    <button
      onClick={() => onClick(theme)}
      className={clsx(
        "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
        selected
          ? "bg-blue-600 text-white"
          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      )}
    >
      {theme.title}
    </button>
  );
}
