export const FIELD_TYPES = [
  "text",
  "number",
  "money",
  "date",
  "select",
  "checkbox",
  "url",
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
] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export interface SelectOption {
  value: string;
  icon: string;
  color: string;
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
}

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
