// Comparable historical changes (next-release plan, "Comparable changes and
// time rules"): pure functions turning a season history plus the current
// snapshot into dated deltas or explicit suppressions. All calendar
// arithmetic resolves in Pacific/Auckland, including DST boundaries.

import {
  FUTURES_PROVIDER,
  latestRevision,
  type EffectiveTime,
  type HistoryEntry,
  type SeasonHistory,
} from "./history";
import type { MilkSnapshot } from "./snapshot";
import { QUOTE_OLD_AFTER_MS, referenceCause } from "./freshness";

// "Since last week" cuts off seven Auckland calendar days before the endpoint
// anchor and accepts a baseline up to seven further days back.
const LOOKBACK_DAYS = 7;

export type ChangeSuppressionReason =
  | "insufficient-history"
  | "basis-changed"
  | "source-changed"
  | "endpoint-not-fresh";

export interface ObservationPoint {
  effective: EffectiveTime;
  value: number;
}

export interface ChangeTransition {
  on: string;
  from: string;
  to: string;
}

export type ChangeOutcome =
  | {
      status: "comparable";
      endpoint: ObservationPoint;
      baseline: ObservationPoint;
      delta: number;
    }
  | {
      status: "suppressed";
      reason: ChangeSuppressionReason;
      transition: ChangeTransition | null;
      observationsBegin: string | null;
    };

export interface FuturesChanges {
  weekly: ChangeOutcome;
  sinceAnnouncement: ChangeOutcome;
}

export interface AnnouncedPrice {
  on: string;
  value: number;
  low: number | null;
  high: number | null;
}

export interface OfficialRevision {
  current: AnnouncedPrice;
  previous: AnnouncedPrice;
}

// Deltas are only meaningful next to a live-rendered reference; a page with
// no snapshot shows the unavailable panel instead of a "what changed" entry.
export function futuresChanges(input: {
  history: SeasonHistory | null;
  snapshot: MilkSnapshot | null;
  nowMs: number;
}): FuturesChanges | null {
  const { history, snapshot, nowMs } = input;
  if (snapshot === null) return null;

  const futures = snapshot.futures;
  if (futures === undefined || futures.status !== "ok") {
    return both(notFresh());
  }

  const seasonHistory =
    history !== null && history.season === snapshot.season ? history : null;
  // Contract identity is the pool filter; currency and unit need no runtime
  // check because history payloads are structurally NZD/NZD-per-kgMS.
  const pool =
    seasonHistory === null
      ? []
      : seasonHistory.entries.filter(
          (e) => e.series === "mkp-futures" && e.market === futures.contractCode,
        );

  const endpoint = selectEndpoint(pool, futures.basis);
  // Freshness gates precede comparability: an untrustworthy current reference
  // suppresses the summary whatever the baseline looks like.
  if (!endpointTreatedFresh(snapshot, futures, endpoint, nowMs)) {
    return both(notFresh());
  }
  const observationsBegin = earliestDate(seasonHistory);
  if (endpoint === null) {
    return both(insufficient(observationsBegin));
  }

  if (endpoint.basis !== futures.basis || endpoint.provider !== FUTURES_PROVIDER) {
    // The latest historical observation is not the reference being displayed.
    return both(
      diverged(
        endpoint,
        { basis: futures.basis, provider: FUTURES_PROVIDER },
        effectiveDate(endpoint.effective),
        observationsBegin,
      ),
    );
  }

  const weekly = baselineOutcome(
    pool,
    endpoint,
    minusAucklandCalendarDays(bracketOf(endpoint.effective).start, LOOKBACK_DAYS),
    observationsBegin,
  );

  const announcementCutoff =
    seasonHistory === null ? null : announcementCutoffMs(seasonHistory);
  let sinceAnnouncement: ChangeOutcome;
  if (announcementCutoff === null || bracketOf(endpoint.effective).end <= announcementCutoff) {
    // No announcement to anchor on, or nothing observed at/after it yet.
    sinceAnnouncement = insufficient(observationsBegin);
  } else {
    sinceAnnouncement = baselineOutcome(pool, endpoint, announcementCutoff, observationsBegin);
  }

  return { weekly, sinceAnnouncement };
}

// The neutral official entry: only a genuinely revised payload is a revision;
// no-change notices never reach history, so they cannot reset anything.
export function officialRevision(history: SeasonHistory | null): OfficialRevision | null {
  if (history === null) return null;
  const announcements = seasonAnnouncements(history);
  if (announcements.length < 2) return null;

  const latest = announcements[announcements.length - 1];
  const previous = announcements[announcements.length - 2];
  const currentPayload = latestRevision(latest).payload;
  const previousPayload = latestRevision(previous).payload;
  if (
    currentPayload.value === previousPayload.value &&
    currentPayload.low === previousPayload.low &&
    currentPayload.high === previousPayload.high
  ) {
    return null;
  }
  return {
    current: announcedPrice(latest, currentPayload),
    previous: announcedPrice(previous, previousPayload),
  };
}

function announcedPrice(
  entry: HistoryEntry,
  payload: { value: number; low: number | null; high: number | null },
): AnnouncedPrice {
  return {
    on: effectiveDate(entry.effective),
    value: payload.value,
    low: payload.low,
    high: payload.high,
  };
}

// Entries sharing the latest bracket end — same-instant observations.
function latestTied(entries: HistoryEntry[]): HistoryEntry[] {
  let bestEnd = -Infinity;
  for (const e of entries) {
    bestEnd = Math.max(bestEnd, bracketOf(e.effective).end);
  }
  return entries.filter((e) => bracketOf(e.effective).end === bestEnd);
}

function selectEndpoint(pool: HistoryEntry[], displayedBasis: string): HistoryEntry | null {
  if (pool.length === 0) return null;
  // Same-instant observations of different bases are ambiguous; prefer the
  // one matching the displayed reference and let a mismatch suppress below.
  const tied = latestTied(pool);
  return (
    tied.find(
      (e) => e.basis === displayedBasis && e.provider === FUTURES_PROVIDER,
    ) ?? tied[0]
  );
}

function baselineOutcome(
  pool: HistoryEntry[],
  endpoint: HistoryEntry,
  cutoffMs: number,
  observationsBegin: string | null,
): ChangeOutcome {
  const floorMs = minusAucklandCalendarDays(cutoffMs, LOOKBACK_DAYS);
  const endpointStart = bracketOf(endpoint.effective).start;

  // A date-only observation is eligible only once its whole Auckland day has
  // ended at or before the cutoff; never shift it earlier to qualify.
  const candidates = pool.filter(
    (e) => e !== endpoint && bracketOf(e.effective).end <= cutoffMs,
  );
  if (candidates.length === 0) return insufficient(observationsBegin);

  const tied = latestTied(candidates);
  const ambiguous = tied.find(
    (e) => e.basis !== endpoint.basis || e.provider !== endpoint.provider,
  );
  if (ambiguous !== undefined) {
    return diverged(ambiguous, endpoint, effectiveDate(ambiguous.effective), observationsBegin);
  }
  const baseline = tied[0];

  if (bracketOf(baseline.effective).start < floorMs) {
    return insufficient(observationsBegin);
  }
  if (baseline.basis !== endpoint.basis || baseline.provider !== endpoint.provider) {
    return diverged(baseline, endpoint, effectiveDate(baseline.effective), observationsBegin);
  }

  // An intervening basis/provider change (A→B→A) suppresses the pair even
  // though endpoint and baseline match.
  const baselineEnd = bracketOf(baseline.effective).end;
  const intervening = pool.find((e) => {
    if (e === endpoint || e === baseline) return false;
    const b = bracketOf(e.effective);
    return (
      b.end > baselineEnd &&
      b.start < endpointStart &&
      (e.basis !== endpoint.basis || e.provider !== endpoint.provider)
    );
  });
  if (intervening !== undefined) {
    return diverged(endpoint, intervening, effectiveDate(intervening.effective), observationsBegin);
  }

  return {
    status: "comparable",
    endpoint: pointOf(endpoint),
    baseline: pointOf(baseline),
    delta: pointOf(endpoint).value - pointOf(baseline).value,
  };
}

// from/to carry the transition direction the sentence shows: a mismatched
// baseline reads baseline → endpoint; an intervening excursion reads pair →
// excursion.
function diverged(
  from: { basis: string; provider: string },
  to: { basis: string; provider: string },
  on: string,
  observationsBegin: string | null,
): ChangeOutcome {
  const basisChanged = from.basis !== to.basis;
  return {
    status: "suppressed",
    reason: basisChanged ? "basis-changed" : "source-changed",
    transition: {
      on,
      from: basisChanged ? from.basis : from.provider,
      to: basisChanged ? to.basis : to.provider,
    },
    observationsBegin,
  };
}

function announcementCutoffMs(history: SeasonHistory): number | null {
  const announcements = seasonAnnouncements(history);
  return announcements.length === 0
    ? null
    : bracketOf(announcements[announcements.length - 1].effective).start;
}

// The season's priced announcements, oldest bracket first.
function seasonAnnouncements(history: SeasonHistory): HistoryEntry[] {
  return history.entries
    .filter(
      (e) =>
        e.series === "official-forecast" &&
        e.basis === "announcement" &&
        e.market === history.season,
    )
    .sort((a, b) => bracketOf(a.effective).end - bracketOf(b.effective).end);
}

// The shared request-time ladder plus one gate the cards cannot see: an
// effective endpoint past 72 h — a date-only endpoint ages from the start of
// its Auckland day.
function endpointTreatedFresh(
  snapshot: MilkSnapshot,
  futures: Extract<MilkSnapshot["futures"], { status: "ok" }>,
  endpoint: HistoryEntry | null,
  nowMs: number,
): boolean {
  const check = snapshot.checks?.futures;
  const cause = referenceCause(
    check,
    check?.checkedAt ?? futures.retrievedAt,
    futures.quotedAt,
    nowMs,
  );
  if (cause !== null) return false;
  return endpoint === null || nowMs - bracketOf(endpoint.effective).start <= QUOTE_OLD_AFTER_MS;
}

function pointOf(entry: HistoryEntry): ObservationPoint {
  return { effective: entry.effective, value: latestRevision(entry).payload.value };
}

export function effectiveDate(effective: EffectiveTime): string {
  return effective.kind === "date"
    ? effective.on
    : aucklandDateOf(Date.parse(effective.at));
}

export function earliestDate(history: SeasonHistory | null): string | null {
  if (history === null || history.entries.length === 0) return null;
  let best = history.entries[0];
  let bestStart = Infinity;
  for (const e of history.entries) {
    const start = bracketOf(e.effective).start;
    if (start < bestStart) {
      bestStart = start;
      best = e;
    }
  }
  return effectiveDate(best.effective);
}

function insufficient(observationsBegin: string | null): ChangeOutcome {
  return { status: "suppressed", reason: "insufficient-history", transition: null, observationsBegin };
}

function notFresh(): ChangeOutcome {
  return { status: "suppressed", reason: "endpoint-not-fresh", transition: null, observationsBegin: null };
}

function both(outcome: ChangeOutcome): FuturesChanges {
  return { weekly: outcome, sinceAnnouncement: outcome };
}

// Every pass over the pool re-derives brackets; the memo keeps one entry at
// one pair of ICU timezone conversions per request.
const bracketCache = new WeakMap<EffectiveTime, { start: number; end: number }>();

// A date-only observation covers its whole Auckland day, so its bracket runs
// from local midnight to the next; an instant is the point itself.
export function bracketOf(effective: EffectiveTime): { start: number; end: number } {
  const cached = bracketCache.get(effective);
  if (cached !== undefined) return cached;
  let bracket: { start: number; end: number };
  if (effective.kind === "date") {
    bracket = {
      start: aucklandDayStartMs(effective.on),
      end: aucklandDayStartMs(shiftIsoDate(effective.on, 1)),
    };
  } else {
    const at = Date.parse(effective.at);
    bracket = { start: at, end: at };
  }
  bracketCache.set(effective, bracket);
  return bracket;
}

const AKL_TIME_ZONE = "Pacific/Auckland";
let aklFormatter: Intl.DateTimeFormat | null = null;

function formatter(): Intl.DateTimeFormat {
  if (aklFormatter === null) {
    aklFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: AKL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  return aklFormatter;
}

interface AucklandWall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function aucklandWall(ms: number): AucklandWall {
  const parts = formatter().formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((p) => p.type === type);
    return part === undefined ? 0 : parseInt(part.value, 10);
  };
  // Some engines render midnight as hour "24".
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function aucklandOffsetMs(ms: number): number {
  const w = aucklandWall(ms);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - ms;
}

export function aucklandDayStartMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d);
  let candidate = asUtc - aucklandOffsetMs(asUtc);
  // A UTC-midnight guess can land the wrong side of a 02:00/03:00 NZ shift;
  // verify it is local midnight and correct once if not.
  const wall = aucklandWall(candidate);
  if (wall.year !== y || wall.month !== m || wall.day !== d || wall.hour !== 0 || wall.minute !== 0) {
    candidate = asUtc - aucklandOffsetMs(candidate);
  }
  return candidate;
}

export function aucklandDateOf(ms: number): string {
  const w = aucklandWall(ms);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

// Seven calendar days earlier at the same Auckland wall-clock time — 167 or
// 169 elapsed hours across a DST shift, never a flat 168.
export function minusAucklandCalendarDays(ms: number, days: number): number {
  const w = aucklandWall(ms);
  const wallClockMs = ((w.hour * 60 + w.minute) * 60 + w.second) * 1000;
  return aucklandDayStartMs(shiftIsoDate(`${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`, -days)) + wallClockMs;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}
