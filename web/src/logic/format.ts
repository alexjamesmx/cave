const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** `$16,842`, `$12.50`; the sign is the caller's, so `−$` and `+$` read the same everywhere. */
export const formatMoney = (amount: number) => money.format(Math.abs(amount));

export const signedMoney = (amount: number, direction: "income" | "expense") =>
  `${direction === "income" ? "+" : "−"}${formatMoney(amount)}`;

export const percent = (part: number, whole: number) =>
  whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
