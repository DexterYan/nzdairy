// Shared builders for the history-dependent suites (changes, history, and the
// app-level page/panel tests): one source of truth for the HistoryEntry shape.
import {
  canonicalIdentity,
  type EffectiveTime,
  type HistoryEntry,
  type ObservationBasis,
  type SeasonHistory,
} from "../../lib/history";
import type { FuturesBlock } from "../../lib/snapshot";

export function entry(options: {
  series?: "official-forecast" | "mkp-futures";
  provider?: string;
  market?: string;
  basis?: ObservationBasis;
  effective: EffectiveTime;
  value: number;
  low?: number | null;
  high?: number | null;
  firstSeenAt?: string;
  earlierValue?: number;
}): HistoryEntry {
  const series = options.series ?? "mkp-futures";
  const provider = options.provider ?? (series === "mkp-futures" ? "nzx" : "fonterra");
  const market = options.market ?? (series === "mkp-futures" ? "MKPU27" : "2026/27");
  const basis = options.basis ?? (series === "mkp-futures" ? "last-trade" : "announcement");
  const payload = {
    value: options.value,
    low: options.low ?? null,
    high: options.high ?? null,
    currency: "NZD" as const,
    unit: "NZD/kgMS" as const,
  };
  const revision = {
    payload,
    publishedAt: null,
    firstSeenAt: options.firstSeenAt ?? "2026-09-01T06:00:00Z",
    parserVersion: "test",
  };
  return {
    identity: canonicalIdentity({ series, provider, market, basis, effective: options.effective }),
    series,
    provider,
    market,
    basis,
    effective: options.effective,
    revisions:
      options.earlierValue === undefined
        ? [revision]
        : [{ ...revision, payload: { ...payload, value: options.earlierValue } }, revision],
  };
}

export const fut = (on: string, value: number, extra: Partial<Parameters<typeof entry>[0]> = {}) =>
  entry({ effective: { kind: "date", on }, value, ...extra });

export const ann = (on: string, value: number, extra: Partial<Parameters<typeof entry>[0]> = {}) =>
  entry({ series: "official-forecast", effective: { kind: "date", on }, value, ...extra });

export function historyOf(entries: HistoryEntry[], season = "2026/27"): SeasonHistory {
  return { schemaVersion: 1, season, materialisedAt: "2026-09-24T06:00:00Z", entries };
}

export function futuresBlock(
  overrides: Partial<Extract<FuturesBlock, { status: "ok" }>> = {},
): FuturesBlock {
  return {
    status: "ok",
    contractCode: "MKPU27",
    season: "2026/27",
    expiry: "2027-09-30",
    basis: "last-trade",
    price: 9.7,
    bid: null,
    offer: null,
    last: 9.7,
    priorSettlement: null,
    tradedVolume: null,
    bidVolume: null,
    offerVolume: null,
    openInterest: null,
    stale: false,
    currency: "NZD",
    unit: "NZD/kgMS",
    quotedAt: "2026-09-24T05:00:00Z",
    tradedAt: "2026-09-24",
    retrievedAt: "2026-09-24T06:00:00Z",
    sourceUrl: "https://www.nzx.com/",
    ...overrides,
  };
}
