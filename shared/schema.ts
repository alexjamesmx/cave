export const FIELD_TYPES = [
  "text",
  "number",
  "money",
  "date",
  "select",
  "checkbox",
  "url",
  // A structured value checked by a named schema; it merges as one unit (M7 flows).
  "json",
  // An item id in another collection (M8): a task's project, a part's parent.
  "ref",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// `write` is the journal's diary editor.
export const VIEW_TYPES = [
  "table",
  "board",
  "gallery",
  "calendar",
  "write",
  "money",
  "wealth",
  "habits",
  "progress",
  "payments",
] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

/** What a money category is for; transfers count as neither spending nor income. */
export type OptionKind = "expense" | "income" | "transfer";

export interface SelectOption {
  /** What items store; fixed once created. */
  value: string;
  icon: string;
  color: string;
  /** What the app shows instead of `value`; the owner can rename it freely. */
  label?: string;
  emoji?: string;
  kind?: OptionKind;
  /**
   * Retired by the owner: not offered and refused for a new value, still shown (greyed) on
   * items that have it, and still accepted by sync. Restoring it clears the flag.
   */
  archived?: boolean;
}

/** A select that shows another field's options instead of keeping a copy (M7c). */
export interface OptionsFrom {
  collection: string;
  field: string;
  /** Only options of these kinds (payments offer money's expense categories). */
  kinds?: OptionKind[];
}

export interface Field {
  id: string;
  name: string;
  type: FieldType;
  options?: SelectOption[];
  config?: FieldConfig;
  /** Removed by the owner. Kept so its id is never reused and its values keep their meaning. */
  archived?: boolean;
}

export interface FieldConfig {
  /**
   * Date values are ISO 8601 local time: `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm[:ss]` when
   * this is set. The `settings` doc's `timezone` says which local time.
   */
  withTime?: boolean;
  /** For `json` fields: the schema the value must pass. Only `flow` exists. */
  schema?: "flow";
  /** For `ref` fields: the collection the target lives in. */
  collection?: string;
  /** For `select` fields: take the options from this field; the field's own are ignored. */
  optionsFrom?: OptionsFrom;
}

/** Field types the owner can add from the field editor; `json` only comes from the seed. */
// A ref needs its target collection chosen; the seed sets those up, not the field editor.
export const EDITABLE_FIELD_TYPES = FIELD_TYPES.filter((t) => t !== "json" && t !== "ref");

export interface View {
  id: string;
  name: string;
  type: ViewType;
  config: Record<string, unknown>;
}

// A type alias, not an interface, so it is assignable to a doc's `data` record.
export type CollectionData = {
  name: string;
  icon: string;
  color: string;
  order: number;
  fields: Field[];
  views: View[];
  /** Kept out of navigation and the command bar; the app reaches it elsewhere (proposals). */
  hidden?: boolean;
};
