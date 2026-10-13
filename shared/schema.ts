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

// `write` is the journal's diary editor; the plan lists it as a journal view but not as a type.
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
};
