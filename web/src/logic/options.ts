import { PALETTE } from "../../../shared/palette.ts";
import type { SelectOption } from "../../../shared/schema.ts";

/** Swatches that keep their contrast on the light and the dark surface. */
export const SWATCHES: string[] = Object.values(PALETTE);

export const isHexColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

/** A new option, or why it can't be added; values are fixed once added, so they are trimmed. */
export function addOption(
  options: readonly SelectOption[],
  raw: string,
): { options: SelectOption[] } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: "Type a name first" };
  const existing = options.find((o) => o.value.toLowerCase() === value.toLowerCase());
  if (existing)
    return {
      error: existing.archived
        ? `“${existing.value}” is archived; restore it instead`
        : `“${existing.value}” is already in the list`,
    };
  return { options: [...options, { value, icon: "tag", color: PALETTE.grey }] };
}

/** Moves the option at `from` to `to`; positions are kept in the stored order. */
export function moveOption(
  options: readonly SelectOption[],
  from: number,
  to: number,
): SelectOption[] {
  const next = [...options];
  const [moved] = next.splice(from, 1);
  if (!moved) return [...options];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/** Archives or restores one option; items that hold it keep it either way. */
export function setArchived(
  options: readonly SelectOption[],
  value: string,
  archived: boolean,
): SelectOption[] {
  return options.map((o) => {
    if (o.value !== value) return o;
    if (archived) return { ...o, archived: true };
    const { archived: _, ...rest } = o;
    return rest;
  });
}

/** Changes one option's look; an empty or undefined value removes that key. */
export function patchOption(
  options: readonly SelectOption[],
  value: string,
  patch: { [K in keyof SelectOption]?: SelectOption[K] | undefined },
): SelectOption[] {
  return options.map((o) => {
    if (o.value !== value) return o;
    const next = { ...o, ...patch } as Record<string, unknown>;
    for (const key of Object.keys(next))
      if (next[key] === undefined || next[key] === "") delete next[key];
    return {
      ...next,
      value: o.value,
      icon: (next.icon as string) ?? o.icon,
      color: (next.color as string) ?? o.color,
    } as SelectOption;
  });
}
