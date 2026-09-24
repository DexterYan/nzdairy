// Shared display formatting for the comparison sections.

export const nzDate = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Human labels for sentences; unknown bases keep their stored id.
export const BASIS_LABELS: Record<string, string> = {
  "bid-offer-midpoint": "bid/offer midpoint",
  "last-trade": "last trade",
  "prior-settlement": "prior settlement",
  announcement: "announcement",
};

export function basisLabel(basis: string): string {
  return BASIS_LABELS[basis] ?? basis;
}
