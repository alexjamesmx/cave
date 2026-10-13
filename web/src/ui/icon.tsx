import { icons, type LucideProps } from "lucide-react";

type IconName = keyof typeof icons;

// Docs store Lucide's kebab-case names; the bundled map is keyed in PascalCase.
const toKey = (name: string) =>
  name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") as IconName;

export const hasIcon = (name: string): boolean => Object.hasOwn(icons, toKey(name));

/** A Lucide icon by its kebab-case name; unknown names show a question mark, never crash. */
export function Icon({ name, ...props }: LucideProps & { name: string }) {
  const Glyph = hasIcon(name) ? icons[toKey(name)] : icons.CircleQuestionMark;
  return <Glyph strokeWidth={1.9} aria-hidden="true" {...props} />;
}
