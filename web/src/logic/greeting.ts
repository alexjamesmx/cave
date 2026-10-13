import { localDateTime } from "../../../shared/dates.ts";

/** "Good morning, Alex" by the hour in the settings timezone; no name, no comma. */
export function greeting(at: Date, timeZone: string | undefined, name: unknown): string {
  const hour = Number(localDateTime(at, timeZone).slice(11, 13));
  const part =
    hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "evening";
  const who = typeof name === "string" ? name.trim() : "";
  return who ? `Good ${part}, ${who}` : `Good ${part}`;
}
