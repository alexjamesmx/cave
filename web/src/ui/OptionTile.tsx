import type { SelectOption } from "../../../shared/schema.ts";
import { Icon } from "./icon.tsx";

/**
 * An option's emoji on its tile, drawn from `data-emoji` so the emoji never joins a name; an
 * option without one shows its icon. The tile's tint comes from the caller's `--c`.
 */
export function OptionTile({ option }: { option: Pick<SelectOption, "emoji" | "icon"> }) {
  return option.emoji ? (
    <span className="emoji-tile" aria-hidden="true" data-emoji={option.emoji} />
  ) : (
    <span className="emoji-tile" aria-hidden="true">
      <Icon name={option.icon} size={16} />
    </span>
  );
}

/** A tile for a mark that is no option: ❔ for To review, ⋯ for More. */
export function MarkTile({ mark }: { mark: string }) {
  return <span className="emoji-tile" aria-hidden="true" data-emoji={mark} />;
}
