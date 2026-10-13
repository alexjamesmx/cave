const whole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** `$16,842`, `$12.50`; the sign is the caller's, so `−$` and `+$` read the same everywhere. */
export function formatMoney(amount: number): string {
  const abs = Math.abs(amount);
  // Rounding to cents first keeps float noise (0.1 + 0.2) from forcing decimals.
  const rounded = Math.round(abs * 100) / 100;
  return (Number.isInteger(rounded) ? whole : cents).format(rounded);
}

export const signedMoney = (amount: number, direction: "income" | "expense") =>
  `${direction === "income" ? "+" : "−"}${formatMoney(amount)}`;

export const percent = (part: number, whole: number) =>
  whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
