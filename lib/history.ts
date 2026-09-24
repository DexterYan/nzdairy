// Season history contracts for the next release: observation identity,
// revision rules, and the season-bounded history object. The legacy v1
// snapshot is untouched; history lives in a separate companion object.

import { optionalPositiveNumber } from "./snapshot";
import type { FuturesBlock, QuoteBasis } from "./snapshot";
import type { AnnouncementRow } from "./fonterra";

// Budgets fixed by Task 14: one season of daily observations is ~730 entries;
// readers reject larger objects rather than trust them.
export const HISTORY_MAX_ENTRIES = 2_000;
export const HISTORY_MAX_REVISIONS = 50;

// The v1 futures block has no provider field; NZX is structural there.
export const FUTURES_PROVIDER = "nzx";

export type ObservationSeries = "official-forecast" | "mkp-futures";

export type ObservationBasis = QuoteBasis | "announcement";

// A date covers the whole Auckland calendar day, never midnight UTC. An
// instant is "verified" only when the provider documents its price-observation
// meaning; the scraped page's row-update time is not (Task 13a matrix).
export type EffectiveTime =
  | { kind: "instant"; at: string; verified: boolean }
  | { kind: "date"; on: string };

export interface ObservationPayload {
  value: number;
  low: number | null;
  high: number | null;
  currency: "NZD";
  unit: "NZD/kgMS";
}

export interface Observation {
  series: ObservationSeries;
  provider: string;
  // Contract code for futures (MKPU27); reporting period (season) otherwise.
  market: string;
  basis: ObservationBasis;
  effective: EffectiveTime;
  payload: ObservationPayload;
  publishedAt: string | null;
  firstSeenAt: string;
  parserVersion: string;
}

export interface ObservationRevision {
  payload: ObservationPayload;
  publishedAt: string | null;
  firstSeenAt: string;
  parserVersion: string;
}

export interface HistoryEntry {
  identity: string;
  series: ObservationSeries;
  provider: string;
  market: string;
  basis: ObservationBasis;
  effective: EffectiveTime;
  revisions: ObservationRevision[];
}

export interface SeasonHistory {
  schemaVersion: 1;
  season: string;
  materialisedAt: string;
  entries: HistoryEntry[];
}

export type MergeOutcome = "appended" | "duplicate" | "revised" | "rejected";

// Identity is (series, provider, contract/period, basis, source-effective
// time). A newer retrieval or check alone is never part of it.
export function canonicalIdentity(observation: {
  series: ObservationSeries;
  provider: string;
  market: string;
  basis: ObservationBasis;
  effective: EffectiveTime;
}): string {
  const effective =
    observation.effective.kind === "instant"
      ? `i:${observation.effective.at}`
      : `d:${observation.effective.on}`;
  return [
    observation.series,
    observation.provider,
    observation.market,
    observation.basis,
    effective,
  ].join("|");
}

function payloadEquals(
  a: ObservationPayload,
  b: ObservationPayload,
): boolean {
  return (
    a.value === b.value && a.low === b.low && a.high === b.high &&
    a.currency === b.currency && a.unit === b.unit
  );
}

// undefined = present but invalid; null = legitimately unpublished endpoint.
function validPayload(payload: unknown): payload is ObservationPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value) || candidate.value <= 0) {
    return false;
  }
  const low = optionalPositiveNumber(candidate.low);
  const high = optionalPositiveNumber(candidate.high);
  if (low === undefined || high === undefined) return false;
  if (candidate.currency !== "NZD" || candidate.unit !== "NZD/kgMS") return false;
  if (low !== null && high !== null && (low > candidate.value || candidate.value > high)) {
    return false;
  }
  return true;
}

function validEffective(effective: unknown): effective is EffectiveTime {
  if (typeof effective !== "object" || effective === null) return false;
  const candidate = effective as Record<string, unknown>;
  if (candidate.kind === "instant") {
    return typeof candidate.at === "string" && isoInstant(candidate.at) !== null &&
      typeof candidate.verified === "boolean";
  }
  if (candidate.kind === "date") {
    return typeof candidate.on === "string" && isoDate(candidate.on) !== null;
  }
  return false;
}

// A prior settlement without session identity and a midpoint quoted only by
// an undocumented row-update time cannot support historical identity; they
// stay in the v1 comparison with history unavailable.
export function historyEligible(observation: Observation): boolean {
  if (observation.effective.kind === "instant" && !observation.effective.verified) {
    return false;
  }
  return validPayload(observation.payload) && validEffective(observation.effective);
}

export function latestRevision(entry: HistoryEntry): ObservationRevision {
  return entry.revisions[entry.revisions.length - 1];
}

export function mergeObservation(
  history: SeasonHistory,
  observation: Observation,
): { history: SeasonHistory; outcome: MergeOutcome } {
  if (!historyEligible(observation)) {
    return { history, outcome: "rejected" };
  }
  const identity = canonicalIdentity(observation);
  const index = history.entries.findIndex((e) => e.identity === identity);
  const revision: ObservationRevision = {
    payload: observation.payload,
    publishedAt: observation.publishedAt,
    firstSeenAt: observation.firstSeenAt,
    parserVersion: observation.parserVersion,
  };

  if (index === -1) {
    if (history.entries.length >= HISTORY_MAX_ENTRIES) {
      return { history, outcome: "rejected" };
    }
    const entry: HistoryEntry = {
      identity,
      series: observation.series,
      provider: observation.provider,
      market: observation.market,
      basis: observation.basis,
      effective: observation.effective,
      revisions: [revision],
    };
    return {
      history: { ...history, entries: [...history.entries, entry] },
      outcome: "appended",
    };
  }

  const existing = history.entries[index];
  if (payloadEquals(latestRevision(existing).payload, observation.payload)) {
    // Identical refetch: nothing moves, not even firstSeenAt.
    return { history, outcome: "duplicate" };
  }
  if (existing.revisions.length >= HISTORY_MAX_REVISIONS) {
    return { history, outcome: "rejected" };
  }
  const entries = history.entries.map((entry, i) =>
    i === index ? { ...entry, revisions: [...entry.revisions, revision] } : entry,
  );
  return { history: { ...history, entries }, outcome: "revised" };
}

export function parseSeasonHistory(
  value: unknown,
  season: string,
): SeasonHistory | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return null;
  if (candidate.season !== season) return null;
  if (typeof candidate.materialisedAt !== "string" || isoInstant(candidate.materialisedAt) === null) {
    return null;
  }
  if (!Array.isArray(candidate.entries) || candidate.entries.length > HISTORY_MAX_ENTRIES) {
    return null;
  }

  const seenIdentities = new Set<string>();
  const entries: HistoryEntry[] = [];
  for (const raw of candidate.entries) {
    if (typeof raw !== "object" || raw === null) return null;
    const entry = raw as Record<string, unknown>;
    if (
      entry.series !== "official-forecast" && entry.series !== "mkp-futures"
    ) return null;
    if (typeof entry.provider !== "string" || entry.provider === "") return null;
    if (typeof entry.market !== "string" || entry.market === "") return null;
    const basis = entry.basis;
    if (
      basis !== "bid-offer-midpoint" && basis !== "last-trade" &&
      basis !== "prior-settlement" && basis !== "announcement"
    ) return null;
    if (!validEffective(entry.effective)) return null;
    // Unverified instants are not observations (Task 13a); the write path
    // never stores one, so a reader seeing one rejects the object.
    if (entry.effective.kind === "instant" && !entry.effective.verified) return null;

    if (!Array.isArray(entry.revisions) || entry.revisions.length === 0 ||
      entry.revisions.length > HISTORY_MAX_REVISIONS) {
      return null;
    }
    const revisions: ObservationRevision[] = [];
    for (const rawRevision of entry.revisions) {
      if (typeof rawRevision !== "object" || rawRevision === null) return null;
      const revision = rawRevision as Record<string, unknown>;
      if (!validPayload(revision.payload)) return null;
      if (typeof revision.firstSeenAt !== "string" ||
        isoInstant(revision.firstSeenAt) === null) return null;
      if (revision.publishedAt !== null &&
        (typeof revision.publishedAt !== "string" || isoInstant(revision.publishedAt) === null)) {
        return null;
      }
      if (typeof revision.parserVersion !== "string" || revision.parserVersion === "") {
        return null;
      }
      revisions.push({
        payload: revision.payload as ObservationPayload,
        publishedAt: revision.publishedAt as string | null,
        firstSeenAt: revision.firstSeenAt,
        parserVersion: revision.parserVersion,
      });
    }

    const parsed: HistoryEntry = {
      identity: canonicalIdentity({
        series: entry.series,
        provider: entry.provider,
        market: entry.market,
        basis,
        effective: entry.effective,
      }),
      series: entry.series,
      provider: entry.provider,
      market: entry.market,
      basis,
      effective: entry.effective,
      revisions,
    };
    if (typeof entry.identity !== "string" || entry.identity !== parsed.identity) {
      return null;
    }
    if (seenIdentities.has(parsed.identity)) return null;
    seenIdentities.add(parsed.identity);
    entries.push(parsed);
  }

  return { schemaVersion: 1, season, materialisedAt: candidate.materialisedAt, entries };
}

// Adapters from v1 blocks. They encode the Task 13a eligibility matrix:
// a midpoint quoted only by the page's row-update time and an undated prior
// settlement produce no observation at all.
export function observationFromFuturesBlock(
  futures: FuturesBlock,
  parserVersion: string,
): Observation | null {
  if (futures.status !== "ok") return null;
  if (futures.basis === "bid-offer-midpoint") {
    return null; // quotedAt is an undocumented row-update time
  }
  if (futures.basis === "prior-settlement") {
    return null; // no settlement session identity in the v1 block
  }
  if (futures.tradedAt === null) return null;
  return {
    series: "mkp-futures",
    provider: FUTURES_PROVIDER,
    market: futures.contractCode,
    basis: "last-trade",
    effective: { kind: "date", on: futures.tradedAt.slice(0, 10) },
    payload: {
      value: futures.price,
      low: null,
      high: null,
      currency: "NZD",
      unit: "NZD/kgMS",
    },
    publishedAt: null,
    firstSeenAt: futures.retrievedAt,
    parserVersion,
  };
}

// A dated announcement row becomes an observation under the season it was
// collected in; first-seen belongs to the run that first retrieved the row.
export function observationFromAnnouncementRow(
  row: AnnouncementRow,
  season: string,
  firstSeenAt: string,
  parserVersion: string,
): Observation {
  return {
    series: "official-forecast",
    provider: "fonterra",
    market: season,
    basis: "announcement",
    effective: { kind: "date", on: row.date },
    payload: {
      value: row.midpoint,
      low: row.low,
      high: row.high,
      currency: "NZD",
      unit: "NZD/kgMS",
    },
    publishedAt: null,
    firstSeenAt,
    parserVersion,
  };
}

export function isoInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return null;
  }
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return value;
}
