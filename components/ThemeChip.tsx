import type { Theme } from "@/lib/types";

interface ThemeChipProps {
  theme: Theme;
  selected?: boolean;
  onClick: (theme: Theme) => void;
}

export default function ThemeChip({ theme, selected = false, onClick }: ThemeChipProps) {
  return (
    <button
      onClick={() => onClick(theme)}
      className={"chip" + (selected ? " active" : "")}
    >
      <span>{theme.title}</span>
      <span className="chip-count">{theme.sources.length}</span>
    </button>
  );
}
