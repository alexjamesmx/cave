/**
 * A view of "now" (today's diary, this month's calendar) shows the current value until the
 * owner picks another; picking the current value again goes back to following it. Seeding
 * state from today once froze the day when the app stayed open past midnight.
 */
export const shown = (picked: string | undefined, current: string) => picked ?? current;

export const pick = (value: string, current: string): string | undefined =>
  value === current ? undefined : value;
